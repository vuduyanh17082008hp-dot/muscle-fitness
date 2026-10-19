/**
 * AI-R1C Executive control plane — pure, provider-free, runtime-independent.
 * EPHEMERAL / DERIVED / PER-TURN: nothing here is persisted, and the workspace is neither athlete state nor memory.
 * Reuses R1B core (EvidenceItem, Hypothesis, MissingEvidence, IdentifiabilityStatus, UncertaintyClass) and
 * the coordination contract (signals, handoffs, conflicts, privacy, user scope). Safety is READ, never reinterpreted.
 */
import type { CoachId, CoachSignal, CoordinationConflict, CrossDomainRelevance, PrivacyClass, UserScopeRef } from "./coordination";
import { evaluateCrossDomainRelevance, isSameUserScope, isSignalActive, maxPrivacyClass } from "./coordination";
import type { EvidenceItem, Hypothesis, IdentifiabilityStatus, UncertaintyClass } from "./types";

/** Invariant: deterministic / canonical state is consulted before any retrieval. */
export const SEARCH_IS_NOT_DEFAULT = true as const;
/** HEURISTIC · UNCALIBRATED · EVALUATION_REQUIRED — VoI is a qualitative rule, not a Bayesian quantity. */
export const VOI_STATUS = "UNCALIBRATED_HEURISTIC" as const;
export const MAX_WORKSPACE_REFS = 64;

// ───────────────────────────── types ─────────────────────────────

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type ReasoningLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
export type ExecutiveDomain = "training" | "recovery" | "nutrition" | "performance" | "global";
export type TaskComplexity = "LOOKUP" | "EXPLANATION" | "MULTI_CONSTRAINT" | "OPEN_ENDED";
export type Level3 = "LOW" | "MEDIUM" | "HIGH";
export type InformationValue = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type EvidenceSourceClass =
  | "CURRENT_ATHLETE_STATE"
  | "CANONICAL_DB"
  | "DETERMINISTIC_TOOL"
  | "CURATED_KNOWLEDGE"
  | "COACHING_EPISODE"
  | "MEMORY_GRAPH"
  | "CURRENT_EXTERNAL_SOURCE"
  | "USER_CLARIFICATION";

export type EvidenceNeedType =
  | "EXACT_COMPUTATION"
  | "CURRENT_STATE"
  | "LOGGED_DATA"
  | "CONCEPTUAL_KNOWLEDGE"
  | "PAST_INTERVENTION"
  | "RELATIONAL_CONTEXT"
  | "EXTERNAL_CURRENT"
  | "USER_FACT";

export type Materiality = "CRITICAL" | "MATERIAL" | "MINOR";

export type EvidenceNeed = {
  id: string;
  type: EvidenceNeedType;
  domain: ExecutiveDomain;
  materiality: Materiality;
  /** DETERMINISTIC: only a deterministic tool may answer. VERIFIED_STATE: canonical/verified state only. */
  authorityRequired: "DETERMINISTIC" | "VERIFIED_STATE" | "ANY";
  freshness: "CURRENT" | "RECENT" | "ANY";
  privacyClass: PrivacyClass;
  userScope: UserScopeRef;
  hypothesisId?: string;
  /** Answering it would change persistent state (e.g. exact logging). */
  affectsPersistentState?: boolean;
};

export type BlockedCode =
  | "SAFETY_BLOCK"
  | "MISSING_USER_INPUT"
  | "MISSING_DETERMINISTIC_FACT"
  | "AUTHORITY_CONFLICT"
  | "TOOL_UNAVAILABLE"
  | "RETRIEVAL_BUDGET_EXHAUSTED"
  | "CONTRADICTORY_EVIDENCE"
  | "CROSS_USER_SCOPE"
  | "PRIVACY_RESTRICTION";
export type BlockedReason = { code: BlockedCode; refs: string[] };

export type SourceAvailability = Partial<Record<EvidenceSourceClass, { available: boolean; cost?: Level3 }>>;

export type EvidenceRouteDecision = {
  needId: string;
  outcome: "ROUTE" | "ASK_USER" | "SKIP" | "BLOCKED";
  source?: EvidenceSourceClass;
  /** Never lower than the need's own class or the caller's floor. */
  privacyClass: PrivacyClass;
  blockedBy?: BlockedReason;
  reasonCodes: string[];
};

export type ReasoningBudget = {
  level: ReasoningLevel;
  maxToolCalls: number;
  maxRetrievalRounds: number;
  verificationDepth: "NONE" | "BASIC" | "CROSS_CHECK" | "FULL";
  allowConsensusCheck: boolean;
  shouldAskUser: boolean;
  stopPolicy: "STOP_WHEN_SUFFICIENT" | "STOP_ONLY_WHEN_VERIFIED";
  reasonCodes: string[];
};

