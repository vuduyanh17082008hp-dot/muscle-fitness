/**
 * ICH-1 Shared Performance Intelligence Core — public surface. Pure, synchronous, provider-free.
 * Not re-exported from lib/intelligence/index.ts on purpose: `ClaimType` there means a per-turn ledger entry.
 */
export * from "./types";
export { SOURCE_REGISTRY, getSource, citeSource } from "./sources";
export {
  KNOWLEDGE_RECORDS, KNOWLEDGE_GAPS, citedCanonicalSources, claimEvidenceScopes, getRecord, knowledgeEvidenceLine, resolveKnowledge, retrievalWarranted, retrievedDocumentRelevant,
  retrievedPopulation, settleKnowledgeState, turnApplicability, validateRegistry,
} from "./registry";
export {
  classifyAssistantFeedback, controlDirectives, detectAddressBans, detectExplicitLanguageRequest, detectTurnLanguageRequest, detectUserCorrection, resolveConversationControl,
  type ConversationControlInput, type ExplicitLanguageRequest,
} from "./conversation-control";
export { assessOption, assessOptions, decideCandidates, decideRecommendation, decideSafetyPosture, isSupplementTurn, extractNeedContext, missingContext, strongestSupport, substanceIntentOf, type PostureInput, type SupplementScreenKind } from "./policy";
export { buildIntelligenceBrief, scopedPromptBlock, settleBrief, type BriefInput } from "./brief";
export { checkOutputIntegrity, tierContradictions, enforceIntegrity, enforceSafetyConstraints,hasCriticalViolation, integrityCorrectionBrief, safeContinuationPresent, stripDosing } from "./output-integrity";
export { OUTCOME_CONCEPTS, scopeBroadeningsIn, scopedRestatement, type ScopeBroadening } from "./claim-scope";
export {
  acceptIntegrityRetry, candidateItems, renderCandidateAnswer, renderCandidateBlock, applyScopedAnswerIntegrity, buildAnswerTrace, calibrateEvidenceWording, completeObligations, deriveObligations, identitySatisfiesDefine, obligationDisposition, obligationScore, restrictedSubstanceReply, stripModelAuthoredSources,
  type AnswerObligation, type AnswerTrace, type ObligationDisposition,
} from "./answerability";
export {
  activeFacts, activeKeys, buildContextWorkingSet, clinicallyBounded, hasActive, renderContextWorkingSet, retractedSafetyKeys,
  type ContextFact, type ContextFactKind, type ContextWorkingSet,
} from "./context-working-set";
