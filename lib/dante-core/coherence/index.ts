export type {
  AddressForm,
  ChatHistoryTurn,
  CoherenceDisposition,
  CoherenceTurnResult,
  ContextMode,
  CoreConflictDecision,
  CoreConflictLabel,
  DeltaClass,
  DeltaOp,
  EntryClass,
  ExpressionDimension,
  ExpressionPlan,
  AddressStyle,
  Familiarity,
  Humor,
  ExpressionVerbosity,
  UserExpressionProfile,
  CategoricalPreference,
  GateResult,
  OpenLoop,
  PostTurnEvent,
  ResponseStrategy,
  SafetyPhase,
  SessionLanguage,
  SessionLifecycle,
  StateDelta,
  TurnAnalysis,
  VersionedSlot,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

export {
  applyDelta,
  createInitialState,
  freezeSnapshot,
  validateDelta,
  activeCorrections,
  activeBoundaries,
  relevantOpenLoops,
} from "@/lib/dante-core/coherence/reducer";

export {
  classifySessionLifecycle,
  loadSessionSnapshot,
  routeEntry,
} from "@/lib/dante-core/coherence/session";

export { analyzeTurn, evaluateGateA, resolveLanguage } from "@/lib/dante-core/coherence/analysis";
export { composeStrategies, evaluateGateB, nextSafetyPhase } from "@/lib/dante-core/coherence/strategy";
export {
  enforceFinalSurface,
  finishCoherenceDraft,
  prepareCoherenceTurn,
  runCoherenceTurn,
  emptySession,
} from "@/lib/dante-core/coherence/pipeline";
export type { PreparedCoherence } from "@/lib/dante-core/coherence/pipeline";
export { buildSafetyContinuation, buildUngroundedContinuationClarification } from "@/lib/dante-core/coherence/realize";
export { applyDecisionFirst, decideObligationDecisionState, isBinaryCoachingQuestion, resolveDecisionState } from "@/lib/dante-core/coherence/decision-first";
export type { DecisionState } from "@/lib/dante-core/coherence/decision-first";
export {
  applyAccessiblePresentation,
  detectHideStatistics,
  detectSimpleLanguage,
  resolveAccessibleProfile,
} from "@/lib/dante-core/coherence/presentation";
export type { AccessibleCommunicationProfile } from "@/lib/dante-core/coherence/presentation";
export { applyEvidenceLite, classifyClaimGrounding } from "@/lib/dante-core/coherence/evidence-lite";
export type { ClaimGroundingNeed } from "@/lib/dante-core/coherence/evidence-lite";
export { applyPersonalPt } from "@/lib/dante-core/coherence/personal-pt";
export {
  applyPersistedSafetyConstraint,
  derivePersistedSafetyScope,
  resolvePersistedSafetyApplication,
} from "@/lib/dante-core/coherence/safety-persistence";
export type {
  AffectedBodyArea,
  PersistedSafetyMode,
  PersistedSafetyScope,
} from "@/lib/dante-core/coherence/safety-persistence";
export {
  buildObligationLedger,
  checkDispositions,
  disposeOpenRequests,
  isDeterministicLedger,
  isLedgerMultiTurn,
  openRequests,
  verifyLedgerCoverage,
} from "@/lib/dante-core/coherence/ledger";
export type { ObligationLedger } from "@/lib/dante-core/coherence/ledger";
export { classifySafetyEvidence, advanceSafetyPhase, recoverSafetyFromHistory } from "@/lib/dante-core/coherence/safety-evidence";
export { normalizeInput, segmentDiscourse } from "@/lib/dante-core/coherence/understanding";
export { inferVerbosityPreference, detectAddressSignal, hasCustomerServiceDrift } from "@/lib/dante-core/coherence/style";
export {
  DANTE_BASELINE,
  resolveContextMode,
  resolveExpressionPlan,
  buildStyleHint,
  FAMILIARITY_RENDER_MAP,
  ADDRESS_RENDER_MAP,
} from "@/lib/dante-core/coherence/expression";
export { interpretExpressionFeedback } from "@/lib/dante-core/coherence/expression-feedback";
export {
  CORE_CONFLICT_CONFIDENCE_THRESHOLD,
  CORE_CONFLICT_PROMPT_VERSION,
  classifyCoreConflict,
  coreConflictPromptHash,
  decideCoreConflict,
  coreConflictGuard,
} from "@/lib/dante-core/coherence/core-conflict";
export {
  authorizeBlocks,
  blockSurfaceText,
  buildAuthorityContext,
  degradedAck,
} from "@/lib/dante-core/coherence/authority";
export {
  applyTargetBinding,
  confidenceReplyEligible,
  currentAsksVolumeCause,
  isVolumeAttributionCanned,
  resolveBindingStatus,
} from "@/lib/dante-core/coherence/target-binding";
export type { BindingStatus } from "@/lib/dante-core/coherence/target-binding";
export type { AuthorityContext } from "@/lib/dante-core/coherence/authority";
export type { CoreConflictClassifier } from "@/lib/dante-core/coherence/core-conflict";
export {
  MAX_PERSONA_REWRITE_ATTEMPTS,
  enforcePersonaGate,
  evaluatePersonaGate,
  findDirectVocatives,
  renderNeutralBlocks,
  renderNeutralFallback,
} from "@/lib/dante-core/coherence/persona-gate";
export type { SafetyContinuation } from "@/lib/dante-core/coherence/realize";
