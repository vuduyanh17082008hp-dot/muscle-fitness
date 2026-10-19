/**
 * AI-R1B.1/B.2 Dante ↔ Gemma coordination CONTRACT — pure types + pure helpers.
 * Ephemeral/derived only: no persistence, no runtime imports, no mutation authority.
 * Reuses the R1B core (EvidenceItem ids, UncertaintyClass, IdentifiabilityStatus, ClaimLedgerEntry).
 */
import type { ClaimLedgerEntry, IdentifiabilityStatus, UncertaintyClass } from "./types";

/** Every coordination object that may cross a process boundary carries this. No migration machinery yet. */
export const COORDINATION_SCHEMA_VERSION = 1 as const;
export type CoordinationSchemaVersion = typeof COORDINATION_SCHEMA_VERSION;

/** Opaque, same-user scope token. Never a real user id; never logged raw. */
export type UserScopeRef = string;
export const isSameUserScope = (a: UserScopeRef, b: UserScopeRef): boolean => a.length > 0 && a === b;

export type PrivacyClass = "NORMAL" | "SENSITIVE" | "MEDICAL";
const PRIVACY_ORDER: readonly PrivacyClass[] = ["NORMAL", "SENSITIVE", "MEDICAL"];
/** Explicit rank: NORMAL=0 < SENSITIVE=1 < MEDICAL=2. Never compare privacy strings lexically. */
export const privacyRank = (c: PrivacyClass): number => PRIVACY_ORDER.indexOf(c);
/** Strictest class wins; privacy can only ratchet up through projection/handoff/trace. */
export const maxPrivacyClass = (...c: PrivacyClass[]): PrivacyClass =>
  c.reduce<PrivacyClass>((a, b) => (PRIVACY_ORDER.indexOf(b) > PRIVACY_ORDER.indexOf(a) ? b : a), "NORMAL");

/** Lifecycle is separate from epistemic status: a SUPPORTED signal can be SUPERSEDED. */
export type SignalLifecycle = "ACTIVE" | "SUPERSEDED" | "EXPIRED" | "WITHDRAWN" | "CONSUMED";

export type CoachId = "DANTE" | "GEMMA";
export type CoachDomain = "TRAINING" | "RECOVERY" | "NUTRITION" | "PERFORMANCE" | "GLOBAL";
export const COACH_DOMAINS: readonly CoachDomain[] = ["TRAINING", "RECOVERY", "NUTRITION", "PERFORMANCE", "GLOBAL"];

/** Domain ownership. Dante: training, recovery, performance and platform-wide (GLOBAL). Gemma: nutrition. */
const DOMAIN_OWNER: Record<CoachDomain, CoachId> = { TRAINING: "DANTE", RECOVERY: "DANTE", NUTRITION: "GEMMA", PERFORMANCE: "DANTE", GLOBAL: "DANTE" };
export const ownerOfDomain = (d: CoachDomain): CoachId => DOMAIN_OWNER[d];

/**
 * Producer-side standing of a signal. Deliberately has no "VERIFIED_FACT":
 * COACH_SIGNAL != VERIFIED_FACT. CROSS_COACH_VERIFIED = grounded in verified state by the source coach.
 */
export type CoachSignalStatus = "CROSS_COACH_VERIFIED" | "SUPPORTED_HYPOTHESIS" | "INFERENCE" | "HEURISTIC";

/** Conceptual order, highest first: see AUTHORITY_ORDER. */
export type SignalAuthority =
  | "SAFETY"
  | "PLATFORM_POLICY"
  | "DETERMINISTIC_TRUTH"
  | "CURRENT_VERIFIED_ATHLETE_STATE"
  | "USER_EXPLICIT"
  | "CROSS_COACH_VERIFIED_SIGNAL"
  | "SUPPORTED_HYPOTHESIS"
  | "INFERENCE"
  | "HEURISTIC";

const AUTHORITY_ORDER: readonly SignalAuthority[] = [
  "SAFETY",
  "PLATFORM_POLICY",
  "DETERMINISTIC_TRUTH",
  "CURRENT_VERIFIED_ATHLETE_STATE",
  "USER_EXPLICIT",
  "CROSS_COACH_VERIFIED_SIGNAL",
  "SUPPORTED_HYPOTHESIS",
  "INFERENCE",
  "HEURISTIC",
];

