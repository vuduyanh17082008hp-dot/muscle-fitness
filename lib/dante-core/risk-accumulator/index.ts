export type {
  BodyRegion,
  RiskEvaluationResult,
  RiskEvidenceRef,
  RiskHistoryTurn,
  RiskLevel,
  RiskLogFields,
  RiskRawObservation,
  RiskSignal,
  RiskSignalType,
} from "@/lib/dante-core/risk-accumulator/types";

export { normalizeBodyRegion, regionsMatch } from "@/lib/dante-core/risk-accumulator/body-region";
export {
  deriveObservationsFromHistory,
  observeFromUserMessage,
} from "@/lib/dante-core/risk-accumulator/observe";
export {
  DECAY_TO_NONE_DAYS,
  DECAY_TO_WATCH_DAYS,
  evaluateRiskSignals,
  FATIGUE_BASELINE_MIN,
  getActiveIrritationRegion,
  IRRITATION_ELEVATED_MIN,
  IRRITATION_WINDOW_DAYS,
  toRiskLogFields,
} from "@/lib/dante-core/risk-accumulator/evaluate";
export {
  buildRiskDeterministicReply,
  buildRiskPatternAck,
  getRiskLanguageDirective,
} from "@/lib/dante-core/risk-accumulator/prompt-injector";
