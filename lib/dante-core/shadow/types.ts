import type { ContextKey, DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";

export const PHASE3_PROMOTION_LEVELS = [
  "SHADOW",
  "ASSISTED",
  "LIMITED_LIVE",
  "ADAPTIVE_LIVE",
] as const;

export type Phase3PromotionLevel = (typeof PHASE3_PROMOTION_LEVELS)[number];

/** Deliberately hard-coded. Changing this requires a future developer change. */
export const CURRENT_PHASE3_PROMOTION_LEVEL: Phase3PromotionLevel = "SHADOW";

export type MetaAction = "USE" | "ASK" | "RETRIEVE" | "EXPLORE" | "WAIT" | "ABSTAIN";

export type SignalSource =
  | "athlete_state"
  | "user_message"
  | "phase1_safety"
  | "temporal_context"
  | "phase2_memory";

export type StructuredSignal = {
  userId: string;
  kind: string;
  value: string | number | boolean | null | string[];
  source: SignalSource;
  confidence: number;
  timestamp: string;
};

export type ExtractedSignals = {
  userId: string;
  timestamp: string;
  contextSignature: ContextKey;
  keyphrases: StructuredSignal[];
  metrics: StructuredSignal[];
  intents: StructuredSignal[];
  training: StructuredSignal[];
  recovery: StructuredSignal[];
  nutrition: StructuredSignal[];
  preferences: StructuredSignal[];
  temporal: StructuredSignal[];
  safety: StructuredSignal[];
};

export type UncertaintyDimension = {
  value: number;
  reasonCodes: string[];
};

export type UncertaintyProfile = {
  epistemic: UncertaintyDimension;
  state: UncertaintyDimension;
  causal: UncertaintyDimension;
  strategy: UncertaintyDimension;
  outcome: UncertaintyDimension;
  tool: UncertaintyDimension;
};

export type AthleteDriftSnapshot = {
  userId: string;
  capturedAt: string;
  goal: string | null;
  sleepHours: number | null;
  scheduleDays: number | null;
  stress: number | null;
  trainingLoad: number | null;
  recoveryScore: number | null;
  calorieAdherence: number | null;
  adherence: number | null;
  communicationPreference: string | null;
};

export type DriftDomain = Exclude<keyof AthleteDriftSnapshot, "userId" | "capturedAt">;

export type DriftEvidence = {
  domain: DriftDomain;
  magnitude: number;
  persistence: number;
  confidence: number;
  direction: "UP" | "DOWN" | "CHANGED" | "NONE";
  confirmed: boolean;
};

export type DriftAssessment = {
  userId: string;
  status: "NONE" | "CANDIDATE" | "CONFIRMED";
  magnitude: number;
  persistence: number;
  confidence: number;
  evidence: DriftEvidence[];
  reasonCodes: string[];
};

export type AdaptationRecord = {
  userId: string;
  action: string;
  direction: "INCREASE" | "DECREASE" | "HOLD" | "OTHER";
  value: number | null;
  outcomeImproved: boolean | null;
  evidenceSource: "independent_outcome" | "dante_recommendation" | "user_report" | "tool_result";
  occurredAt: string;
};

export type StabilityAssessment = {
  userId: string;
  status: "STABLE" | "WATCH" | "UNSTABLE";
  risk: number;
  oscillation: boolean;
  repeatedReversals: boolean;
  runaway: boolean;
  selfCreatedEvidenceLoop: boolean;
  repeatedWithoutImprovement: boolean;
  reasonCodes: string[];
};

export type ShadowStrategyCandidate = {
  id: string;
  userId: string;
  contextSignature: ContextKey;
  expectedUtility: number;
  informationGain: number;
  risk: number;
  cost: number;
  pattern?: DanteLearnedPattern;
};

export type ShadowStrategyScore = {
  strategyId: string;
  userId: string;
  contextSignature: ContextKey;
  score: number;
  historicalFit: number;
  expectedUtility: number;
  informationGain: number;
  risk: number;
  cost: number;
  instabilityPenalty: number;
  driftPenalty: number;
  reasonCodes: string[];
};

export type ShadowControlInput = {
  userId: string;
  contextSignature: ContextKey;
  uncertainty: UncertaintyProfile;
  drift: DriftAssessment;
  stability: StabilityAssessment;
  strategies: ShadowStrategyScore[];
  missingHighValueFields: string[];
  retrievableEvidenceAvailable: boolean;
  pendingOutcomeWindow: boolean;
  safetyRisk: number;
};

export type ShadowFlowResult = {
  action: MetaAction;
  selectedStrategyId: string | null;
  alternativeStrategyIds: string[];
  questionTargets: string[];
  retrievalContext: ContextKey | null;
  reasonCodes: string[];
};

export type ShadowDecision = ShadowFlowResult & {
  userId: string;
  promotionLevel: Phase3PromotionLevel;
  confidence: number;
  createdAt: string;
};

export type OutcomeDimensionName =
  | "recovery"
  | "performance"
  | "adherence"
  | "pain_safety"
  | "sleep"
  | "subjective_response";

export type OutcomeValue = "IMPROVED" | "MAINTAINED" | "DECLINED" | "UNKNOWN";

export type MultiDimensionalOutcome = Record<OutcomeDimensionName, OutcomeValue>;

export type OutcomeLink = {
  userId: string;
  recommendationId: string;
  horizon: string;
  expected: MultiDimensionalOutcome;
  actual: MultiDimensionalOutcome | null;
  status: "PENDING" | "EVALUATED" | "UNKNOWN";
  errors: Partial<Record<OutcomeDimensionName, -1 | 0 | 1 | null>>;
  evaluatedAt: string | null;
};

export type CalibrationDomain =
  | "recovery_prediction"
  | "performance_prediction"
  | "strategy_selection"
  | "causal_attribution"
  | "tool_execution";

export type CalibrationObservation = {
  userId: string;
  domain: CalibrationDomain;
  contextSignature: ContextKey;
  priorConfidence: number;
  correct: boolean;
  observedAt: string;
};

export type CalibrationSummary = {
  userId: string;
  domain: CalibrationDomain;
  sampleCount: number;
  meanConfidence: number;
  observedAccuracy: number;
  calibrationError: number;
};

export type FailureClass =
  | "TRANSIENT_SYSTEM"
  | "TOOL_UNAVAILABLE"
  | "PERMISSION_FAILURE"
  | "INVALID_ACTION"
  | "ENVIRONMENT_MISMATCH"
  | "INSUFFICIENT_INFORMATION"
  | "PREDICTION_FAILURE"
  | "SAFETY_REJECTION"
  | "GOAL_INFEASIBLE"
  | "UNKNOWN";

export type FailureReaction = {
  failureClass: FailureClass;
  behavior: "RETRY_BACKOFF" | "FALLBACK" | "REQUEST_AUTHORIZATION" | "REPLAN" | "ASK_OR_RETRIEVE" | "UPDATE_CALIBRATION" | "SAFE_ALTERNATIVE" | "STOP_REFRAME" | "REVIEW";
  metaAction: MetaAction;
};

export type ConsolidationAction = "RETAIN" | "MERGE" | "REVISE" | "QUARANTINE" | "REJECT";

export type ConsolidationCandidate = {
  userId: string;
  candidateId: string;
  provenanceEpisodeIds: string[];
  evidenceCount: number;
  confidence: number;
  contradictionCount: number;
  cleanContradictionCount: number;
  stale: boolean;
  supported: boolean;
  anomalousOutcomeCount: number;
};

export type ConsolidationDecision = {
  userId: string;
  candidateId: string;
  action: ConsolidationAction;
  reasonCodes: string[];
  preservedEpisodeIds: string[];
};

export type ShadowEventType =
  | "SHADOW_DECISION"
  | "OUTCOME_LINKED"
  | "CALIBRATION_UPDATED"
  | "CONSOLIDATION_DECISION";
