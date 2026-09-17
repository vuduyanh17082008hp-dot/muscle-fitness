import type { MetaAction, OutcomeDimensionName } from "@/lib/dante-core/shadow/types";

export const PHASE4_MODE = "VALIDATION_ONLY" as const;

export type ValidationEventType =
  | "RECOMMENDATION_TRACE"
  | "OUTCOME_OBSERVED"
  | "PREDICTION_EVALUATED"
  | "SHADOW_EVALUATED"
  | "DRIFT_EVALUATED"
  | "CALIBRATION_EVALUATED"
  | "MEMORY_PROVENANCE_RECORDED"
  | "INSTRUMENTATION_FAILURE";

export type EvidenceProvenance = {
  sourceTable: string;
  sourceEventId: string | null;
  sourceModule: string;
  capturedAt: string;
  rawEvidenceRetained: boolean;
  causalAuthority: "NONE";
};

export type ValidationEventRecord = {
  id: string;
  userId: string;
  eventType: ValidationEventType;
  recommendationId: string | null;
  parentEventId: string | null;
  contextSignature: ContextSignature | null;
  payload: Record<string, unknown>;
  provenance: EvidenceProvenance;
  occurredAt: string;
};

export type ContinuousOutcome = {
  kind: "continuous";
  value: number;
  unit: string;
  normalizationScale?: number;
};

export type PercentageOutcome = { kind: "percentage"; value: number };
export type CategoricalOutcome = { kind: "categorical"; value: string };
export type OrdinalOutcome = { kind: "ordinal"; value: string; order: readonly string[] };
export type BooleanOutcome = { kind: "boolean"; value: boolean };
export type StructuredSubjectiveOutcome = {
  kind: "structured_subjective";
  category: string;
  extractionConfidence: number;
  rawSource: string;
};
export type RawTextOutcome = { kind: "raw_text"; rawSource: string };

export type TypedOutcome =
  | ContinuousOutcome
  | PercentageOutcome
  | CategoricalOutcome
  | OrdinalOutcome
  | BooleanOutcome
  | StructuredSubjectiveOutcome
  | RawTextOutcome;

export type DimensionError =
  | { kind: "continuous"; absoluteError: number; normalizedError: number | null }
  | { kind: "percentage"; percentagePointError: number }
  | { kind: "categorical"; matches: boolean }
  | { kind: "ordinal"; distance: number }
  | { kind: "boolean"; correct: boolean }
  | { kind: "structured_subjective"; matches: boolean; extractionConfidence: number }
  | { kind: "unresolved"; reason: string };

export type DimensionEvaluation = {
  dimension: string;
  expected: TypedOutcome | null;
  actual: TypedOutcome | null;
  error: DimensionError;
  status: "ALIGNED" | "DIVERGENT" | "UNRESOLVED";
};

export type OutcomeEvaluation = {
  dimensions: DimensionEvaluation[];
  status: "ALIGNED" | "DIVERGENT" | "MIXED" | "UNRESOLVED" | "UNUSABLE";
};

export type ContextSignature = {
  hard: {
    athleteId: string;
    goal: string | null;
    acuteInjuryState: string | null;
    interventionFamily: string;
  };
  soft: Partial<Record<
    | "trainingPhase"
    | "movementFamily"
    | "volumeBand"
    | "intensityBand"
    | "recoveryBand"
    | "sleepBand"
    | "stressBand"
    | "energyBalance"
    | "experienceBand"
    | "adherenceBand",
    string
  >>;
  capturedAt: string;
};

export type ContextComparison = {
  compatible: boolean;
  score: number;
  hardMismatches: string[];
  components: Array<{ name: string; matches: boolean; weight: number }>;
};

export type OutcomeDimension = OutcomeDimensionName | "actual_intake" | "satiety_tolerance" | "completion";

export type FollowUpCandidate = {
  id: string;
  targetDimension: OutcomeDimension;
  prompt: string;
  uncertaintyReduction: number;
  userBurden: number;
  measurementCost: number;
  redundancy: number;
};

export type RecommendationHypothesis = {
  recommendationType: string;
  statement: string;
  requiredDimensions: OutcomeDimension[];
  candidates: FollowUpCandidate[];
};

export type SelectedFollowUp = FollowUpCandidate & { informationValue: number };

export type DriftStage = "NONE" | "ANOMALY" | "CANDIDATE" | "CONFIRMED";
export type DriftPolicy = {
  domain: string;
  magnitudeThreshold: number;
  candidatePoints: number;
  confirmationPoints: number;
  minimumConfidence: number;
};
export type DriftObservation = {
  domain: string;
  magnitude: number;
  confidence: number;
  explicitTransition: boolean;
  occurredAt: string;
};
export type DriftValidation = {
  domain: string;
  stage: DriftStage;
  qualifyingPoints: number;
  reasonCodes: string[];
};

export type ShadowEvaluationClass =
  | "AGREEMENT"
  | "DISAGREEMENT"
  | "EVALUABLE_DISAGREEMENT"
  | "UNEVALUABLE_DISAGREEMENT";
export type ShadowComparisonInput = {
  productionAction: string;
  shadowAction: MetaAction | string;
  expectedDimensionsOverlap: boolean;
  strategiesDefined: boolean;
  acceptableConfounding: boolean;
  outcomeAvailable: boolean;
  criticalMissingVariableFound?: boolean;
};
export type ShadowEvaluation = {
  classification: ShadowEvaluationClass;
  informationSeekingSupported: boolean | null;
  reasonCodes: string[];
  shadowWasBetter: null;
};

export type CalibrationDomain =
  | "recovery_prediction"
  | "performance_prediction"
  | "adherence_prediction"
  | "causal_attribution"
  | "strategy_selection"
  | "tool_execution";
export type DomainCalibrationState = {
  domain: CalibrationDomain;
  sampleCount: number;
  weightedBrierScore: number | null;
  confidenceAdjustment: number;
};

export type GateStatus = "PASS" | "FAIL" | "INSUFFICIENT_DATA";
export type PromotionReadinessReport = {
  mode: "SHADOW";
  mayPromote: false;
  generatedAt: string;
  gates: Record<
    | "safety"
    | "isolation"
    | "traceability"
    | "outcomeCoverage"
    | "calibration"
    | "drift"
    | "stability"
    | "shadowValue"
    | "memoryProvenance"
    | "dataCompleteness",
    GateStatus
  >;
};
