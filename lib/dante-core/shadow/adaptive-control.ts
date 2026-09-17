import { assertSameClient } from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import { contextSimilarity, scoreStrategy } from "@/lib/dante-core/strategy-learner";
import type {
  AdaptationRecord,
  AthleteDriftSnapshot,
  DriftAssessment,
  DriftDomain,
  DriftEvidence,
  FailureClass,
  FailureReaction,
  MetaAction,
  ShadowControlInput,
  ShadowFlowResult,
  ShadowStrategyCandidate,
  ShadowStrategyScore,
  StabilityAssessment,
  UncertaintyDimension,
  UncertaintyProfile,
} from "@/lib/dante-core/shadow/types";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function dimension(value: number, reasonCodes: string[]): UncertaintyDimension {
  return { value: round(clamp01(value)), reasonCodes: [...new Set(reasonCodes)] };
}

export function buildUncertaintyProfile(input: {
  verifiedEvidenceCount: number;
  missingStateFields: string[];
  stateConfidence: number;
  confounderCount: number;
  causalEvidenceCount: number;
  strategySampleCount: number;
  strategyConfidence: number;
  outcomeMature: boolean;
  outcomeAvailable: boolean;
  toolAttempted: boolean;
  toolSucceeded: boolean | null;
}): UncertaintyProfile {
  const epistemicReasons: string[] = [];
  const stateReasons = input.missingStateFields.map((field) => `MISSING_${field.toUpperCase()}`);
  const causalReasons: string[] = [];
  const strategyReasons: string[] = [];
  const outcomeReasons: string[] = [];
  const toolReasons: string[] = [];

  const epistemic = input.verifiedEvidenceCount === 0
    ? 0.9
    : 1 / (1 + input.verifiedEvidenceCount);
  if (input.verifiedEvidenceCount === 0) epistemicReasons.push("NO_VERIFIED_EVIDENCE");
  if (input.verifiedEvidenceCount < 3) epistemicReasons.push("LOW_EVIDENCE_COUNT");

  const missingPressure = Math.min(0.75, input.missingStateFields.length * 0.18);
  const state = Math.max(1 - clamp01(input.stateConfidence), missingPressure);
  if (state > 0.55) stateReasons.push("HIGH_STATE_UNCERTAINTY");

  const causal = input.causalEvidenceCount === 0
    ? input.confounderCount > 0 ? 0.95 : 0.7
    : clamp01(input.confounderCount / Math.max(1, input.causalEvidenceCount));
  if (input.confounderCount > 0) causalReasons.push("CONFOUNDED_OUTCOME");
  if (input.causalEvidenceCount === 0) causalReasons.push("NO_CAUSAL_EVIDENCE");

  const samplePressure = 1 - Math.min(1, input.strategySampleCount / 5);
  const strategy = Math.max(samplePressure, 1 - clamp01(input.strategyConfidence));
  if (input.strategySampleCount < 3) strategyReasons.push("INSUFFICIENT_STRATEGY_SAMPLES");
  if (input.strategyConfidence < 0.5) strategyReasons.push("LOW_STRATEGY_CONFIDENCE");

  const outcome = !input.outcomeMature ? 0.8 : !input.outcomeAvailable ? 1 : 0.2;
  if (!input.outcomeMature) outcomeReasons.push("OUTCOME_WINDOW_NOT_MATURE");
  else if (!input.outcomeAvailable) outcomeReasons.push("OUTCOME_UNRESOLVED");

  const tool = !input.toolAttempted ? 0.25 : input.toolSucceeded === true ? 0 : 0.9;
  if (input.toolAttempted && input.toolSucceeded === false) toolReasons.push("TOOL_EXECUTION_FAILED");
  if (!input.toolAttempted) toolReasons.push("TOOL_NOT_ATTEMPTED");

  return {
    epistemic: dimension(epistemic, epistemicReasons),
    state: dimension(state, stateReasons),
    causal: dimension(causal, causalReasons),
    strategy: dimension(strategy, strategyReasons),
    outcome: dimension(outcome, outcomeReasons),
    tool: dimension(tool, toolReasons),
  };
}

const DRIFT_DOMAINS: DriftDomain[] = [
  "goal",
  "sleepHours",
  "scheduleDays",
  "stress",
  "trainingLoad",
  "recoveryScore",
  "calorieAdherence",
  "adherence",
  "communicationPreference",
];

const NUMERIC_DRIFT_SCALE: Partial<Record<DriftDomain, number>> = {
  sleepHours: 1.5,
  scheduleDays: 2,
  stress: 3,
  trainingLoad: 0.25,
  recoveryScore: 15,
  calorieAdherence: 0.2,
  adherence: 0.2,
};

