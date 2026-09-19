export type {
  ExperimentResultConfidence,
  ExperimentResultKind,
  ExperimentStatus,
  NOf1Experiment,
  Nof1EligibilityResult,
  Nof1EvaluationInput,
  Nof1LogFields,
  Nof1Session,
  Nof1Trigger,
  ProtocolAdherence,
} from "@/lib/dante-core/nof1-engine/types";

export {
  detectNof1Trigger,
  evaluateNof1Eligibility,
  isSingleSessionOvertrigger,
  isUnsafeExperimentRequest,
} from "@/lib/dante-core/nof1-engine/eligibility";

export { buildExperimentProposal } from "@/lib/dante-core/nof1-engine/propose";

export {
  applyConfoundersToExperiment,
  assessProtocolAdherence,
  detectConfoundersFromMessage,
  mergeConfounders,
} from "@/lib/dante-core/nof1-engine/confounders";

export {
  buildLearningEvidenceNote,
  evaluateNof1Experiment,
} from "@/lib/dante-core/nof1-engine/evaluate";

export {
  abortExperimentForSafety,
  applyConsent,
  cancelExperiment,
  createEmptyNof1Session,
  deriveNof1SessionFromHistory,
  detectsAssumedConsent,
  detectsCancel,
  detectsExplicitAccept,
  detectsExperimentCompletionRequest,
  detectsMaybe,
  detectsOutcomeReport,
  detectsRetry,
  detectsExperimentStatusQuery,
} from "@/lib/dante-core/nof1-engine/lifecycle";

export {
  ensureNof1Session,
  processNof1Turn,
} from "@/lib/dante-core/nof1-engine/turn";
export type { Nof1PersistPatch, Nof1TurnResult } from "@/lib/dante-core/nof1-engine/turn";

export {
  canTransitionNof1Status,
  isDurableNof1Id,
} from "@/lib/dante-core/nof1-engine/persistence-guard";
export {
  loadActiveNof1Experiment,
  loadLatestFailedNof1Proposal,
  persistAcceptedNof1Experiment,
  updateNof1Experiment,
} from "@/lib/dante-core/nof1-engine/persistence";

export {
  buildNof1AcceptedReply,
  buildNof1AssumedConsentReply,
  buildNof1CancelledReply,
  buildNof1CompletionReply,
  buildNof1ConfoundedReply,
  buildNof1ConfounderRecordedReply,
  buildNof1EligibilityReply,
  buildNof1ProposalReply,
  buildNof1TooEarlyReply,
  buildNof1UnsafeReply,
  buildNof1StatusReply,
  buildNof1InactiveLifecycleReply,
  buildNof1InsufficientOutcomeReply,
  buildNof1ProgressReply,
} from "@/lib/dante-core/nof1-engine/replies";

export function toNof1LogFields(experiment: import("@/lib/dante-core/nof1-engine/types").NOf1Experiment | null): import("@/lib/dante-core/nof1-engine/types").Nof1LogFields {
  if (!experiment) {
    return {
      experimentId: null,
      status: null,
      variableUnderTest: null,
      controlledVariableCount: 0,
      confounderCount: 0,
      userConfirmed: false,
      result: null,
    };
  }
  return {
    experimentId: experiment.id,
    status: experiment.status,
    variableUnderTest: experiment.variableUnderTest,
    controlledVariableCount: experiment.controlledVariables.length,
    confounderCount: experiment.confounders.length,
    userConfirmed: experiment.userConfirmed,
    result: experiment.conclusion?.result ?? null,
  };
}
