export type {
  ClaimCategory,
  ClaimConfidence,
  ConfidenceAssessmentContext,
  ConfidenceLevel,
  ConfidenceLogFields,
  EvidenceStrength,
  ProvenanceQuality,
} from "@/lib/dante-core/confidence-engine/types";

export { evaluateClaimConfidence } from "@/lib/dante-core/confidence-engine/evaluator";
export {
  getConfidenceLanguageDirective,
  toConfidenceLogFields,
} from "@/lib/dante-core/confidence-engine/prompt-injector";
export {
  assessTurnConfidence,
  type AssessTurnConfidenceInput,
  type TurnConfidenceAssessment,
} from "@/lib/dante-core/confidence-engine/assess";
export { buildConfidenceDeterministicReply } from "@/lib/dante-core/confidence-engine/deterministic-reply";