export type RetrievalState = {
  round: number;
  maxRounds: number;
  retrievedEvidenceRefs: string[];
  unresolvedNeeds: string[];
  contradictionCount: number;
  lastInformationGain: InformationValue;
  stopped: boolean;
};

export type StopReason =
  | "GOAL_SATISFIED"
  | "EVIDENCE_SUFFICIENT"
  | "LOW_INFORMATION_VALUE"
  | "USER_INPUT_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "SAFE_BUDGET_EXHAUSTED"
  | "DETERMINISTIC_RESOLUTION";

/** CONTINUE: keep going. STOPPED: normal stop with a reason. BLOCKED: NOT a success — escalate. */
export type StopDecision = {
  status: "CONTINUE" | "STOPPED" | "BLOCKED";
  stopReason?: StopReason;
  blockedBy: BlockedReason[];
  reasonCodes: string[];
};

export type Contradiction = { hypothesisId: string; forRefs: string[]; againstRefs: string[]; severity: "MATERIAL" | "CRITICAL" };

export type ExecutiveAction = "RETRIEVE" | "RESPOND" | "ASK_USER" | "REQUEST_CONFIRMATION" | "ESCALATE_SAFETY" | "BLOCKED";

export type ExecutiveWorkspace = {
  runId: string;
  userScope: UserScopeRef;
  /** Token-shaped goal code, never free text. */
  currentGoal: string;
  activeDomain: ExecutiveDomain;
  knownEvidence: string[];
  missingEvidence: string[];
  activeHypotheses: { id: string; identifiability: IdentifiabilityStatus; uncertainty: UncertaintyClass }[];
  contradictions: Contradiction[];
  unknowns: string[];
  riskLevel: RiskLevel;
  reasoningBudget: ReasoningBudget;
  retrievalState: RetrievalState;
  toolState: { deterministicToolsAvailable: boolean };
  blockedBy: BlockedReason[];
  nextDecision: { action: ExecutiveAction; stop: StopDecision };
  // ── beyond the canonical fields ──
  evidenceNeeds: EvidenceNeed[];
  routeDecisions: EvidenceRouteDecision[];
  signalRefs: string[];
  handoffRefs: string[];
  conflictRefs: string[];
  privacyClass: PrivacyClass;
  /** True if any ref list was cut to MAX_WORKSPACE_REFS. */
  truncated: boolean;
};

export type StructuredDecisionRecord = {
  runId: string;
  goal: string;
  evidenceRefs: string[];
  missingEvidenceRefs: string[];
  hypothesisRefs: string[];
  riskLevel: RiskLevel;
  reasoningLevel: ReasoningLevel;
  selectedEvidenceRoute: { needId: string; source: EvidenceSourceClass }[];
  stopReason?: StopReason;
  blockedCodes: BlockedCode[];
  selectedActionType: ExecutiveAction;
  reasonCodes: string[];
  privacyClass: PrivacyClass;
};

// ───────────────────────────── information value (heuristic) ─────────────────────────────

const PTS = { CRITICAL: 3, MATERIAL: 2, MINOR: 1 } as const;

/**
 * HEURISTIC · UNCALIBRATED · EVALUATION_REQUIRED. Additive qualitative points minus a cost penalty.
 * If the answer cannot change the decision and buys no risk reduction → NONE regardless of materiality.
 */
export function evaluateInformationValue(a: {
  materiality: Materiality;
  changesDecision: "LIKELY" | "POSSIBLE" | "UNLIKELY";
  riskReduction: "HIGH" | "SOME" | "NONE";
  uncertaintyReduction: "HIGH" | "SOME" | "NONE";
  cost: Level3;
  latency?: Level3;
}): InformationValue {
  const chg = { LIKELY: 2, POSSIBLE: 1, UNLIKELY: 0 }[a.changesDecision];
  const risk = { HIGH: 2, SOME: 1, NONE: 0 }[a.riskReduction];
  const unc = { HIGH: 2, SOME: 1, NONE: 0 }[a.uncertaintyReduction];
  if (chg === 0 && risk === 0) return "NONE";
  const penalty = (a.cost === "HIGH" ? 1 : 0) + (a.latency === "HIGH" ? 1 : 0);
  const score = PTS[a.materiality] + chg + risk + unc - penalty;
  return score >= 7 ? "HIGH" : score >= 5 ? "MEDIUM" : score >= 3 ? "LOW" : "NONE";
}

// ───────────────────────────── risk ─────────────────────────────