/** >0 when `a` outranks `b`, <0 when `b` outranks `a`, 0 when equal. An ordering, not a probability. */
export function compareSignalAuthority(a: SignalAuthority, b: SignalAuthority): number {
  return AUTHORITY_ORDER.indexOf(b) - AUTHORITY_ORDER.indexOf(a);
}

const STATUS_AUTHORITY: Record<CoachSignalStatus, SignalAuthority> = {
  CROSS_COACH_VERIFIED: "CROSS_COACH_VERIFIED_SIGNAL",
  SUPPORTED_HYPOTHESIS: "SUPPORTED_HYPOTHESIS",
  INFERENCE: "INFERENCE",
  HEURISTIC: "HEURISTIC",
};
/** A coach signal can never exceed CROSS_COACH_VERIFIED_SIGNAL. */
export const coachSignalAuthority = (s: Pick<CoachSignal, "status">): SignalAuthority => STATUS_AUTHORITY[s.status];

export type CrossDomainRelevance = "IRRELEVANT" | "OPTIONAL" | "MATERIAL" | "CRITICAL";
const RELEVANCE_ORDER: readonly CrossDomainRelevance[] = ["IRRELEVANT", "OPTIONAL", "MATERIAL", "CRITICAL"];

/** No MUTATION type exists on purpose: an implication is context for the target specialist, never a command. */
export type CoachImplicationType = "RECOMMENDATION_CONTEXT" | "CONSTRAINT" | "CAUTION" | "REASSESSMENT_REQUEST";

/** HARD is reserved for trusted authority; see effectiveImplicationStrength. */
export type ImplicationStrength = "HARD" | "STRONG" | "SOFT" | "CONTEXTUAL";
export type TrustedHardBasis = "SAFETY" | "MEDICAL_BLOCK" | "ALLERGY_EXCLUSION" | "DETERMINISTIC_POLICY" | "PLATFORM_POLICY";

export type CoachImplication = {
  targetDomain: CoachDomain;
  type: CoachImplicationType;
  /** Extensible token, e.g. AVOID_AGGRESSIVE_DEFICIT. Interpreted only by the target specialist. */
  value: string;
  /** Producer-declared; runtime relevance policy comes later. */
  relevance: CrossDomainRelevance;
  /** Producer-declared; defaults CONTEXTUAL. Not trusted as-is: use effectiveImplicationStrength. */
  strength?: ImplicationStrength;
  /** Trusted authority category backing a HARD claim (e.g. ALLERGY_EXCLUSION). */
  hardBasis?: TrustedHardBasis;
};

export type SignalValidity = { validFrom: string; validUntil: string };

export type CoachSignal = SignalValidity & {
  id: string;
  schemaVersion: CoordinationSchemaVersion;
  /** Same key + same user scope = same meaning; duplicates must not create duplicate active meaning. */
  idempotencyKey: string;
  userScope: UserScopeRef;
  privacyClass: PrivacyClass;
  lifecycle: SignalLifecycle;
  /** Ids this signal replaces (same coach + scope only). Old signals are kept, marked SUPERSEDED. */
  supersedes?: string[];
  supersededBy?: string;
  /** Existing safety layers stay authoritative; this only carries their result into coordination. */
  riskFlag?: "MEDICAL_RISK" | "SAFETY_BLOCK";
  sourceCoach: CoachId;
  sourceDomain: CoachDomain;
  /** Extensible, e.g. LOW_RECOVERY, LOW_CARBOHYDRATE_AVAILABILITY. */
  signalType: string;
  status: CoachSignalStatus;
  /** EvidenceItem ids from the R1B core. */
  evidenceRefs: string[];
  uncertainty: UncertaintyClass;
  identifiability: IdentifiabilityStatus;
  implications: CoachImplication[];
  /** Provenance trail; never dropped when a signal is projected or handed off. */
  provenance: string[];
};

