/**
 * AI-R1D Dante runtime integration — pure, provider-free, persistence-free, in-memory per turn.
 * WRAPS the existing Dante flow (route.ts); replaces nothing. Safety stays authoritative: a safety-active turn gets only a
 * safety coordination representation and never reaches hypothesis/signal production. Output is advisory metadata:
 * nothing here changes a reply, a provider call, a tool, or any stored state, and no signal carries mutation authority.
 */
import { createHash } from "node:crypto";
import type {
  CoachHandoff,
  CoachId,
  CoachImplication,
  CoachSignal,
  CoordinationTrace,
  PrivacyClass,
  UserScopeRef,
} from "./coordination";
import {
  buildCoordinationTrace,
  COORDINATION_SCHEMA_VERSION,
  createCoachHandoff,
  dedupeCoachSignals,
  isCoachSignalActive,
  isSameUserScope,
} from "./coordination";
import type {
  EvidenceNeed,
  EvidenceSourceClass,
  ExecutiveDomain,
  ExecutiveWorkspace,
  RiskLevel,
  StructuredDecisionRecord,
  TaskComplexity,
} from "./executive";
import { buildExecutiveWorkspace, buildStructuredDecisionRecord, createRetrievalState, recordRetrievalRound } from "./executive";
import {
  canPromoteHypothesis,
  classifyIdentifiability,
  deriveClaimLedger,
  deriveUncertaintyClass,
  findCounterEvidence,
} from "./logic";
import type { ClaimLedgerEntry, EvidenceItem, Hypothesis, HypothesisStatus, MissingEvidence } from "./types";
import { activeFacts, retractedSafetyKeys, type ContextFact, type ContextWorkingSet } from "./performance-core/context-working-set";

/** Producer-side validity durations. Documented as policy, not science; not persisted. */
export const SIGNAL_VALIDITY_POLICY = {
  status: "INITIAL_POLICY_NOT_SCIENTIFICALLY_CALIBRATED",
  /** LOW_RECOVERY: short window, never past the user's local-day boundary. */
  lowRecoveryMaxHours: 12,
  /** HIGH_TRAINING_LOAD / UPCOMING_HEAVY_SESSION: until the user's local-day boundary. */
  localDayBoundary: true,
} as const;

// ───────────────────────────── inputs ─────────────────────────────

export type DanteStateSnapshot = {
  recovery: { hasCheckin: boolean; statusLabel: string | null; painIllness: boolean } | null;
  trainingLoad: { state: "green" | "amber" | "red" | string; sessionsLast7Days: number | null } | null;
};

export type DanteTurnInput = {
  runId: string;
  userScope: UserScopeRef;
  /** Coarse flags from the route's existing detectIntent(). */
  intent: { training: boolean; nutrition: boolean; recovery: boolean; health: boolean; supplement: boolean };
  /** Existing causal/performance-attribution detection (extractCausalTargetFromText et al.). */
  causal: boolean;
  /** Message looks like an explanation request ("why", "how", ...). */
  explanation: boolean;
  /** Existing isAgentToolIntent() result. Persistent change still goes through pending-action confirmation. */
  agentToolIntent: boolean;
  /** TRUSTED: existing safety layer triggered OR a persisted safety episode is active. */
  safetyActive: boolean;
  /** Absent in phase A (before context load) and on the tool-loop path. */
  state?: DanteStateSnapshot | null;
  timezone?: string | null;
  scheduledHeavySessionToday?: boolean;
};

export type DanteIntelligenceResult =
  | { status: "FAILED"; reason: string }
  | {
      status: "OK" | "SAFETY_BLOCKED";
      workspace: ExecutiveWorkspace;
      record: StructuredDecisionRecord | null;
      evidence: EvidenceItem[];
      hypotheses: Hypothesis[];
      claims: ClaimLedgerEntry[];
      signals: CoachSignal[];
      handoffs: CoachHandoff[];
      trace: CoordinationTrace | null;
      observability: DanteIntelligenceObservability;
    };

/** Privacy-safe: enums, counts, booleans. No message, no state values, no ids. */
export type DanteIntelligenceObservability = {
  workspaceCreated: boolean;
  reasoningLevel: string;
  routeClasses: string[];
  hypothesisCount: number;
  identifiability: string;
  uncertainty: string;
  signalEmitted: boolean;
  signalType: string;
  relevance: string;
  blockedReason: string;
};