function compareDomain(
  domain: DriftDomain,
  value: string | number | null,
  baseline: string | number | null,
): { magnitude: number; direction: DriftEvidence["direction"] } | null {
  if (value === null || baseline === null) return null;
  if (typeof value === "number" && typeof baseline === "number") {
    const scale = domain === "trainingLoad"
      ? Math.max(Math.abs(baseline) * (NUMERIC_DRIFT_SCALE.trainingLoad ?? 0.25), 1)
      : NUMERIC_DRIFT_SCALE[domain] ?? Math.max(Math.abs(baseline), 1);
    const delta = value - baseline;
    return {
      magnitude: clamp01(Math.abs(delta) / scale),
      direction: Math.abs(delta) < Number.EPSILON ? "NONE" : delta > 0 ? "UP" : "DOWN",
    };
  }
  if (typeof value === "string" && typeof baseline === "string") {
    const changed = value.trim().toLocaleLowerCase("en-US") !== baseline.trim().toLocaleLowerCase("en-US");
    return { magnitude: changed ? 1 : 0, direction: changed ? "CHANGED" : "NONE" };
  }
  return null;
}

export function detectAthleteDrift(input: {
  userId: string;
  current: AthleteDriftSnapshot;
  baseline: AthleteDriftSnapshot;
  recent: AthleteDriftSnapshot[];
  persistenceWindow?: number;
}): DriftAssessment {
  assertSameClient(input.userId, input.current.userId);
  assertSameClient(input.userId, input.baseline.userId);
  input.recent.forEach((snapshot) => assertSameClient(input.userId, snapshot.userId));

  const requiredPoints = Math.max(2, input.persistenceWindow ?? 3);
  // A route can be read repeatedly without producing a new independent
  // athlete observation. Count at most one snapshot per UTC date so three
  // dashboard refreshes during one bad night cannot manufacture persistence.
  const currentBucket = input.current.capturedAt.slice(0, 10);
  const recentByBucket = new Map<string, AthleteDriftSnapshot>();
  for (const snapshot of input.recent) {
    const bucket = snapshot.capturedAt.slice(0, 10);
    if (!bucket || bucket === currentBucket) continue;
    const existing = recentByBucket.get(bucket);
    if (!existing || snapshot.capturedAt > existing.capturedAt) {
      recentByBucket.set(bucket, snapshot);
    }
  }
  const recent = [...recentByBucket.values()]
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
    .slice(-(requiredPoints - 1));
  const evidence: DriftEvidence[] = [];

  for (const domain of DRIFT_DOMAINS) {
    const currentComparison = compareDomain(domain, input.current[domain], input.baseline[domain]);
    if (!currentComparison || currentComparison.magnitude < 0.5) continue;

    let sameDirectionPoints = 1;
    let availablePoints = 1;
    for (const snapshot of recent) {
      const comparison = compareDomain(domain, snapshot[domain], input.baseline[domain]);
      if (!comparison) continue;
      availablePoints += 1;
      if (comparison.magnitude >= 0.5 && comparison.direction === currentComparison.direction) {
        sameDirectionPoints += 1;
      }
    }

    const persistence = clamp01(sameDirectionPoints / requiredPoints);
    const confidence = clamp01(availablePoints / requiredPoints);
    evidence.push({
      domain,
      magnitude: round(currentComparison.magnitude),
      persistence: round(persistence),
      confidence: round(confidence),
      direction: currentComparison.direction,
      confirmed: sameDirectionPoints >= requiredPoints && confidence >= 0.66,
    });
  }

  const confirmed = evidence.filter((item) => item.confirmed);
  const aggregate = confirmed.length > 0 ? confirmed : evidence;
  const average = (key: "magnitude" | "persistence" | "confidence") =>
    aggregate.length === 0
      ? 0
      : round(aggregate.reduce((sum, item) => sum + item[key], 0) / aggregate.length);

  return {
    userId: input.userId,
    status: confirmed.length > 0 ? "CONFIRMED" : evidence.length > 0 ? "CANDIDATE" : "NONE",
    magnitude: average("magnitude"),
    persistence: average("persistence"),
    confidence: average("confidence"),
    evidence,
    reasonCodes: confirmed.length > 0
      ? confirmed.map((item) => `DRIFT_CONFIRMED_${item.domain.toUpperCase()}`)
      : evidence.length > 0
        ? ["DRIFT_CANDIDATE_NOT_PERSISTENT"]
        : ["NO_MATERIAL_DRIFT"],
  };
}