/** Half-open [validFrom, validUntil). Unparseable bounds → inactive (fail closed). */
export function isCoachSignalActive(signal: SignalValidity, now: Date): boolean {
  const t = now.getTime();
  const from = Date.parse(signal.validFrom);
  const until = Date.parse(signal.validUntil);
  return Number.isFinite(from) && Number.isFinite(until) && from <= t && t < until;
}

/** Participates in current coordination: lifecycle ACTIVE and inside its validity window. */
export const isSignalActive = (s: CoachSignal, now: Date): boolean => s.lifecycle === "ACTIVE" && isCoachSignalActive(s, now);

/** HARD only when a trusted basis is declared AND the signal is grounded (CROSS_COACH_VERIFIED); models can't self-declare HARD. */
export function effectiveImplicationStrength(signal: Pick<CoachSignal, "status">, i: CoachImplication): ImplicationStrength {
  const declared = i.strength ?? "CONTEXTUAL";
  if (declared !== "HARD") return declared;
  return i.hardBasis && signal.status === "CROSS_COACH_VERIFIED" ? "HARD" : "STRONG";
}

type Idempotent = { idempotencyKey: string; userScope: UserScopeRef };
export const isDuplicateSignal = (a: Idempotent, b: Idempotent): boolean =>
  a.idempotencyKey === b.idempotencyKey && isSameUserScope(a.userScope, b.userScope);
export const isDuplicateHandoff = isDuplicateSignal;
/** First publication wins; later duplicates are dropped. */
export const dedupeCoachSignals = <T extends Idempotent>(items: T[]): T[] =>
  items.filter((x, i) => items.findIndex((y) => isDuplicateSignal(x, y)) === i);

/** Marks older signals SUPERSEDED by an ACTIVE newer one. Nothing is deleted; provenance/evidence stay intact. */
export function applySupersession(signals: CoachSignal[]): CoachSignal[] {
  return signals.map((old) => {
    if (old.lifecycle !== "ACTIVE") return old;
    const by = signals.find(
      (n) =>
        n.lifecycle === "ACTIVE" &&
        n.id !== old.id &&
        n.sourceCoach === old.sourceCoach &&
        isSameUserScope(n.userScope, old.userScope) &&
        n.supersedes?.includes(old.id),
    );
    return by ? { ...old, lifecycle: "SUPERSEDED", supersededBy: by.id } : old;
  });
}

export type CoordinationGate = "PROCEED" | "BLOCK_NORMAL_COORDINATION";
/** Any active unresolved medical/safety risk for this user blocks normal cross-domain optimisation. */
export function evaluateCoordinationGate(signals: CoachSignal[], scope: UserScopeRef, now: Date): CoordinationGate {
  return signals.some((s) => s.riskFlag && isSameUserScope(s.userScope, scope) && isSignalActive(s, now))
    ? "BLOCK_NORMAL_COORDINATION"
    : "PROCEED";
}

/** Signal as the target coach sees it: only implications for that coach's domains, provenance intact. */
export function projectSignalForTarget(
  signal: CoachSignal,
  target: CoachId,
  opts: { privacyClass?: PrivacyClass } = {},
): CoachSignal {
  return {
    ...signal,
    privacyClass: maxPrivacyClass(signal.privacyClass, opts.privacyClass ?? "NORMAL"),
    evidenceRefs: [...signal.evidenceRefs],
    provenance: [...signal.provenance],
    implications: signal.implications.filter((i) => ownerOfDomain(i.targetDomain) === target),
  };
}

/** Pure, LLM-free. Inactive, self-sourced, or implication-less signals are IRRELEVANT. */
export function evaluateCrossDomainRelevance(signal: CoachSignal, target: CoachId, now: Date): CrossDomainRelevance {
  if (signal.sourceCoach === target || !isSignalActive(signal, now)) return "IRRELEVANT";
  return projectSignalForTarget(signal, target).implications.reduce<CrossDomainRelevance>(
    (best, i) => (RELEVANCE_ORDER.indexOf(i.relevance) > RELEVANCE_ORDER.indexOf(best) ? i.relevance : best),
    "IRRELEVANT",
  );
}