// ───────────────────────────── helpers ─────────────────────────────

/** Opaque, stable, non-reversible scope token. Never the raw user id. */
export const toUserScopeRef = (userId: string): UserScopeRef => `u:${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;

/** Explanation-request cue for `DanteTurnInput.explanation`. Whole words only: "shoulder" is not "should". */
export const EXPLANATION_REQUEST = /\b(?:why|how|explain|should)\b|tại sao|vì sao|giải thích/i;

function localClock(now: Date, timezone?: string | null): { date: string; secondsIntoDay: number } {
  const fmt = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "0";
    return { date: `${p("year")}-${p("month")}-${p("day")}`, secondsIntoDay: Number(p("hour")) * 3600 + Number(p("minute")) * 60 + Number(p("second")) };
  };
  try {
    return fmt(timezone || "UTC");
  } catch {
    return fmt("UTC"); // invalid zone → UTC, never a throw
  }
}

// ponytail: DST-transition days are off by up to an hour; fine for an advisory validity bound.
const endOfLocalDay = (now: Date, c: { secondsIntoDay: number }): Date => new Date(now.getTime() + (86400 - c.secondsIntoDay) * 1000);

/** Defensive extraction from the route's existing userContext (recovery summary). Unknown shapes → null, never a throw. */
export function extractDanteStateSnapshot(userContext: unknown): DanteStateSnapshot {
  const rec = (userContext as { recovery?: unknown } | null)?.recovery as
    | { today?: { hasCheckin?: unknown; status?: unknown; painIllness?: unknown }; trainingLoad?: { state?: unknown; sessionsLast7Days?: unknown } }
    | null
    | undefined;
  if (!rec || typeof rec !== "object") return { recovery: null, trainingLoad: null };
  const today = rec.today;
  const load = rec.trainingLoad;
  return {
    recovery: today
      ? { hasCheckin: today.hasCheckin === true, statusLabel: typeof today.status === "string" ? today.status : null, painIllness: today.painIllness === true || today.painIllness === "minor" || today.painIllness === "yes" }
      : null,
    trainingLoad: load && typeof load.state === "string"
      ? { state: load.state, sessionsLast7Days: typeof load.sessionsLast7Days === "number" ? load.sessionsLast7Days : null }
      : null,
  };
}

// ───────────────────────────── classification ─────────────────────────────

function classifyTurn(i: DanteTurnInput): { domain: ExecutiveDomain; complexity: TaskComplexity; goal: string; risk: RiskLevel } {
  const domain: ExecutiveDomain = i.causal ? "performance" : i.intent.recovery ? "recovery" : i.intent.training ? "training" : i.intent.nutrition ? "nutrition" : "global";
  const complexity: TaskComplexity = i.causal ? "MULTI_CONSTRAINT" : i.explanation ? "EXPLANATION" : "LOOKUP";
  const goal = i.causal ? "EXPLAIN_PERFORMANCE_ATTRIBUTION" : i.agentToolIntent ? "HANDLE_TOOL_ACTION" : i.explanation ? `EXPLAIN_${domain.toUpperCase()}` : `ANSWER_${domain.toUpperCase()}`;
  return { domain, complexity, goal, risk: i.intent.health || i.intent.supplement ? "MODERATE" : "LOW" };
}

function buildNeeds(i: DanteTurnInput, domain: ExecutiveDomain): EvidenceNeed[] {
  const base = { domain, privacyClass: "NORMAL" as PrivacyClass, userScope: i.userScope };
  const needs: EvidenceNeed[] = [];
  if (i.intent.training || i.intent.recovery || i.causal)
    needs.push({ ...base, id: "need:current_state", type: "CURRENT_STATE", materiality: "MATERIAL", authorityRequired: "VERIFIED_STATE", freshness: "CURRENT" });
  if (i.explanation)
    needs.push({ ...base, id: "need:conceptual", type: "CONCEPTUAL_KNOWLEDGE", materiality: "MINOR", authorityRequired: "ANY", freshness: "ANY" });
  return needs;
}

// ───────────────────────────── evidence / hypothesis ─────────────────────────────

const rank = { strong: "STRONG", moderate: "MODERATE", weak: "WEAK" } as const;

/**
 * Existing Dante recovery/training-load outputs are deterministic (computeRecoveryScore, training-load.ts), so they map to
 * DETERMINISTIC_RESULT/VERIFIED. Direction is only set relative to a hypothesis on causal turns; otherwise NEUTRAL.
 */
function mapEvidence(state: DanteStateSnapshot, hypothesisId?: string): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const dir = (limiting: boolean, mild: boolean) => (!hypothesisId ? ("NEUTRAL" as const) : limiting || mild ? ("FOR" as const) : ("AGAINST" as const));
  const item = (id: string, direction: EvidenceItem["direction"], strength: EvidenceItem["strength"], summary: string, ref: string): EvidenceItem => ({
    id, origin: "DETERMINISTIC_RESULT", verification: "VERIFIED", direction, strength, summary, sourceRefs: [ref],
    ...(hypothesisId && { hypothesisId }),
  });
  const r = state.recovery;
  if (r?.hasCheckin && r.statusLabel) {
    const priority = r.statusLabel === "Recovery Priority";
    const moderate = r.statusLabel === "Moderate";
    out.push(item("ev:recovery_status", dir(priority, moderate), priority ? rank.strong : moderate ? rank.weak : rank.moderate, `recovery:${r.statusLabel}`, "athlete_state.recovery.today"));
  }
  const l = state.trainingLoad;
  if (l && (l.state === "red" || l.state === "amber" || l.state === "green")) {
    out.push(item("ev:training_load", dir(l.state === "red", l.state === "amber"), l.state === "red" ? rank.strong : rank.moderate, `training_load:${l.state}`, "athlete_state.recovery.trainingLoad"));
  }
  return out;
}

function buildHypothesis(evidence: EvidenceItem[], state: DanteStateSnapshot): Hypothesis {
  const id = "hyp:performance_limited_by_recovery_or_load";
  const counter = findCounterEvidence(id, evidence);
  const support = evidence.filter((e) => e.direction === "FOR");
  const missing: MissingEvidence[] = [
    // Dante models only recovery/load; sleep quality, technique, nutrition etc. are not ruled out → never fully IDENTIFIED.
    { id: "missing:unmodeled_alternative_causes", description: "alternative causes not modeled", hypothesisId: id },
  ];
  if (!state.recovery?.hasCheckin) missing.push({ id: "missing:recovery_checkin", description: "no recovery check-in today", hypothesisId: id });
  if (!state.trainingLoad?.sessionsLast7Days) missing.push({ id: "missing:logged_sessions", description: "no recent logged sessions", hypothesisId: id });

  const identifiability = classifyIdentifiability([
    { id: "recovery_or_load", support, counter: counter.counterEvidence },
    { id: "unmodeled_alternatives", support: [], counter: [] },
  ]);
  const h: Hypothesis = {
    id, domain: "recovery", question: "WHAT_LIMITS_PERFORMANCE", candidateExplanation: "RECOVERY_OR_LOAD_LIMITING_PERFORMANCE",
    supportingEvidence: support, counterEvidence: counter.counterEvidence, missingEvidence: missing,
    counterEvidenceEvaluated: counter.evaluated, identifiability,
    uncertainty: deriveUncertaintyClass(identifiability, { missingEvidence: true }), status: "EARLY_SIGNAL",
  };
  // Underdetermined / conflicting / unchecked → never promoted past PLAUSIBLE.
  const promotable = (identifiability === "IDENTIFIED" || identifiability === "PARTIALLY_IDENTIFIED") && canPromoteHypothesis(h, "SUPPORTED").allowed;
  const status: HypothesisStatus = promotable ? "SUPPORTED" : support.length ? "PLAUSIBLE" : "EARLY_SIGNAL";
  return { ...h, status };
}

// ───────────────────────────── signal producer ─────────────────────────────

const GEMMA_CTX = (value: string, strength: CoachImplication["strength"] = "SOFT"): CoachImplication => ({
  targetDomain: "NUTRITION", type: "RECOMMENDATION_CONTEXT", value, relevance: "MATERIAL", strength,
});

type Candidate = { type: string; domain: "TRAINING" | "RECOVERY"; refs: string[]; implications: CoachImplication[]; validUntil: Date; privacy: PrivacyClass };

/** Rejects anything that would break the contract. Returns reason codes; empty = valid. */
export function validateProducedSignal(s: CoachSignal, scope: UserScopeRef, now: Date): string[] {
  const bad: string[] = [];
  if (!isSameUserScope(s.userScope, scope)) bad.push("USER_SCOPE_MISMATCH");
  // A user disclosure (H0 cluster D) belongs to no single domain: it is published as GLOBAL, and only as a disclosure.
  const disclosure = s.sourceDomain === "GLOBAL" && s.signalType.startsWith("USER_DISCLOSED_");
  if ((s.sourceCoach !== "DANTE" && !(disclosure && s.sourceCoach === "GEMMA")) || (s.sourceDomain !== "TRAINING" && s.sourceDomain !== "RECOVERY" && !disclosure)) bad.push("NOT_OWNED_DOMAIN");
  if (s.evidenceRefs.length === 0) bad.push("NO_EVIDENCE_REFS");
  if (s.provenance.length === 0) bad.push("NO_PROVENANCE");
  if (!s.uncertainty) bad.push("NO_UNCERTAINTY");
  if (!isCoachSignalActive(s, now)) bad.push("NOT_VALID_NOW");
  if (s.riskFlag) bad.push("PRODUCER_MAY_NOT_SET_RISK_FLAG");
  if (s.implications.some((i) => i.strength === "HARD" || i.hardBasis)) bad.push("HARD_NOT_ALLOWED_FROM_PRODUCER");
  if (!s.implications.some((i) => i.relevance === "MATERIAL" || i.relevance === "CRITICAL")) bad.push("NOT_CROSS_DOMAIN_MATERIAL");
  return bad;
}

/** AI-R1E.2a: id of the weaker user-explicit LOW_RECOVERY a verified one supersedes (same day, same producer). */
const explicitLowRecoveryId = (date: string) => `sig:dante:LOW_RECOVERY_USER_EXPLICIT:${date}`;

function produceSignals(i: Pick<DanteTurnInput, "userScope" | "timezone" | "scheduledHeavySessionToday">, state: DanteStateSnapshot, now: Date): CoachSignal[] {
  const clock = localClock(now, i.timezone);
  const dayEnd = endOfLocalDay(now, clock);
  const privacy: PrivacyClass = state.recovery?.painIllness ? "SENSITIVE" : "NORMAL";
  const candidates: Candidate[] = [];

  if (state.recovery?.hasCheckin && state.recovery.statusLabel === "Recovery Priority")
    candidates.push({
      type: "LOW_RECOVERY", domain: "RECOVERY", refs: ["ev:recovery_status"], implications: [GEMMA_CTX("AVOID_AGGRESSIVE_DEFICIT")], privacy,
      validUntil: new Date(Math.min(now.getTime() + SIGNAL_VALIDITY_POLICY.lowRecoveryMaxHours * 3600_000, dayEnd.getTime())),
    });
  if (state.trainingLoad?.state === "red")
    candidates.push({ type: "HIGH_TRAINING_LOAD", domain: "TRAINING", refs: ["ev:training_load"], implications: [GEMMA_CTX("SUPPORT_RECOVERY_NUTRITION")], validUntil: dayEnd, privacy: "NORMAL" });
  if (i.scheduledHeavySessionToday)
    candidates.push({
      type: "UPCOMING_HEAVY_SESSION", domain: "TRAINING", refs: ["ev:scheduled_session"], validUntil: dayEnd, privacy: "NORMAL",
      implications: [{ targetDomain: "NUTRITION", type: "REASSESSMENT_REQUEST", value: "REVIEW_PRE_TRAINING_FUEL", relevance: "MATERIAL", strength: "SOFT" }],
    });

  const signals = candidates.map((c): CoachSignal => ({
    id: `sig:dante:${c.type}:${clock.date}`,
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    idempotencyKey: `dante:${c.type}:${clock.date}`,
    userScope: i.userScope,
    privacyClass: c.privacy,
    lifecycle: "ACTIVE",
    sourceCoach: "DANTE",
    sourceDomain: c.domain,
    signalType: c.type,
    // Derived from deterministic state, but the nutrition consequence is only context → never above SOFT, never HARD.
    status: c.type === "UPCOMING_HEAVY_SESSION" ? "INFERENCE" : "CROSS_COACH_VERIFIED",
    evidenceRefs: c.refs,
    uncertainty: "MODERATE_SUPPORT",
    identifiability: "PARTIALLY_IDENTIFIED",
    implications: c.implications,
    provenance: ["dante:athlete_state", "dante:deterministic_policy:INITIAL_POLICY"],
    validFrom: now.toISOString(),
    validUntil: c.validUntil.toISOString(),
    ...(c.type === "LOW_RECOVERY" && { supersedes: [explicitLowRecoveryId(clock.date)] }),
  }));
  return dedupeCoachSignals(signals.filter((s) => validateProducedSignal(s, i.userScope, now).length === 0));
}

// ───────────────────────────── H0 cluster D: user disclosures for the other coach ─────────────────────────────

/** Allergen keys of the context working set → closed-vocabulary directive suffix. */
const ALLERGEN_DIRECTIVE: Record<string, string> = {
  fish: "FISH", shellfish: "SHELLFISH", "peanuts or tree nuts": "NUTS", "dairy or lactose": "DAIRY", eggs: "EGGS", soy: "SOY", "gluten or wheat": "GLUTEN", sesame: "SESAME",
};

/** How long a disclosed allergy stays in force across coaches (other disclosures: 24 h). Withdrawn early on retraction. */
export const DISCLOSURE_ALLERGY_DAYS = 90;

/**
 * Safety-relevant facts the USER stated to one coach in this turn → signals the other coach reads, so a disclosure survives
 * the handoff (neither coach sees the other's conversation). Closed vocabulary only — the fact's text never leaves; privacy
 * SENSITIVE (Gemma's clearance), status INFERENCE (user-stated, not verified). A retraction withdraws it
 * (retractedDisclosureTypes + withdrawDisclosureSignals). Pure, never throws.
 */
export function buildDisclosureSignals(a: { userScope: UserScopeRef; context: ContextWorkingSet; timezone?: string | null; source?: CoachId }, now: Date): CoachSignal[] {
  try {
    const source = a.source ?? "DANTE";
    const producer = source.toLowerCase();
    const clock = localClock(now, a.timezone);
    const out: CoachSignal[] = [];
    for (const fact of activeFacts(a.context)) {
      if (fact.relevance !== "SAFETY" || fact.temporal !== "CURRENT" || fact.turnsAgo !== 0) continue;
      const id = fact.key.split(":")[1] ?? "";
      const directive =
        fact.kind === "PED_USE" ? (/insulin/.test(fact.label) ? "INSULIN_HYPO_RISK" : "NO_DRUG_OPTIMISED_DIET")
        : fact.kind === "PREGNANCY" ? "PREGNANCY_AWARE_NUTRITION"
        : fact.kind === "ALLERGY" && ALLERGEN_DIRECTIVE[id] ? `AVOID_ALLERGEN_${ALLERGEN_DIRECTIVE[id]}`
        : fact.kind === "LOW_ENERGY_INTAKE" || fact.key === "CONDITION:eating_disorder" ? "NO_DEFICIT_LOW_INTAKE"
        : fact.key === "CONDITION:kidney_disease" ? "KIDNEY_CONDITION_PROTEIN_BY_DOCTOR"
        : /^CONDITION:(?:type1_diabetes|type2_diabetes|diabetes)$/.test(fact.key) ? "DIABETES_GLUCOSE_AWARE"
        : null;
      if (!directive) continue;
      const signalType = `USER_DISCLOSED_${directive}`;
      // A disclosure belongs to the user, not to one coach: both coaches read it (NUTRITION = Gemma, TRAINING = Dante).
      // The id carries the instant, so re-stating a fact after a withdrawal publishes it again instead of colliding.
      const instant = `${clock.date}T${now.getTime().toString(36)}`;
      const signal: CoachSignal = {
        id: `sig:${producer}:${signalType}:${instant}`,
        schemaVersion: COORDINATION_SCHEMA_VERSION,
        idempotencyKey: `${producer}:${signalType}:${instant}`,
        userScope: a.userScope,
        privacyClass: "SENSITIVE",
        lifecycle: "ACTIVE",
        sourceCoach: source,
        sourceDomain: "GLOBAL",
        signalType,
        status: "INFERENCE",
        evidenceRefs: ["ev:user_disclosure"],
        uncertainty: "WEAK_SUPPORT",
        identifiability: "UNDERDETERMINED",
        implications: (["NUTRITION", "TRAINING"] as const).map((targetDomain) => ({ targetDomain, type: "CONSTRAINT" as const, value: directive, relevance: "MATERIAL" as const, strength: "SOFT" as const })),
        provenance: [`${producer}:user_explicit:conversation`, `${producer}:context_working_set`],
        validFrom: now.toISOString(),
        // ponytail: an allergy is a lasting condition, the rest are present states; saving to the profile is the durable path.
        validUntil: new Date(now.getTime() + (fact.kind === "ALLERGY" ? DISCLOSURE_ALLERGY_DAYS * 24 : 24) * 3600_000).toISOString(),
      };
      if (validateProducedSignal(signal, a.userScope, now).length === 0) out.push(signal);
    }
    return dedupeCoachSignals(out);
  } catch {
    return [];
  }
}

/** Disclosure signal types the user retracts in this message ("I'm not allergic to fish", "I'm eating normally again"). */
export function retractedDisclosureTypes(message: string): string[] {
  return retractedSafetyKeys(message).flatMap((key) => {
    if (key === "ENERGY_INTAKE") return ["USER_DISCLOSED_NO_DEFICIT_LOW_INTAKE"];
    const allergen = ALLERGEN_DIRECTIVE[key.split(":")[1] ?? ""];
    return allergen ? [`USER_DISCLOSED_AVOID_ALLERGEN_${allergen}`] : [];
  });
}

const COACH_NAME: Record<CoachId, string> = { DANTE: "Dante", GEMMA: "Gemma (nutrition coach)" };
const ALLERGEN_ITEM = Object.fromEntries(Object.entries(ALLERGEN_DIRECTIVE).map(([item, suffix]) => [`AVOID_ALLERGEN_${suffix}`, item]));

/**
 * Still-active disclosures from either coach (the other coach's, or this coach's from an earlier conversation) → working-set
 * facts, so they shape this answer exactly like something said earlier in this chat. Only allergies and low intake cross
 * (closed vocabulary back to a canonical label; the user's words never crossed). A fact this conversation already holds —
 * active or superseded by the user here — keeps its local authority and is not overridden. Pure.
 */
export function withDisclosedFacts(context: ContextWorkingSet, signals: CoachSignal[], viewer: CoachId): ContextWorkingSet {
  const known = new Set(context.facts.map((fact) => fact.key));
  const added: ContextFact[] = [];
  for (const signal of signals) {
    if (!signal.signalType.startsWith("USER_DISCLOSED_")) continue;
    const directive = signal.signalType.slice("USER_DISCLOSED_".length);
    const item = ALLERGEN_ITEM[directive];
    const fact: Pick<ContextFact, "key" | "kind" | "label"> | null = item
      ? { key: `ALLERGY:${item}`, kind: "ALLERGY", label: `allergic to ${item}` }
      : directive === "NO_DEFICIT_LOW_INTAKE"
        ? { key: "ENERGY_INTAKE", kind: "LOW_ENERGY_INTAKE", label: "reported eating dangerously little — dangerously low energy intake" }
        : null;
    if (!fact || known.has(fact.key)) continue;
    known.add(fact.key);
    added.push({ ...fact, relevance: "SAFETY", temporal: "CURRENT", origin: "USER_STATEMENT", status: "ACTIVE", turnsAgo: 1, quote: "", via: signal.sourceCoach === viewer ? "said in an earlier chat" : `told ${COACH_NAME[signal.sourceCoach]}` });
  }
  return added.length ? { ...context, facts: [...added, ...context.facts] } : context;
}

// ───────────────────────────── AI-R1E.2a early-exit signal coverage ─────────────────────────────

/** Deterministic Dante exits that return before the post-context step. */
export type EarlyExitClass = "HARD_SAFETY" | "DETERMINISTIC_COACHING" | "CASUAL" | "CORRECTION" | "N_OF_1" | "RISK_ACCUMULATOR" | "OTHER";
export type EarlyExitPublication = "FORBIDDEN" | "ALLOWED_WITH_VERIFIED_STATE" | "ALLOWED_AS_USER_EXPLICIT_ONLY" | "NOT_RELEVANT";

/**
 * Policy table. Only the two coaching exits publish: verified Athlete/recovery state first, a user-explicit INFERENCE only when
 * no check-in exists today. Safety and N-of-1 are FORBIDDEN (safety stays absolute); the rest carry no cross-coach meaning.
 */
export const EARLY_EXIT_PUBLICATION: Record<EarlyExitClass, EarlyExitPublication> = {
  HARD_SAFETY: "FORBIDDEN",
  DETERMINISTIC_COACHING: "ALLOWED_WITH_VERIFIED_STATE",
  RISK_ACCUMULATOR: "ALLOWED_WITH_VERIFIED_STATE",
  N_OF_1: "FORBIDDEN",
  CASUAL: "NOT_RELEVANT",
  CORRECTION: "NOT_RELEVANT",
  OTHER: "NOT_RELEVANT",
};

/**
 * Narrow on purpose: an explicit statement that sleep was poor/short or recovery is low. "I'm tired" / "bad day" never match.
 * ponytail: regex, EN + a little VI; upgrade to the semantic interpreter if recall matters.
 */
export function statesLowRecoveryExplicitly(message: string): boolean {
  if (/\bslept\s+(?:very\s+|really\s+)?(?:badly|poorly|terribly)\b|\brecovery\b.{0,24}\b(?:low|poor|bad|terrible)\b|ngủ\s+(?:rất\s+)?(?:tệ|dở|kém)|hồi phục\s+(?:kém|thấp)/i.test(message)) return true;
  const hours = /\bslept\s+(?:only\s+|just\s+)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/i.exec(message);
  return hours !== null && Number(hours[1]) < 6;
}

/** Cheap pre-check so the route only reads recovery state for turns that can publish. */
export const earlyExitMayPublish = (a: { exit: EarlyExitClass; safetyActive: boolean; recoveryIntent: boolean; message: string }): boolean =>
  !a.safetyActive && EARLY_EXIT_PUBLICATION[a.exit] === "ALLOWED_WITH_VERIFIED_STATE" && (a.recoveryIntent || statesLowRecoveryExplicitly(a.message));

/**
 * Pure, never throws. Verified recovery/load state → the normal validated signals (CROSS_COACH_VERIFIED where produceSignals says so).
 * No check-in today + explicit statement → LOW_RECOVERY as INFERENCE with USER_EXPLICIT provenance, never CROSS_COACH_VERIFIED.
 * A check-in that does not say "Recovery Priority" outranks the user's words: no explicit signal.
 */
export function buildEarlyExitSignals(
  a: { userScope: UserScopeRef; exit: EarlyExitClass; safetyActive: boolean; recoveryIntent: boolean; message: string; state?: DanteStateSnapshot | null; timezone?: string | null },
  now: Date,
): CoachSignal[] {
  try {
    if (!earlyExitMayPublish(a)) return [];
    const state = a.state ?? null;
    const verified = state ? produceSignals(a, state, now) : [];
    if (verified.length) return verified;
    if (state?.recovery?.hasCheckin || !statesLowRecoveryExplicitly(a.message)) return [];
    const clock = localClock(now, a.timezone);
    const explicit: CoachSignal = {
      id: explicitLowRecoveryId(clock.date),
      schemaVersion: COORDINATION_SCHEMA_VERSION,
      idempotencyKey: `dante:LOW_RECOVERY:USER_EXPLICIT:${clock.date}`,
      userScope: a.userScope,
      privacyClass: "NORMAL",
      lifecycle: "ACTIVE",
      sourceCoach: "DANTE",
      sourceDomain: "RECOVERY",
      signalType: "LOW_RECOVERY",
      status: "INFERENCE",
      evidenceRefs: ["ev:user_explicit_recovery"],
      uncertainty: "WEAK_SUPPORT",
      identifiability: "UNDERDETERMINED",
      implications: [GEMMA_CTX("AVOID_AGGRESSIVE_DEFICIT", "CONTEXTUAL")],
      provenance: ["dante:user_explicit:current_turn", "dante:deterministic_policy:INITIAL_POLICY"],
      validFrom: now.toISOString(),
      validUntil: new Date(Math.min(now.getTime() + SIGNAL_VALIDITY_POLICY.lowRecoveryMaxHours * 3600_000, endOfLocalDay(now, clock).getTime())).toISOString(),
    };
    return validateProducedSignal(explicit, a.userScope, now).length === 0 ? [explicit] : [];
  } catch {
    return [];
  }
}

// ───────────────────────────── orchestration ─────────────────────────────

/** Never throws. A failure returns {status:"FAILED"} and the route continues with its existing behaviour. */
export function buildDanteIntelligence(i: DanteTurnInput, now: Date): DanteIntelligenceResult {
  try {
    return build(i, now);
  } catch {
    return { status: "FAILED", reason: "INTELLIGENCE_CONSTRUCTION_FAILED" };
  }
}

function build(i: DanteTurnInput, now: Date): DanteIntelligenceResult {
  const cls = classifyTurn(i);
  const needs = buildNeeds(i, cls.domain);
  const state = i.state ?? null;
  const stateless = !state || (!state.recovery && !state.trainingLoad);

  // Safety is authoritative: workspace only (CRITICAL risk → ESCALATE_SAFETY), no evidence/hypotheses/signals.
  if (i.safetyActive) {
    const workspace = buildExecutiveWorkspace({ runId: i.runId, userScope: i.userScope, currentGoal: "SAFETY_COORDINATION", activeDomain: cls.domain, complexity: "LOOKUP", trustedSafetyCritical: true }, now);
    return finish("SAFETY_BLOCKED", workspace, [], [], [], [], null, "SAFETY_BLOCK");
  }

  const evidence = state ? mapEvidence(state, i.causal ? "hyp:performance_limited_by_recovery_or_load" : undefined) : [];
  const hypotheses = i.causal && state ? [buildHypothesis(evidence, state)] : [];

  // Phase B resolves the current-state need from Athlete State context; phase A leaves it open (advisory).
  let retrieval = createRetrievalState(needs.map((n) => n.id), 3);
  if (!stateless && evidence.length) retrieval = recordRetrievalRound(retrieval, { evidenceRefs: evidence.map((e) => e.id), resolvedNeedIds: ["need:current_state"], contradictionCount: 0, informationGain: "MEDIUM" });

  const signals = stateless ? [] : produceSignals(i, state!, now);
  const handoff = signals.length
    ? createCoachHandoff(
        { id: `ho:dante:${signals[0].idempotencyKey.replace(/[^A-Za-z0-9:_.-]/g, "_")}`, idempotencyKey: `ho:${signals.map((s) => s.signalType).join("+")}`, userScope: i.userScope, fromCoach: "DANTE", toCoach: "GEMMA", reason: "DANTE_CONTEXT_FOR_NUTRITION", requestedCapability: "ADAPT_MEAL_STRATEGY", signals },
        now,
      )
    : null;
  const traceRes = signals.length
    ? buildCoordinationTrace({ traceId: `tr:${i.runId}`, target: "GEMMA", signals, ...(handoff && { handoff }), decisionRefs: [] }, now)
    : null;

  const workspace = buildExecutiveWorkspace(
    {
      runId: i.runId, userScope: i.userScope, currentGoal: cls.goal, activeDomain: cls.domain, complexity: cls.complexity, declaredRisk: cls.risk,
      evidence, hypotheses, needs, retrieval, signals, viewer: "DANTE", handoffRefs: handoff ? [handoff.id] : [],
      availability: stateless ? undefined : { CURRENT_ATHLETE_STATE: { available: true } },
      persistentMutationRequested: i.agentToolIntent, deterministicResolved: false,
    },
    now,
  );
  return finish("OK", workspace, evidence, hypotheses, signals, handoff ? [handoff] : [], traceRes?.ok ? traceRes.trace : null, "");
}

function finish(
  status: "OK" | "SAFETY_BLOCKED",
  workspace: ExecutiveWorkspace,
  evidence: EvidenceItem[],
  hypotheses: Hypothesis[],
  signals: CoachSignal[],
  handoffs: CoachHandoff[],
  trace: CoordinationTrace | null,
  blocked: string,
): DanteIntelligenceResult {
  const rec = buildStructuredDecisionRecord(workspace);
  const routeClasses = [...new Set(workspace.routeDecisions.flatMap((r) => (r.source ? [r.source as EvidenceSourceClass] : [])))];
  const h = hypotheses[0];
  const relevance = signals.length ? (signals.some((s) => s.implications.some((x) => x.relevance === "CRITICAL")) ? "CRITICAL" : "MATERIAL") : "NONE";
  return {
    status, workspace, record: rec.ok ? rec.record : null, evidence, hypotheses,
    claims: deriveClaimLedger(evidence, hypotheses), signals, handoffs, trace,
    observability: {
      workspaceCreated: true,
      reasoningLevel: workspace.reasoningBudget.level,
      routeClasses,
      hypothesisCount: hypotheses.length,
      identifiability: h?.identifiability ?? "NONE",
      uncertainty: h?.uncertainty ?? "NONE",
      signalEmitted: signals.length > 0,
      signalType: signals.map((s) => s.signalType).join(",") || "NONE",
      relevance,
      blockedReason: blocked || workspace.blockedBy[0]?.code || "NONE",
    },
  };
}