const RISK_ORDER: readonly RiskLevel[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (RISK_ORDER.indexOf(b) > RISK_ORDER.indexOf(a) ? b : a);

const POOR_IDENTIFIABILITY: readonly IdentifiabilityStatus[] = ["UNDERDETERMINED", "CONFLICTING", "UNKNOWN"];
const isUncertain = (h: Pick<Hypothesis, "identifiability" | "uncertainty">): boolean =>
  POOR_IDENTIFIABILITY.includes(h.identifiability) || h.uncertainty === "UNRESOLVED";

/** CRITICAL only from trusted input (existing safety layer result or an active riskFlag signal); a declared CRITICAL is capped to HIGH. */
export function classifyRisk(a: {
  declared?: RiskLevel;
  trustedSafetyCritical?: boolean;
  persistentMutation?: boolean;
  uncertain?: boolean;
}): { level: RiskLevel; reasonCodes: string[] } {
  if (a.trustedSafetyCritical) return { level: "CRITICAL", reasonCodes: ["TRUSTED_SAFETY_CRITICAL"] };
  const codes: string[] = [];
  let level: RiskLevel = a.declared ?? "LOW";
  if (level === "CRITICAL") {
    level = "HIGH";
    codes.push("UNTRUSTED_CRITICAL_CAPPED");
  }
  if (a.persistentMutation) {
    level = maxRisk(level, "MODERATE");
    codes.push("PERSISTENT_MUTATION");
  }
  if (level === "MODERATE" && a.uncertain) {
    level = "HIGH";
    codes.push("MODERATE_RISK_WITH_UNCERTAINTY");
  }
  return { level, reasonCodes: codes };
}

// ───────────────────────────── reasoning budget ─────────────────────────────

const LEVELS: readonly ReasoningLevel[] = ["MINIMAL", "LOW", "MEDIUM", "HIGH"];
const BASE_LEVEL: Record<TaskComplexity, number> = { LOOKUP: 0, EXPLANATION: 1, MULTI_CONSTRAINT: 2, OPEN_ENDED: 2 };
const TABLE: Record<ReasoningLevel, Pick<ReasoningBudget, "maxToolCalls" | "maxRetrievalRounds" | "verificationDepth">> = {
  MINIMAL: { maxToolCalls: 1, maxRetrievalRounds: 0, verificationDepth: "NONE" },
  LOW: { maxToolCalls: 2, maxRetrievalRounds: 1, verificationDepth: "BASIC" },
  MEDIUM: { maxToolCalls: 4, maxRetrievalRounds: 2, verificationDepth: "CROSS_CHECK" },
  HIGH: { maxToolCalls: 6, maxRetrievalRounds: 3, verificationDepth: "FULL" },
};

export type BudgetInputs = {
  complexity: TaskComplexity;
  risk: RiskLevel;
  /** An exact deterministic result already answers the task. */
  deterministicResolved?: boolean;
  uncertain?: boolean;
  poorIdentifiability?: boolean;
  contradictionCount?: number;
  criticalEvidenceMissing?: boolean;
  signalRelevance?: CrossDomainRelevance;
  persistentMutation?: boolean;
  knownFailureMode?: boolean;
  materialUserInputMissing?: boolean;
  toolsAvailable?: boolean;
  retrievalCost?: Level3;
  urgent?: boolean;
};

/** Escalates on risk / identifiability / contradiction / missing critical evidence / mutation / failure mode / material signal. Never on response length or evidence count. */
export function selectReasoningBudget(i: BudgetInputs): ReasoningBudget {
  const codes: string[] = [];
  const calm =
    i.deterministicResolved &&
    !i.persistentMutation &&
    (i.risk === "LOW" || i.risk === "MODERATE") &&
    !i.uncertain &&
    !i.criticalEvidenceMissing &&
    !(i.contradictionCount && i.contradictionCount > 0);
  let idx = BASE_LEVEL[i.complexity];
  if (calm) {
    idx = 0;
    codes.push("DETERMINISTIC_TRUTH_RESOLVES_TASK");
  } else {
    const steps = [
      [(i.contradictionCount ?? 0) > 0, "ESC_CONTRADICTION"],
      [i.criticalEvidenceMissing, "ESC_CRITICAL_EVIDENCE_MISSING"],
      [i.persistentMutation, "ESC_PERSISTENT_MUTATION"],
      [i.knownFailureMode, "ESC_KNOWN_FAILURE_MODE"],
      [i.poorIdentifiability, "ESC_POOR_IDENTIFIABILITY"],
      [i.signalRelevance === "MATERIAL" || i.signalRelevance === "CRITICAL", "ESC_MATERIAL_SIGNAL"],
    ].filter(([hit]) => hit) as [boolean, string][];
    idx += Math.min(steps.length, 2);
    codes.push(...steps.map(([, c]) => c));
    const floor = i.risk === "CRITICAL" ? 3 : i.risk === "HIGH" ? (i.uncertain ? 3 : 2) : i.risk === "MODERATE" ? 1 : 0;
    if (floor > idx) codes.push(`RISK_FLOOR_${i.risk}`);
    idx = Math.max(idx, floor);
  }
  const level = LEVELS[Math.min(idx, 3)];
  const { verificationDepth } = TABLE[level];
  let { maxToolCalls, maxRetrievalRounds } = TABLE[level];
  if (i.toolsAvailable === false) maxToolCalls = 0;
  const relaxed = i.risk === "LOW" || i.risk === "MODERATE";
  if (relaxed && maxRetrievalRounds > 0 && (i.urgent || i.retrievalCost === "HIGH")) {
    maxRetrievalRounds -= 1;
    codes.push(i.urgent ? "URGENT_FEWER_ROUNDS" : "HIGH_RETRIEVAL_COST_FEWER_ROUNDS");
  }
  return {
    level,
    maxToolCalls,
    maxRetrievalRounds,
    verificationDepth,
    allowConsensusCheck: level === "HIGH",
    shouldAskUser: !!i.materialUserInputMissing,
    stopPolicy: level === "HIGH" ? "STOP_ONLY_WHEN_VERIFIED" : "STOP_WHEN_SUFFICIENT",
    reasonCodes: codes,
  };
}

// ───────────────────────────── evidence router ─────────────────────────────

/** Only a MATERIAL+ unresolved need, or one that changes persistent state, justifies interrupting the user. */
export function shouldAskUserForEvidence(need: EvidenceNeed): { ask: boolean; reasonCodes: string[] } {
  if (need.materiality === "MINOR" && !need.affectsPersistentState) return { ask: false, reasonCodes: ["NOT_MATERIAL"] };
  return { ask: true, reasonCodes: [need.materiality === "MINOR" ? "AFFECTS_PERSISTENT_STATE" : "MATERIAL_FACT"] };
}

const CANDIDATES: Record<EvidenceNeedType, EvidenceSourceClass[]> = {
  EXACT_COMPUTATION: ["DETERMINISTIC_TOOL"],
  CURRENT_STATE: ["CURRENT_ATHLETE_STATE", "CANONICAL_DB", "USER_CLARIFICATION"],
  LOGGED_DATA: ["CANONICAL_DB", "CURRENT_ATHLETE_STATE", "USER_CLARIFICATION"],
  CONCEPTUAL_KNOWLEDGE: ["CURATED_KNOWLEDGE"],
  PAST_INTERVENTION: ["COACHING_EPISODE", "MEMORY_GRAPH"],
  RELATIONAL_CONTEXT: ["MEMORY_GRAPH", "COACHING_EPISODE"],
  EXTERNAL_CURRENT: ["CURRENT_EXTERNAL_SOURCE", "CURATED_KNOWLEDGE"],
  USER_FACT: ["USER_CLARIFICATION"],
};
const DETERMINISTIC_OK: EvidenceSourceClass[] = ["DETERMINISTIC_TOOL"];
const VERIFIED_STATE_OK: EvidenceSourceClass[] = ["CURRENT_ATHLETE_STATE", "CANONICAL_DB", "DETERMINISTIC_TOOL", "USER_CLARIFICATION"];

/**
 * Pure routing. Order of preference is need-type driven (deterministic/canonical first, SEARCH_IS_NOT_DEFAULT);
 * current-state needs never fall back to generic knowledge — they fall back to asking the user.
 */
export function routeEvidenceNeed(
  need: EvidenceNeed,
  ctx: { userScope: UserScopeRef; availability?: SourceAvailability; risk?: RiskLevel; privacyFloor?: PrivacyClass },
): EvidenceRouteDecision {
  const privacyClass = maxPrivacyClass(need.privacyClass, ctx.privacyFloor ?? "NORMAL");
  const out = (d: Omit<EvidenceRouteDecision, "needId" | "privacyClass">): EvidenceRouteDecision => ({ needId: need.id, privacyClass, ...d });
  const blocked = (code: BlockedCode, reason: string) => out({ outcome: "BLOCKED", blockedBy: { code, refs: [need.id] }, reasonCodes: [reason] });

  if (!isSameUserScope(need.userScope, ctx.userScope)) return blocked("CROSS_USER_SCOPE", "FOREIGN_USER_SCOPE");

  const avail = ctx.availability ?? {};
  const isAvailable = (s: EvidenceSourceClass) => avail[s]?.available !== false;
  let candidates = CANDIDATES[need.type];
  if (need.authorityRequired === "DETERMINISTIC") candidates = candidates.filter((s) => DETERMINISTIC_OK.includes(s));
  else if (need.authorityRequired === "VERIFIED_STATE") candidates = candidates.filter((s) => VERIFIED_STATE_OK.includes(s));
  if (need.type === "CONCEPTUAL_KNOWLEDGE" && need.freshness === "CURRENT") candidates = [...candidates, "CURRENT_EXTERNAL_SOURCE"];
  // sensitive/medical content never leaves the platform
  const external = candidates.includes("CURRENT_EXTERNAL_SOURCE") && privacyClass !== "NORMAL";
  if (external) candidates = candidates.filter((s) => s !== "CURRENT_EXTERNAL_SOURCE");

  const source = candidates.find(isAvailable);
  if (!source) {
    if (external && candidates.length === 0) return blocked("PRIVACY_RESTRICTION", "EXTERNAL_ROUTE_FORBIDDEN_BY_PRIVACY");
    if (need.authorityRequired === "DETERMINISTIC" || need.type === "EXACT_COMPUTATION")
      return blocked(avail.DETERMINISTIC_TOOL?.available === false ? "TOOL_UNAVAILABLE" : "MISSING_DETERMINISTIC_FACT", "NO_DETERMINISTIC_SOURCE");
    return blocked("TOOL_UNAVAILABLE", "NO_AVAILABLE_SOURCE");
  }
  if (source === "USER_CLARIFICATION") {
    const ask = shouldAskUserForEvidence(need);
    return ask.ask
      ? out({ outcome: "ASK_USER", source, reasonCodes: ["NO_SYSTEM_SOURCE_FOR_FACT", ...ask.reasonCodes] })
      : out({ outcome: "SKIP", source, reasonCodes: ask.reasonCodes });
  }
  const highRisk = ctx.risk === "HIGH" || ctx.risk === "CRITICAL";
  if (avail[source]?.cost === "HIGH" && need.materiality === "MINOR" && !highRisk)
    return out({ outcome: "SKIP", source, reasonCodes: ["COST_EXCEEDS_VALUE"] });
  return out({ outcome: "ROUTE", source, reasonCodes: [`PREFERRED_${source}`, ...(source !== candidates[0] ? ["FALLBACK_SOURCE"] : [])] });
}

// ───────────────────────────── retrieve → reflect → stop ─────────────────────────────

export function createRetrievalState(unresolvedNeeds: string[], maxRounds: number): RetrievalState {
  return { round: 0, maxRounds, retrievedEvidenceRefs: [], unresolvedNeeds: [...unresolvedNeeds], contradictionCount: 0, lastInformationGain: "NONE", stopped: false };
}

/** Reflect step: fold one retrieval round into the state. */
export function recordRetrievalRound(
  s: RetrievalState,
  r: { evidenceRefs: string[]; resolvedNeedIds: string[]; contradictionCount: number; informationGain: InformationValue },
): RetrievalState {
  const refs = [...new Set([...s.retrievedEvidenceRefs, ...r.evidenceRefs])].slice(0, MAX_WORKSPACE_REFS);
  return {
    ...s,
    round: s.round + 1,
    retrievedEvidenceRefs: refs,
    unresolvedNeeds: s.unresolvedNeeds.filter((id) => !r.resolvedNeedIds.includes(id)),
    contradictionCount: r.contradictionCount,
    lastInformationGain: r.informationGain,
  };
}

const roundsLeft = (s: RetrievalState, b: ReasoningBudget): boolean => s.round < Math.min(s.maxRounds, b.maxRetrievalRounds);

export function shouldRetrieveAgain(a: {
  state: RetrievalState;
  budget: ReasoningBudget;
  informationValue: InformationValue;
  confirmationRequired?: boolean;
  safetyBlocked?: boolean;
}): { retrieve: boolean; reasonCodes: string[] } {
  const no = (c: string) => ({ retrieve: false, reasonCodes: [c] });
  if (a.safetyBlocked) return no("SAFETY_POLICY_STOP");
  if (a.confirmationRequired) return no("CONFIRMATION_REQUIRED");
  if (a.state.stopped) return no("RETRIEVAL_STOPPED");
  if (a.state.unresolvedNeeds.length === 0) return no("NO_UNRESOLVED_MATERIAL_EVIDENCE");
  if (!roundsLeft(a.state, a.budget)) return no("RETRIEVAL_BUDGET_EXHAUSTED");
  if (a.state.round > 0 && a.state.lastInformationGain === "NONE") return no("LAST_ROUND_GAINED_NOTHING");
  if (a.informationValue === "NONE" || a.informationValue === "LOW") return no("INFORMATION_VALUE_TOO_LOW");
  return { retrieve: true, reasonCodes: ["MATERIAL_UNCERTAINTY_AND_VALUE_AND_BUDGET"] };
}

// ───────────────────────────── stop policy ─────────────────────────────

export type StopContext = {
  riskLevel: RiskLevel;
  retrieval: RetrievalState;
  budget: ReasoningBudget;
  informationValue: InformationValue;
  /** Unresolved needs, with materiality. */
  unresolved: Pick<EvidenceNeed, "id" | "materiality" | "type" | "authorityRequired">[];
  contradictions: Contradiction[];
  routeBlocks?: BlockedReason[];
  deterministicResolved?: boolean;
  goalSatisfied?: boolean;
  confirmationRequired?: boolean;
  userInputRequired?: boolean;
  safetyBlock?: boolean;
};

const isDeterministicNeed = (n: StopContext["unresolved"][number]) => n.type === "EXACT_COMPUTATION" || n.authorityRequired === "DETERMINISTIC";

/** SAFETY_UNRESOLVED, CRITICAL_CONTRADICTION and a missing material deterministic fact never produce a normal STOPPED — only CONTINUE or BLOCKED. */
export function shouldStopReasoning(c: StopContext): StopDecision {
  const stopped = (stopReason: StopReason): StopDecision => ({ status: "STOPPED", stopReason, blockedBy: [], reasonCodes: [stopReason] });
  const blocked = (blockedBy: BlockedReason[], code: string): StopDecision => ({ status: "BLOCKED", blockedBy, reasonCodes: [code] });

  if (c.safetyBlock || c.riskLevel === "CRITICAL") return blocked([{ code: "SAFETY_BLOCK", refs: [] }], "SAFETY_UNRESOLVED");
  const critContra = c.contradictions.filter((x) => x.severity === "CRITICAL");
  if (critContra.length) return blocked([{ code: "CONTRADICTORY_EVIDENCE", refs: critContra.map((x) => x.hypothesisId) }], "CRITICAL_CONTRADICTION");

  const material = c.unresolved.filter((n) => n.materiality !== "MINOR");
  const critical = material.filter((n) => n.materiality === "CRITICAL");
  const canRetrieve = roundsLeft(c.retrieval, c.budget) && !c.retrieval.stopped;
  const detMissing = material.filter(isDeterministicNeed);
  if (detMissing.length && !c.deterministicResolved) {
    const routed = (c.routeBlocks ?? []).filter((b) => detMissing.some((n) => b.refs.includes(n.id)));
    if (routed.length || !canRetrieve)
      return blocked(routed.length ? routed : [{ code: "MISSING_DETERMINISTIC_FACT", refs: detMissing.map((n) => n.id) }], "MATERIAL_DETERMINISTIC_FACT_MISSING");
    return { status: "CONTINUE", blockedBy: [], reasonCodes: ["MATERIAL_DETERMINISTIC_FACT_MISSING"] };
  }
  const critBlocks = (c.routeBlocks ?? []).filter((b) => critical.some((n) => b.refs.includes(n.id)));
  if (critBlocks.length) return blocked(critBlocks, "CRITICAL_EVIDENCE_UNREACHABLE");

  if (c.confirmationRequired) return stopped("CONFIRMATION_REQUIRED");
  if (c.userInputRequired) return stopped("USER_INPUT_REQUIRED");
  if (c.deterministicResolved && !critical.length) return stopped("DETERMINISTIC_RESOLUTION");
  if (c.goalSatisfied && !critical.length) return stopped("GOAL_SATISFIED");
  if (!material.length) return stopped("EVIDENCE_SUFFICIENT");
  if (!canRetrieve)
    return critical.length
      ? blocked([{ code: "RETRIEVAL_BUDGET_EXHAUSTED", refs: critical.map((n) => n.id) }], "CRITICAL_EVIDENCE_MISSING_BUDGET_EXHAUSTED")
      : stopped("SAFE_BUDGET_EXHAUSTED");
  if (!critical.length && (c.informationValue === "NONE" || c.informationValue === "LOW")) return stopped("LOW_INFORMATION_VALUE");
  return { status: "CONTINUE", blockedBy: [], reasonCodes: ["MATERIAL_EVIDENCE_STILL_MISSING"] };
}

// ───────────────────────────── workspace ─────────────────────────────

const REF_RE = /^[A-Za-z0-9:_.-]{1,128}$/;

export type WorkspaceInput = {
  runId: string;
  userScope: UserScopeRef;
  /** Token-shaped goal code (e.g. EXPLAIN_LOW_CARB_FATIGUE). */
  currentGoal: string;
  activeDomain: ExecutiveDomain;
  complexity: TaskComplexity;
  /** Caller/classifier-declared. CRITICAL here is NOT trusted and is capped to HIGH. */
  declaredRisk?: RiskLevel;
  /** Result of the existing safety layer; the only way (besides an active riskFlag signal) to reach CRITICAL. */
  trustedSafetyCritical?: boolean;
  evidence?: EvidenceItem[];
  hypotheses?: Hypothesis[];
  needs?: EvidenceNeed[];
  signals?: CoachSignal[];
  handoffRefs?: string[];
  conflicts?: CoordinationConflict[];
  /** Coach whose workspace this is; lets cross-coach relevance be projected. */
  viewer?: CoachId;
  retrieval?: RetrievalState;
  availability?: SourceAvailability;
  deterministicResolved?: boolean;
  goalSatisfied?: boolean;
  persistentMutationRequested?: boolean;
  confirmationPending?: boolean;
  knownFailureMode?: boolean;
  urgent?: boolean;
  informationValue?: InformationValue;
};

const RELEVANCE_ORDER: readonly CrossDomainRelevance[] = ["IRRELEVANT", "OPTIONAL", "MATERIAL", "CRITICAL"];

function signalRelevance(signals: CoachSignal[], scope: UserScopeRef, now: Date, viewer?: CoachId): CrossDomainRelevance {
  return signals
    .filter((s) => isSameUserScope(s.userScope, scope) && isSignalActive(s, now))
    .flatMap((s) => (viewer ? [evaluateCrossDomainRelevance(s, viewer, now)] : s.implications.map((i) => i.relevance)))
    .reduce<CrossDomainRelevance>((b, r) => (RELEVANCE_ORDER.indexOf(r) > RELEVANCE_ORDER.indexOf(b) ? r : b), "IRRELEVANT");
}

/** A FOR and an AGAINST item (both non-stale, non-weak) on one hypothesis. Both STRONG → CRITICAL. */
export function findContradictions(evidence: EvidenceItem[]): Contradiction[] {
  const byH = new Map<string, EvidenceItem[]>();
  for (const e of evidence) if (e.hypothesisId && !e.stale && e.strength !== "WEAK") byH.set(e.hypothesisId, [...(byH.get(e.hypothesisId) ?? []), e]);
  return [...byH].flatMap(([hypothesisId, items]) => {
    const f = items.filter((e) => e.direction === "FOR");
    const a = items.filter((e) => e.direction === "AGAINST");
    if (!f.length || !a.length) return [];
    const strong = f.some((e) => e.strength === "STRONG") && a.some((e) => e.strength === "STRONG");
    return [{ hypothesisId, forRefs: f.map((e) => e.id), againstRefs: a.map((e) => e.id), severity: strong ? ("CRITICAL" as const) : ("MATERIAL" as const) }];
  });
}

const cap = <T>(xs: T[], flag: { v: boolean }): T[] => {
  if (xs.length > MAX_WORKSPACE_REFS) flag.v = true;
  return xs.slice(0, MAX_WORKSPACE_REFS);
};

const ACTION_BY_STOP = (s: StopDecision): ExecutiveAction =>
  s.status === "CONTINUE" ? "RETRIEVE"
  : s.status === "BLOCKED" ? (s.blockedBy.some((b) => b.code === "SAFETY_BLOCK") ? "ESCALATE_SAFETY" : "BLOCKED")
  : s.stopReason === "USER_INPUT_REQUIRED" ? "ASK_USER"
  : s.stopReason === "CONFIRMATION_REQUIRED" ? "REQUEST_CONFIRMATION"
  : "RESPOND";

/** Assembles one per-turn workspace: refs in, decisions out. Foreign-scope needs/signals are ignored, never routed. */
export function buildExecutiveWorkspace(a: WorkspaceInput, now: Date): ExecutiveWorkspace {
  const trunc = { v: false };
  const evidence = a.evidence ?? [];
  const hypotheses = (a.hypotheses ?? []).filter((h) => h.status !== "REJECTED");
  const signals = (a.signals ?? []).filter((s) => isSameUserScope(s.userScope, a.userScope));
  const riskSignalActive = signals.some((s) => s.riskFlag && isSignalActive(s, now));
  const contradictions = findContradictions(evidence);
  const uncertain = hypotheses.some(isUncertain);
  const poorId = hypotheses.some((h) => POOR_IDENTIFIABILITY.includes(h.identifiability));
  const persistent = !!a.persistentMutationRequested;

  const risk = classifyRisk({ declared: a.declaredRisk, trustedSafetyCritical: a.trustedSafetyCritical || riskSignalActive, persistentMutation: persistent, uncertain });
  const needs = (a.needs ?? []).filter((n) => isSameUserScope(n.userScope, a.userScope));
  const foreignNeeds = (a.needs ?? []).filter((n) => !isSameUserScope(n.userScope, a.userScope));
  const retrievalIn = a.retrieval ?? createRetrievalState(needs.map((n) => n.id), 3);
  const unresolved = needs.filter((n) => retrievalIn.unresolvedNeeds.includes(n.id));

  const routes = unresolved.map((n) => routeEvidenceNeed(n, { userScope: a.userScope, availability: a.availability, risk: risk.level }));
  const routeBlocks = routes.flatMap((r) => (r.blockedBy ? [r.blockedBy] : []));
  const userInputNeeds = routes.filter((r) => r.outcome === "ASK_USER");
  const criticalMissing = unresolved.some((n) => n.materiality === "CRITICAL");
  const relevance = signalRelevance(signals, a.userScope, now, a.viewer);

  const budget = selectReasoningBudget({
    complexity: a.complexity,
    risk: risk.level,
    deterministicResolved: a.deterministicResolved,
    uncertain,
    poorIdentifiability: poorId,
    contradictionCount: contradictions.length,
    criticalEvidenceMissing: criticalMissing,
    signalRelevance: relevance,
    persistentMutation: persistent,
    knownFailureMode: a.knownFailureMode,
    materialUserInputMissing: userInputNeeds.length > 0,
    toolsAvailable: a.availability?.DETERMINISTIC_TOOL?.available !== false,
    urgent: a.urgent,
  });
  budget.reasonCodes.unshift(...risk.reasonCodes);

  const retrievalState: RetrievalState = { ...retrievalIn, contradictionCount: contradictions.length, retrievedEvidenceRefs: cap(retrievalIn.retrievedEvidenceRefs, trunc) };
  const confirmationRequired = !!a.confirmationPending || (a.conflicts ?? []).some((c) => c.resolution === "USER_DECISION_REQUIRED");
  const stop = shouldStopReasoning({
    riskLevel: risk.level,
    retrieval: retrievalState,
    budget,
    informationValue: a.informationValue ?? (unresolved.length ? "MEDIUM" : "NONE"),
    unresolved,
    contradictions,
    routeBlocks,
    deterministicResolved: a.deterministicResolved,
    goalSatisfied: a.goalSatisfied,
    confirmationRequired,
    userInputRequired: userInputNeeds.length > 0,
    safetyBlock: risk.level === "CRITICAL",
  });

  return {
    runId: a.runId,
    userScope: a.userScope,
    currentGoal: a.currentGoal,
    activeDomain: a.activeDomain,
    knownEvidence: cap(evidence.filter((e) => !e.stale).map((e) => e.id), trunc),
    missingEvidence: cap([...unresolved.map((n) => n.id), ...hypotheses.flatMap((h) => h.missingEvidence.map((m) => m.id))], trunc),
    activeHypotheses: cap(hypotheses.map((h) => ({ id: h.id, identifiability: h.identifiability, uncertainty: h.uncertainty })), trunc),
    contradictions,
    unknowns: cap(hypotheses.filter(isUncertain).map((h) => h.id), trunc),
    riskLevel: risk.level,
    reasoningBudget: budget,
    retrievalState,
    toolState: { deterministicToolsAvailable: a.availability?.DETERMINISTIC_TOOL?.available !== false },
    blockedBy: [...stop.blockedBy, ...foreignNeeds.map((n) => ({ code: "CROSS_USER_SCOPE" as const, refs: [n.id] }))],
    nextDecision: { action: ACTION_BY_STOP(stop), stop },
    evidenceNeeds: needs,
    routeDecisions: routes,
    signalRefs: cap(signals.map((s) => s.id), trunc),
    handoffRefs: cap([...(a.handoffRefs ?? [])], trunc),
    conflictRefs: cap((a.conflicts ?? []).map((c) => c.conflictId), trunc),
    privacyClass: maxPrivacyClass("NORMAL", ...needs.map((n) => n.privacyClass), ...signals.map((s) => s.privacyClass)),
    truncated: trunc.v,
  };
}

// ───────────────────────────── structured decision record ─────────────────────────────

/** Refs + reason codes only: no chain-of-thought, no raw chat. Fails on any non-token-shaped ref. */
export function buildStructuredDecisionRecord(
  ws: ExecutiveWorkspace,
): { ok: true; record: StructuredDecisionRecord } | { ok: false; reason: string } {
  const stop = ws.nextDecision.stop;
  const record: StructuredDecisionRecord = {
    runId: ws.runId,
    goal: ws.currentGoal,
    evidenceRefs: [...ws.knownEvidence],
    missingEvidenceRefs: [...ws.missingEvidence],
    hypothesisRefs: ws.activeHypotheses.map((h) => h.id),
    riskLevel: ws.riskLevel,
    reasoningLevel: ws.reasoningBudget.level,
    selectedEvidenceRoute: ws.routeDecisions.flatMap((r) => (r.source && (r.outcome === "ROUTE" || r.outcome === "ASK_USER") ? [{ needId: r.needId, source: r.source }] : [])),
    ...(stop.stopReason && { stopReason: stop.stopReason }),
    blockedCodes: ws.blockedBy.map((b) => b.code),
    selectedActionType: ws.nextDecision.action,
    reasonCodes: [...ws.reasoningBudget.reasonCodes, ...stop.reasonCodes],
    privacyClass: ws.privacyClass,
  };
  const refs = [
    record.runId,
    record.goal,
    ...record.evidenceRefs,
    ...record.missingEvidenceRefs,
    ...record.hypothesisRefs,
    ...record.selectedEvidenceRoute.map((r) => r.needId),
    ...record.reasonCodes,
  ];
  return refs.every((r) => REF_RE.test(r)) ? { ok: true, record } : { ok: false, reason: "NON_STRUCTURED_REF" };
}