/** Ledger projection of a coach signal. Never VERIFIED / VERIFIED_FACT, whatever the status. */
export function coachSignalToClaim(signal: CoachSignal): ClaimLedgerEntry {
  return {
    id: `claim:signal:${signal.id}`,
    claimType: signal.status === "SUPPORTED_HYPOTHESIS" ? "HYPOTHESIS" : "INFERENCE",
    statement: signal.signalType,
    verification: "UNRESOLVED",
    evidenceIds: [...signal.evidenceRefs],
  };
}

/**
 * Invariants DANTE_DOES_NOT_MUTATE_NUTRITION / GEMMA_DOES_NOT_MUTATE_TRAINING.
 * Always denied; mutation requires the existing confirmation boundary.
 */
export function canImplicationAuthorizeMutation(_implication: CoachImplication): { allowed: false; reasons: string[] } {
  return {
    allowed: false,
    reasons: ["COACH_IMPLICATION_IS_CONTEXT_ONLY", "PERSISTENT_MUTATION_REQUIRES_EXISTING_CONFIRMATION_BOUNDARY"],
  };
}

/** A cross-domain disagreement is a CONFLICT/CONSTRAINT for the target specialist to resolve; the source never wins by default. */
export type CoachConflict = {
  kind: "CONFLICT" | "CONSTRAINT";
  targetDomain: CoachDomain;
  signalIds: string[];
  /** Deterministic/state refs the signal collides with (e.g. calorie target nearly exhausted). */
  constraintRefs: string[];
  resolvedBy: CoachId;
  winner: null;
};

export function representConflict(
  kind: CoachConflict["kind"],
  targetDomain: CoachDomain,
  signalIds: string[],
  constraintRefs: string[],
): CoachConflict {
  return { kind, targetDomain, signalIds, constraintRefs, resolvedBy: ownerOfDomain(targetDomain), winner: null };
}

/** Structured request. No conversation text by construction: ids, enums, timestamps only. */
export type CoachHandoff = {
  id: string;
  schemaVersion: CoordinationSchemaVersion;
  idempotencyKey: string;
  userScope: UserScopeRef;
  /** Strictest class among the handed-off signals. */
  privacyClass: PrivacyClass;
  fromCoach: CoachId;
  toCoach: CoachId;
  reason: string;
  signalIds: string[];
  /** e.g. ADAPT_MEAL_STRATEGY, REASSESS_TRAINING_READINESS. */
  requestedCapability: string;
  createdAt: string;
  expiresAt: string;
};

/** Returns null unless at least one active signal is MATERIAL+ for the target. Expiry is clamped to the signals' validity. */
export function createCoachHandoff(
  args: {
    id: string;
    idempotencyKey: string;
    userScope: UserScopeRef;
    fromCoach: CoachId;
    toCoach: CoachId;
    reason: string;
    requestedCapability: string;
    signals: CoachSignal[];
  },
  now: Date,
): CoachHandoff | null {
  if (args.fromCoach === args.toCoach) return null;
  // Other users' signals are never consumable. While a risk is active, only risk signals are handed off.
  const own = args.signals.filter((s) => isSameUserScope(s.userScope, args.userScope));
  const blocked = evaluateCoordinationGate(own, args.userScope, now) === "BLOCK_NORMAL_COORDINATION";
  const eligible = own.filter((s) => {
    if (s.sourceCoach !== args.fromCoach || (blocked && !s.riskFlag)) return false;
    const r = evaluateCrossDomainRelevance(s, args.toCoach, now);
    return r === "MATERIAL" || r === "CRITICAL";
  });
  if (eligible.length === 0) return null;
  const expiresAt = new Date(Math.min(...eligible.map((s) => Date.parse(s.validUntil)))).toISOString();
  return {
    id: args.id,
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    idempotencyKey: args.idempotencyKey,
    userScope: args.userScope,
    privacyClass: maxPrivacyClass(...eligible.map((s) => s.privacyClass)),
    fromCoach: args.fromCoach,
    toCoach: args.toCoach,
    reason: args.reason,
    signalIds: eligible.map((s) => s.id),
    requestedCapability: args.requestedCapability,
    createdAt: now.toISOString(),
    expiresAt,
  };
}

