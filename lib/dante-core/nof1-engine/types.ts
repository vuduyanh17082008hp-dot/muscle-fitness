export type ExperimentStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "PENDING_CONFIRMATION"
  | "ACTIVATION_FAILED"
  | "ACTIVE"
  | "CONFOUNDED"
  | "COMPLETED"
  | "CANCELLED"
  | "ABORTED";

export type ExperimentResultKind = "SUPPORTS" | "DOES_NOT_SUPPORT" | "INCONCLUSIVE";

export type ExperimentResultConfidence = "MODERATE" | "LOW" | "INSUFFICIENT_EVIDENCE";

export type ProtocolAdherence = "COMPLETE" | "PARTIAL" | "POOR";

export type Nof1Trigger =
  | "COMPETING_CAUSES"
  | "REPEATED_PREDICTION_ERROR"
  | "PERSISTENT_UNCERTAINTY"
  | "CONFOUNDED_BUT_CONTROLLABLE"
  | "NONE";

export interface NOf1Experiment {
  id: string;
  hypothesis: string;
  rationale: string;
  controlledVariables: string[];
  variableUnderTest: string;
  primaryOutcome: string;
  secondaryOutcomes?: string[];
  baselineWindow?: {
    start: string;
    end: string;
  };
  experimentWindow: {
    start: string;
    end: string;
    durationDays: number;
  };
  confounders: string[];
  status: ExperimentStatus;
  userConfirmed: boolean;
  createdAt: string;
  completedAt?: string;
  protocolAdherence?: ProtocolAdherence;
  conclusion?: {
    result: ExperimentResultKind;
    confidence: ExperimentResultConfidence;
    reasons: string[];
  };
  /** Product template id for deterministic proposal class. */
  templateId?: "SLEEP_VS_VOLUME" | "MEAL_TIMING" | "GENERIC_CONTROLLABLE";
  /** Present only for a recoverable failed activation reconstructed from tool actions. */
  activationError?: string;
}

export type Nof1EligibilityResult = {
  eligible: boolean;
  trigger: Nof1Trigger;
  reasons: string[];
  blockedBySafety: boolean;
  blockedByRisk: boolean;
  tooEarly: boolean;
};

export type Nof1Session = {
  experiment: NOf1Experiment | null;
  lastProposalId: string | null;
};

export type Nof1LogFields = {
  experimentId: string | null;
  status: ExperimentStatus | null;
  variableUnderTest: string | null;
  controlledVariableCount: number;
  confounderCount: number;
  userConfirmed: boolean;
  result: ExperimentResultKind | null;
};

export type Nof1EvaluationInput = {
  experiment: NOf1Experiment;
  /** Structured outcome narrative from the user (current turn). */
  outcomeReport: {
    rpeImproved?: boolean;
    rpeWorsened?: boolean;
    performanceImproved?: boolean;
    performanceUnchanged?: boolean;
    volumeHeld?: boolean;
    sleepImproved?: boolean;
    missingOutcome?: boolean;
  };
  confounderCount: number;
  protocolAdherence: ProtocolAdherence;
};