function alternatingAbab(actions: string[]): boolean {
  if (actions.length < 4) return false;
  const last = actions.slice(-4);
  return last[0] === last[2] && last[1] === last[3] && last[0] !== last[1];
}

export function assessAdaptationStability(
  userId: string,
  records: AdaptationRecord[],
): StabilityAssessment {
  const own = records
    .filter((record) => record.userId === userId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const directions = own.map((record) => record.direction);
  const actions = own.map((record) => record.action);
  const oscillation = alternatingAbab(actions) || alternatingAbab(directions);

  const directional = directions.filter((direction) => direction === "INCREASE" || direction === "DECREASE");
  let reversals = 0;
  for (let index = 1; index < directional.length; index += 1) {
    if (directional[index] !== directional[index - 1]) reversals += 1;
  }
  const repeatedReversals = reversals >= 3;

  const lastFour = own.slice(-4);
  const numeric = lastFour.map((record) => record.value);
  const allNumeric = numeric.length === 4 && numeric.every((value): value is number => value !== null);
  const monotonicDown = allNumeric && numeric.every((value, index) => index === 0 || value < numeric[index - 1]!);
  const monotonicUp = allNumeric && numeric.every((value, index) => index === 0 || value > numeric[index - 1]!);
  const noImprovement = lastFour.length >= 3 && lastFour.every((record) => record.outcomeImproved !== true);
  const oneRepeatedAction = lastFour.length === 4 && new Set(lastFour.map((record) => record.action)).size === 1;
  const oneRepeatedDirection = lastFour.length === 4 && new Set(lastFour.map((record) => record.direction)).size === 1;
  const runaway = Boolean(
    oneRepeatedAction && oneRepeatedDirection && (monotonicDown || monotonicUp) && noImprovement,
  );

  const trailingUnvalidatedRecommendations: AdaptationRecord[] = [];
  for (let index = own.length - 1; index >= 0; index -= 1) {
    const record = own[index]!;
    if (record.evidenceSource !== "dante_recommendation" || record.outcomeImproved !== null) break;
    trailingUnvalidatedRecommendations.push(record);
  }
  const selfCreatedEvidenceLoop = trailingUnvalidatedRecommendations.length >= 2;
  const repeatedWithoutImprovement = lastFour.length >= 3 &&
    lastFour[0]?.direction !== "OTHER" &&
    new Set(lastFour.map((record) => record.direction)).size === 1 &&
    new Set(lastFour.map((record) => record.action)).size === 1 &&
    noImprovement;

  const flags = [oscillation, repeatedReversals, runaway, selfCreatedEvidenceLoop, repeatedWithoutImprovement];
  const count = flags.filter(Boolean).length;
  const risk = clamp01(
    count * 0.3 +
      (runaway || selfCreatedEvidenceLoop ? 0.2 : 0) +
      (oscillation || repeatedReversals ? 0.4 : 0),
  );
  const reasonCodes: string[] = [];
  if (oscillation) reasonCodes.push("ABAB_OSCILLATION");
  if (repeatedReversals) reasonCodes.push("REPEATED_DIRECTIONAL_REVERSALS");
  if (runaway) reasonCodes.push("RUNAWAY_ADJUSTMENT");
  if (selfCreatedEvidenceLoop) reasonCodes.push("SELF_CREATED_EVIDENCE_LOOP");
  if (repeatedWithoutImprovement) reasonCodes.push("REPEATED_WITHOUT_IMPROVEMENT");
  if (reasonCodes.length === 0) reasonCodes.push("STABLE_ADAPTATION_HISTORY");

  return {
    userId,
    status: risk >= 0.65 ? "UNSTABLE" : risk >= 0.3 ? "WATCH" : "STABLE",
    risk: round(risk),
    oscillation,
    repeatedReversals,
    runaway,
    selfCreatedEvidenceLoop,
    repeatedWithoutImprovement,
    reasonCodes,
  };
}

export function informationValue(input: {
  expectedUtility: number;
  informationGain: number;
  risk: number;
  cost: number;
  instability: number;
}): number {
  return round(
    input.expectedUtility + input.informationGain - input.risk - input.cost - input.instability,
  );
}

export function scoreContextualStrategies(input: {
  userId: string;
  contextSignature: string;
  candidates: ShadowStrategyCandidate[];
  drift: DriftAssessment;
  stability: StabilityAssessment;
  now?: Date;
}): ShadowStrategyScore[] {
  return input.candidates
    .map((candidate) => {
      assertSameClient(input.userId, candidate.userId);
      if (candidate.pattern) assertSameClient(input.userId, candidate.pattern.userId);
      const historical = candidate.pattern
        ? scoreStrategy({
            userId: input.userId,
            currentContext: input.contextSignature,
            pattern: candidate.pattern,
            now: input.now,
          })
        : null;
      const contextFit = historical?.contextSimilarity ?? contextSimilarity(
        input.contextSignature,
        candidate.contextSignature,
      );
      const historicalFit = (historical?.score ?? 0) * contextFit;
      const contextualExpectedUtility = clamp01(candidate.expectedUtility) * contextFit;
      const driftPenalty = input.drift.status === "CONFIRMED"
        ? input.drift.magnitude * input.drift.confidence * 0.3
        : 0;
      const instabilityPenalty = input.stability.risk * 0.35;
      const score = clamp01(
        0.35 * contextualExpectedUtility +
          0.3 * historicalFit +
          0.2 * clamp01(candidate.informationGain) -
          0.1 * clamp01(candidate.risk) -
          0.05 * clamp01(candidate.cost) -
          driftPenalty -
          instabilityPenalty,
      );
      const reasonCodes = ["PER_USER_CONTEXT_SCORE"];
      if (driftPenalty > 0) reasonCodes.push("STALE_STRATEGY_DRIFT_PENALTY");
      if (instabilityPenalty > 0.1) reasonCodes.push("INSTABILITY_PENALTY");
      if (!candidate.pattern) reasonCodes.push("NO_HISTORICAL_PATTERN");
      if (contextFit < 0.34) reasonCodes.push("CONTEXT_MISMATCH_PENALTY");
      return {
        strategyId: candidate.id,
        userId: input.userId,
        contextSignature: input.contextSignature,
        score: round(score),
        historicalFit,
        expectedUtility: round(contextualExpectedUtility),
        informationGain: clamp01(candidate.informationGain),
        risk: clamp01(candidate.risk),
        cost: clamp01(candidate.cost),
        instabilityPenalty: round(instabilityPenalty),
        driftPenalty: round(driftPenalty),
        reasonCodes,
      };
    })
    .sort((left, right) => right.score - left.score);
}

function chooseMetaAction(input: ShadowControlInput): { action: MetaAction; reasons: string[] } {
  const weakEvidence = input.uncertainty.epistemic.value >= 0.65;

  if (input.safetyRisk >= 0.7) {
    return {
      action: "ABSTAIN",
      reasons: [weakEvidence ? "HIGH_RISK_WEAK_EVIDENCE" : "SAFETY_DOMINANCE"],
    };
  }
  if (input.stability.status === "UNSTABLE") {
    return input.missingHighValueFields.length > 0
      ? { action: "ASK", reasons: ["INSTABILITY_REQUIRES_INFORMATION"] }
      : { action: "WAIT", reasons: ["INSTABILITY_HOLD_BASELINE"] };
  }
  if (input.pendingOutcomeWindow) {
    return { action: "WAIT", reasons: ["OUTCOME_WINDOW_NOT_MATURE"] };
  }
  if (input.missingHighValueFields.length > 0) {
    return { action: "ASK", reasons: ["HIGH_STATE_UNCERTAINTY", "HIGH_VALUE_DATA_MISSING"] };
  }
  if (input.uncertainty.epistemic.value >= 0.55 && input.retrievableEvidenceAvailable) {
    return { action: "RETRIEVE", reasons: ["MISSING_RETRIEVABLE_EVIDENCE"] };
  }
  if (input.uncertainty.causal.value >= 0.8) {
    return input.retrievableEvidenceAvailable
      ? { action: "RETRIEVE", reasons: ["CAUSAL_UNCERTAINTY_REQUIRES_EVIDENCE"] }
      : { action: "WAIT", reasons: ["CAUSAL_UNCERTAINTY_BLOCKS_STRATEGY_USE"] };
  }
  const plausible = input.strategies.filter((strategy) => strategy.score >= 0.45 && strategy.risk < 0.45);
  if (plausible.length >= 2 && input.uncertainty.strategy.value >= 0.35) {
    return { action: "EXPLORE", reasons: ["MULTIPLE_SAFE_PLAUSIBLE_STRATEGIES", "SHADOW_EXPLORATION_ONLY"] };
  }
  const best = input.strategies[0];
  if (best && best.score >= 0.55 && input.uncertainty.strategy.value < 0.5 && input.drift.status !== "CONFIRMED") {
    return { action: "USE", reasons: ["STABLE_CONTEXT_STRONG_STRATEGY"] };
  }
  if (input.retrievableEvidenceAvailable) {
    return { action: "RETRIEVE", reasons: ["INFORMATION_GAIN_BEATS_WEAK_ACTION"] };
  }
  return { action: "ABSTAIN", reasons: ["NO_SHADOW_ACTION_WITH_ADEQUATE_SUPPORT"] };
}

/**
 * Executes the Phase 3 branch, not merely the enum selection. The
 * output is shadow data only and is never routed into a production reply.
 */
export function executeShadowControlFlow(input: ShadowControlInput): ShadowFlowResult {
  const chosen = chooseMetaAction(input);
  const base = {
    action: chosen.action,
    selectedStrategyId: null,
    alternativeStrategyIds: [] as string[],
    questionTargets: [] as string[],
    retrievalContext: null as string | null,
    reasonCodes: chosen.reasons,
  };

  switch (chosen.action) {
    case "USE":
      return { ...base, selectedStrategyId: input.strategies[0]?.strategyId ?? null };
    case "ASK":
      return { ...base, questionTargets: input.missingHighValueFields.slice(0, 3) };
    case "RETRIEVE":
      return { ...base, retrievalContext: input.contextSignature };
    case "EXPLORE":
      return {
        ...base,
        alternativeStrategyIds: input.strategies
          .filter((strategy) => strategy.risk < 0.45)
          .slice(0, 3)
          .map((strategy) => strategy.strategyId),
      };
    case "WAIT":
    case "ABSTAIN":
      return base;
  }
}

const FAILURE_REACTIONS: Record<FailureClass, FailureReaction> = {
  TRANSIENT_SYSTEM: { failureClass: "TRANSIENT_SYSTEM", behavior: "RETRY_BACKOFF", metaAction: "WAIT" },
  TOOL_UNAVAILABLE: { failureClass: "TOOL_UNAVAILABLE", behavior: "FALLBACK", metaAction: "RETRIEVE" },
  PERMISSION_FAILURE: { failureClass: "PERMISSION_FAILURE", behavior: "REQUEST_AUTHORIZATION", metaAction: "ASK" },
  INVALID_ACTION: { failureClass: "INVALID_ACTION", behavior: "REPLAN", metaAction: "ABSTAIN" },
  ENVIRONMENT_MISMATCH: { failureClass: "ENVIRONMENT_MISMATCH", behavior: "REPLAN", metaAction: "ASK" },
  INSUFFICIENT_INFORMATION: { failureClass: "INSUFFICIENT_INFORMATION", behavior: "ASK_OR_RETRIEVE", metaAction: "ASK" },
  PREDICTION_FAILURE: { failureClass: "PREDICTION_FAILURE", behavior: "UPDATE_CALIBRATION", metaAction: "WAIT" },
  SAFETY_REJECTION: { failureClass: "SAFETY_REJECTION", behavior: "SAFE_ALTERNATIVE", metaAction: "ABSTAIN" },
  GOAL_INFEASIBLE: { failureClass: "GOAL_INFEASIBLE", behavior: "STOP_REFRAME", metaAction: "ABSTAIN" },
  UNKNOWN: { failureClass: "UNKNOWN", behavior: "REVIEW", metaAction: "WAIT" },
};

export function classifyFailure(input: {
  code?: string | null;
  message?: string | null;
  safetyRejected?: boolean;
  predictionWasWrong?: boolean;
}): FailureReaction {
  if (input.safetyRejected) return FAILURE_REACTIONS.SAFETY_REJECTION;
  if (input.predictionWasWrong) return FAILURE_REACTIONS.PREDICTION_FAILURE;
  const text = `${input.code ?? ""} ${input.message ?? ""}`.toLocaleLowerCase("en-US");
  if (/timeout|temporar|rate.?limit|network|503|502/.test(text)) return FAILURE_REACTIONS.TRANSIENT_SYSTEM;
  if (/tool.*(?:unavailable|missing)|missing tool|not implemented|connector.*(?:offline|unavailable)/.test(text)) return FAILURE_REACTIONS.TOOL_UNAVAILABLE;
  if (/permission|forbidden|unauthorized|401|403/.test(text)) return FAILURE_REACTIONS.PERMISSION_FAILURE;
  if (/invalid action|validation|malformed/.test(text)) return FAILURE_REACTIONS.INVALID_ACTION;
  if (/environment|equipment|schedule mismatch/.test(text)) return FAILURE_REACTIONS.ENVIRONMENT_MISMATCH;
  if (/insufficient|missing (?:data|user state)|not enough information/.test(text)) return FAILURE_REACTIONS.INSUFFICIENT_INFORMATION;
  if (/infeasible|impossible goal/.test(text)) return FAILURE_REACTIONS.GOAL_INFEASIBLE;
  return FAILURE_REACTIONS.UNKNOWN;
}