export const isCoachHandoffActive = (h: CoachHandoff, now: Date): boolean =>
  isCoachSignalActive({ validFrom: h.createdAt, validUntil: h.expiresAt }, now);

// ---------------------------------------------------------------------------
// AI-R1B.2: acknowledgement, conflict resolution, replay trace. Pure; no state is mutated or persisted.
// ---------------------------------------------------------------------------

export type AckStatus = "RECEIVED" | "CONSUMED" | "REJECTED" | "EXPIRED" | "SUPERSEDED";

/** Handoff-level state. Independent of the underlying signal's lifecycle: a CONSUMED handoff leaves its signal ACTIVE. */
export type HandoffAcknowledgement = {
  schemaVersion: CoordinationSchemaVersion;
  handoffId: string;
  receivedBy: CoachId;
  status: AckStatus;
  consumedAt?: string;
  rejectionReason?: string;
  resultingDecisionRefs?: string[];
};

export function acknowledgeHandoff(
  handoff: CoachHandoff,
  args: { receivedBy: CoachId; userScope: UserScopeRef; status: AckStatus; rejectionReason?: string; resultingDecisionRefs?: string[] },
  now: Date,
): { ok: true; ack: HandoffAcknowledgement } | { ok: false; reason: string } {
  if (args.receivedBy !== handoff.toCoach) return { ok: false, reason: "WRONG_RECIPIENT" };
  if (!isSameUserScope(args.userScope, handoff.userScope)) return { ok: false, reason: "CROSS_USER_SCOPE" };
  if (args.status === "REJECTED" && !args.rejectionReason) return { ok: false, reason: "REJECTION_REASON_REQUIRED" };
  if (args.status === "CONSUMED" && !isCoachHandoffActive(handoff, now)) return { ok: false, reason: "HANDOFF_NOT_ACTIVE" };
  return {
    ok: true,
    ack: {
      schemaVersion: COORDINATION_SCHEMA_VERSION,
      handoffId: handoff.id,
      receivedBy: args.receivedBy,
      status: args.status,
      ...(args.status === "CONSUMED" && { consumedAt: now.toISOString() }),
      ...(args.status === "REJECTED" && { rejectionReason: args.rejectionReason }),
      ...(args.status === "CONSUMED" && args.resultingDecisionRefs && { resultingDecisionRefs: [...args.resultingDecisionRefs] }),
    },
  };
}

export type ConflictResolution =
  | "SAFETY_OVERRIDES"
  | "DETERMINISTIC_STATE_OVERRIDES"
  | "USER_DECISION_REQUIRED"
  | "COMPROMISE_WITHIN_CONSTRAINTS"
  | "NO_ACTION";

export type CoordinationConflict = {
  schemaVersion: CoordinationSchemaVersion;
  conflictId: string;
  signalRefs: string[];
  sharedGoalRefs: string[];
  hardConstraintRefs: string[];
  resolution: ConflictResolution;
  explanationCode: string;
  outcomeRef?: string;
};

/**
 * Deterministic policy, not an optimiser. Order: safety → platform/deterministic/verified state →
 * explicit user decision → soft tradeoff needing persistent change (ask user) → compromise → no action.
 */
