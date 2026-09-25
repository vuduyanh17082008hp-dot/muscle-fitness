/**
 * Dante Core public API (spec Part A §27).
 *
 *   dante.evaluateReadiness()
 *   dante.evaluateSet()          (= generateRecommendation, set-level autoregulation)
 *   dante.generateRecommendation()
 *   dante.explainRecommendation()
 *
 * Import from "@/lib/dante-core" rather than reaching into individual
 * engine files, so this list stays the actual contract boundary
 * between Dante Core and the rest of Muscle Fitness / SetVision.
 */

export { evaluateReadiness } from "@/lib/dante-core/readiness-engine";
export { evaluateTrend } from "@/lib/dante-core/trend-engine";
export { generateRecommendation } from "@/lib/dante-core/autoregulation-engine";
export { generateRecommendation as evaluateSet } from "@/lib/dante-core/autoregulation-engine";
export { buildAutoregulationTraceableDecision } from "@/lib/dante-core/decision-object";
export {
  explainRecommendation,
  attachKnowledgeSources,
} from "@/lib/dante-core/explain";
export { checkSafety, normalizeSafetyText } from "@/lib/dante-core/safety-layer";
export {
  buildCurrentStateCoachingResponse,
  extractCurrentTurnState,
  formatCurrentStatePrompt,
} from "@/lib/dante-core/current-turn-state";
export type { CurrentTurnState } from "@/lib/dante-core/current-turn-state";
export {
  assessTurnConfidence,
  buildConfidenceDeterministicReply,
  evaluateClaimConfidence,
  getConfidenceLanguageDirective,
} from "@/lib/dante-core/confidence-engine";
export type {
  ClaimCategory,
  ClaimConfidence,
  ConfidenceAssessmentContext,
  TurnConfidenceAssessment,
} from "@/lib/dante-core/confidence-engine";
export type { ConfidenceLevel as ClaimConfidenceLevel } from "@/lib/dante-core/confidence-engine";
export {
  buildRiskDeterministicReply,
  buildRiskPatternAck,
  deriveObservationsFromHistory,
  evaluateRiskSignals,
  getRiskLanguageDirective,
  normalizeBodyRegion,
  observeFromUserMessage,
  toRiskLogFields,
} from "@/lib/dante-core/risk-accumulator";
export type {
  BodyRegion,
  RiskEvaluationResult,
  RiskLevel,
  RiskSignal,
  RiskSignalType,
} from "@/lib/dante-core/risk-accumulator";
export {
  buildExperimentProposal,
  buildLearningEvidenceNote,
  buildNof1AcceptedReply,
  buildNof1ProposalReply,
  canTransitionNof1Status,
  deriveNof1SessionFromHistory,
  evaluateNof1Eligibility,
  evaluateNof1Experiment,
  isDurableNof1Id,
  processNof1Turn,
  toNof1LogFields,
} from "@/lib/dante-core/nof1-engine";
export type {
  ExperimentStatus,
  NOf1Experiment,
  Nof1EligibilityResult,
  Nof1Session,
} from "@/lib/dante-core/nof1-engine";
export {
  buildSocialBoundaryResponse,
  createSocialRouterSession,
  deriveSocialSessionFromHistory,
  evaluateSocialBoundary,
  toSocialRouterLogFields,
} from "@/lib/dante-core/social-boundary-router";
export type {
  SocialEvaluation,
  SocialMode,
  SocialRouterLogFields,
  SocialRouterOptions,
  SocialRouterSession,
  SocialResponseLanguage,
  SocialTarget,
} from "@/lib/dante-core/social-boundary-router";
export { validatePremises } from "@/lib/dante-core/premise-validation";
export {
  verifyFinalResponse,
  runVerifiedGeneration,
  buildCorrectionBrief,
  MAX_VERIFIER_RETRIES,
} from "@/lib/dante-core/verifier";
export {
  evaluateAdaptiveClosedLoop,
  processRecoveryOutcomeForLearning,
  buildExpectedOutcome,
  computePredictionError,
} from "@/lib/dante-core/adaptive-closed-loop";
export { assertLearningScope, IMMUTABLE_LEARNING_DOMAINS } from "@/lib/dante-core/learning-guardrails";
export { callOpenAiWithFallback, streamDanteReply } from "@/lib/dante-core/openai/client";
export {
  buildDailyIntelligence,
  recomputeDailyIntelligence,
  getOrBuildDailyIntelligence,
} from "@/lib/dante-core/daily-intelligence";
export { retrieveKnowledge, retrieveByCategory } from "@/lib/dante-core/knowledge/retrieve";

// Phase 2 public surface (additive)
export {
  createWorkingMemory,
  putSessionFact,
  observationToShortTerm,
  promoteToLongTerm,
  decayLongTerm,
  resolveCurrentOverStale,
  assertSameClient,
} from "@/lib/dante-core/memory-hierarchy/memory-foundation";
export {
  createRecommendationRecord,
  evaluateRecommendationOutcome,
  mapObservedToOutcomeClass,
  classifyOutcomeWithCausalHumility,
  outcomeClassToObserved,
} from "@/lib/dante-core/recommendation-outcome";
export {
  scoreStrategy,
  rankStrategies,
  contextSimilarity,
  summarizeStrategyHistory,
} from "@/lib/dante-core/strategy-learner";
export {
  resolveCommunicationMode,
  resolveCommunicationStyle,
  buildCommunicationPromptHints,
  detectTurnCommunicationSignals,
  updateCommunicationProfile,
  buildProfileFromRecentMessages,
  createDefaultCommunicationProfile,
  checkCommunicationPreferenceProvenance,
} from "@/lib/dante-core/communication-adaptation";
export {
  computePilotReadiness,
  summarizeTopStrategies,
  toRecommendationTelemetry,
  assertPilotClientIsolation,
  assessTechnicalPilotCapability,
} from "@/lib/dante-core/pilot-readiness";
export {
  checkMemoryClaimProvenance,
  evaluateCausalOutcome,
  canPromoteAutomaticPolicy,
  filterCitationsForClaim,
  filterCitationsByTopicRelevance,
  persistenceClaimAllowed,
  assertRawEvidenceImmutable,
  extractOutcomeNarrativeSignals,
  shouldCountAsPositiveLearningEvidence,
  toVerifiedMemorySnapshot,
  authorizeMemoryWrite,
  applyForgetConfoundersPressure,
  detectsUnverifiedPriorPerformanceClaim,
  enforceEpistemicReplyBoundaries,
  buildHardEpistemicFinalConstraints,
} from "@/lib/dante-core/epistemic-integrity";