export function resolveCoordinationConflict(args: {
  conflictId: string;
  parties: { ref: string; authority: SignalAuthority }[];
  sharedGoalRefs?: string[];
  hardConstraintRefs?: string[];
  requiresPersistentChange?: boolean;
  compromiseWithinConstraints?: boolean;
  outcomeRef?: string;
}): CoordinationConflict {
  const has = (...a: SignalAuthority[]) => args.parties.some((p) => a.includes(p.authority));
  const [resolution, explanationCode]: [ConflictResolution, string] =
    args.parties.length < 2 ? ["NO_ACTION", "NO_CONFLICT"]
    : has("SAFETY") ? ["SAFETY_OVERRIDES", "SAFETY_BLOCK_PRESENT"]
    : has("PLATFORM_POLICY", "DETERMINISTIC_TRUTH", "CURRENT_VERIFIED_ATHLETE_STATE") ? ["DETERMINISTIC_STATE_OVERRIDES", "DETERMINISTIC_OR_VERIFIED_STATE_PREVAILS"]
    : has("USER_EXPLICIT") ? ["NO_ACTION", "USER_EXPLICIT_PREVAILS"]
    : args.requiresPersistentChange ? ["USER_DECISION_REQUIRED", "SOFT_TRADEOFF_NEEDS_PERSISTENT_CHANGE"]
    : args.compromiseWithinConstraints ? ["COMPROMISE_WITHIN_CONSTRAINTS", "COMPROMISE_KEEPS_HARD_CONSTRAINTS"]
    : ["NO_ACTION", "NO_RESOLUTION_NEEDED"];
  return {
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    conflictId: args.conflictId,
    signalRefs: args.parties.map((p) => p.ref),
    sharedGoalRefs: [...(args.sharedGoalRefs ?? [])],
    hardConstraintRefs: [...(args.hardConstraintRefs ?? [])],
    resolution,
    explanationCode,
    ...(args.outcomeRef && { outcomeRef: args.outcomeRef }),
  };
}

/** Structured refs + reason codes only. No chat, no chain-of-thought. */
export type CoordinationTrace = {
  schemaVersion: CoordinationSchemaVersion;
  traceId: string;
  userScope: UserScopeRef;
  privacyClass: PrivacyClass;
  signals: { signalId: string; lifecycle: SignalLifecycle; relevance: CrossDomainRelevance; reasonCode: string }[];
  handoffId?: string;
  acknowledgement?: { handoffId: string; status: AckStatus };
  conflictId?: string;
  decisionRefs: string[];
  outcomeRef?: string;
};

export const REF_RE = /^[A-Za-z0-9:_.-]{1,128}$/;

/** Fails (rather than copies) on mixed user scopes or on any ref that looks like free text. */
export function buildCoordinationTrace(
  args: {
    traceId: string;
    target: CoachId;
    signals: CoachSignal[];
    handoff?: CoachHandoff;
    acknowledgement?: HandoffAcknowledgement;
    conflict?: CoordinationConflict;
    decisionRefs?: string[];
    outcomeRef?: string;
  },
  now: Date,
): { ok: true; trace: CoordinationTrace } | { ok: false; reason: string } {
  const scope = args.signals[0]?.userScope;
  if (!scope) return { ok: false, reason: "NO_SIGNALS" };
  if (args.signals.some((s) => !isSameUserScope(s.userScope, scope)) || (args.handoff && !isSameUserScope(args.handoff.userScope, scope)))
    return { ok: false, reason: "CROSS_USER_SCOPE" };
  const trace: CoordinationTrace = {
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    traceId: args.traceId,
    userScope: scope,
    privacyClass: maxPrivacyClass(...args.signals.map((s) => s.privacyClass), args.handoff?.privacyClass ?? "NORMAL"),
    signals: args.signals.map((s) => ({
      signalId: s.id,
      lifecycle: s.lifecycle,
      relevance: evaluateCrossDomainRelevance(s, args.target, now),
      reasonCode: s.signalType,
    })),
    ...(args.handoff && { handoffId: args.handoff.id }),
    ...(args.acknowledgement && { acknowledgement: { handoffId: args.acknowledgement.handoffId, status: args.acknowledgement.status } }),
    ...(args.conflict && { conflictId: args.conflict.conflictId }),
    decisionRefs: [...(args.decisionRefs ?? args.acknowledgement?.resultingDecisionRefs ?? [])],
    ...(args.outcomeRef && { outcomeRef: args.outcomeRef }),
  };
  const refs = [
    trace.traceId,
    scope,
    ...trace.signals.flatMap((s) => [s.signalId, s.reasonCode]),
    trace.handoffId,
    trace.acknowledgement?.handoffId,
    trace.conflictId,
    ...trace.decisionRefs,
    trace.outcomeRef,
  ].filter((r): r is string => r !== undefined);
  return refs.every((r) => REF_RE.test(r)) ? { ok: true, trace } : { ok: false, reason: "NON_STRUCTURED_REF" };
}