// Phase 3 public surface. All runtime integration is hard-gated to SHADOW.
export {
  buildUncertaintyProfile,
  detectAthleteDrift,
  assessAdaptationStability,
  informationValue,
  scoreContextualStrategies,
  executeShadowControlFlow,
  classifyFailure,
} from "@/lib/dante-core/shadow/adaptive-control";
export {
  unknownOutcome,
  linkRecommendationOutcome,
  summarizeCalibration,
  calibrationObservationFromOutcome,
} from "@/lib/dante-core/shadow/outcome-calibration";
export {
  governConsolidation,
  reevaluateFromRawEpisodes,
} from "@/lib/dante-core/shadow/consolidation-governor";
export {
  extractStructuredSignals,
  athleteStateToDriftSnapshot,
} from "@/lib/dante-core/shadow/signal-extraction";
export {
  CURRENT_PHASE3_PROMOTION_LEVEL,
  PHASE3_PROMOTION_LEVELS,
} from "@/lib/dante-core/shadow/types";

export type {
  MetaAction,
  ExtractedSignals,
  UncertaintyProfile,
  AthleteDriftSnapshot,
  DriftAssessment,
  AdaptationRecord,
  StabilityAssessment,
  ShadowStrategyCandidate,
  ShadowStrategyScore,
  ShadowDecision,
  MultiDimensionalOutcome,
  OutcomeLink,
  CalibrationObservation,
  CalibrationSummary,
  FailureClass,
  FailureReaction,
  ConsolidationCandidate,
  ConsolidationDecision,
} from "@/lib/dante-core/shadow/types";

export type {
  ReadinessEngineInput,
  ReadinessResult,
  MuscleRecoveryEstimate,
  SystemicFatigueLevel,
  TrendEvaluation,
  SetVisionTrendPoint,
  AutoregulationInput,
  AutoregulationDecision,
  AutoregulationDecisionCode,
  SessionRecommendation,
  PlannedSet,
  SetVisionSessionSignal,
  TraceableDecision,
  KnowledgeSourceRef,
  ConfidenceLevel,
} from "@/lib/dante-core/types";
export type { SafetyCategory, SafetyCheckResult } from "@/lib/dante-core/safety-layer";
export type { PremiseIssue, PremiseIssueType, PremiseValidationInput } from "@/lib/dante-core/premise-validation";
export type {
  VerifierCheckCode,
  VerifierFact,
  VerifierFinding,
  VerifierInput,
  VerifierResult,
  VerifierSafetyState,
  VerifiedGenerationResult,
} from "@/lib/dante-core/verifier";
export type { DailyIntelligence } from "@/lib/dante-core/daily-intelligence";
export type { KnowledgeEntry, KnowledgeCategory } from "@/lib/dante-core/knowledge/types";

// Adaptive Coach V2 — structural cognition + natural response plane
export {
  interpretUserTurn,
  evaluateContrastiveSafety,
  semanticSafetySignals,
  buildDanteDecision,
  runAdaptiveCoachTurn,
  scrubInternalJargon,
  containsInternalJargon,
  applyUserCorrection,
  localizeFailure,
  interpretAmbiguousHistory,
  isAssistantGeneratedEvidenceAllowed,
  retrieveLifeWorldPatterns,
  evolveFailureCase,
  eliminateEvolvedCase,
  scheduleContext,
  createCapsule,
} from "@/lib/dante-core/adaptive-coach-v2";
export type {
  DanteDecision,
  DanteContextCapsule,
  SemanticInterpretation,
  FailureClass as DanteV2FailureClass,
} from "@/lib/dante-core/adaptive-coach-v2";

// Phase 1 — Runtime Convergence Foundation
export {
  finalizeDanteResponse,
  applyHardSafetySurfaceContract,
  emitConvergedSingleShot,
  finalizeProviderReply,
  computeResponseFingerprint,
  normalizeForFingerprint,
  buildAuthoritativeResponseState,
  extractCausalTargetFromText,
  projectClaims,
} from "@/lib/dante-core/runtime-convergence";
export type {
  DanteResponseBranch,
  DanteRouteMetadata,
  PersonaContract,
  SafetySurfaceClass,
  FinalizerResponseIntent,
  AuthoritativeResponseState,
} from "@/lib/dante-core/runtime-convergence";

// Phase 2 — Conversation coherence (overlay on Phase 1)
export {
  applyDelta,
  createInitialState,
  runCoherenceTurn,
  prepareCoherenceTurn,
  finishCoherenceDraft,
  freezeSnapshot,
  loadSessionSnapshot,
} from "@/lib/dante-core/coherence";
export type {
  VersionedState,
  StateDelta,
  CoherenceTurnResult,
  ChatHistoryTurn,
} from "@/lib/dante-core/coherence";
