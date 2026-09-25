export type {
  DanteResponseBranch,
  DanteRouteMetadata,
  FinalizeDanteResponseInput,
  FinalizeDanteResponseResult,
  FinalizerResponseIntent,
  HardSafetySurfaceInput,
  HardSafetySurfaceResult,
  PersonaContract,
  ResponseFingerprintInput,
  SafetySurfaceClass,
} from "@/lib/dante-core/runtime-convergence/types";

export {
  normalizeForFingerprint,
  canonicalizeRecommendationCode,
  canonicalizeCausalTarget,
  computeResponseFingerprint,
  deriveSafetySurfaceClass,
  mapBranchToFinalizerIntent,
} from "@/lib/dante-core/runtime-convergence/fingerprint";

export { finalizeDanteResponse } from "@/lib/dante-core/runtime-convergence/finalize";
export {
  applyHardSafetySurfaceContract,
  assertNoMetadataLeak,
  deriveHardSafetyDirective,
} from "@/lib/dante-core/runtime-convergence/hard-safety-surface";
export {
  defaultPersonaContract,
  emitConvergedSingleShot,
  finalizeProviderReply,
} from "@/lib/dante-core/runtime-convergence/emit";
export {
  buildAuthoritativeResponseState,
  extractCausalTargetFromText,
  buildStructuredActiveContextMeaning,
} from "@/lib/dante-core/runtime-convergence/authoritative-state";
export type {
  AuthoritativeResponseState,
  CanonicalClaim,
  ProvenanceConstraint,
  CausalClaim,
} from "@/lib/dante-core/runtime-convergence/authoritative-state";
export { projectClaims, scrubRawContextLeaks } from "@/lib/dante-core/runtime-convergence/claim-projection";
export type { ClaimFamily, ClaimProjectionResult } from "@/lib/dante-core/runtime-convergence/claim-projection";
export {
  projectProvenanceStrength,
  deriveInputProvenanceStrength,
  inferOutputProvenanceStrength,
  emitProvenanceAudit,
} from "@/lib/dante-core/runtime-convergence/provenance-projection";
export type {
  ProvenanceStrength,
  ProvenanceProjectionResult,
} from "@/lib/dante-core/runtime-convergence/provenance-projection";
export {
  extractTurnObligations,
  isMultiIntentTurn,
  resolveMultiIntentTurn,
  measureResponseCoverage,
} from "@/lib/dante-core/runtime-convergence/multi-intent";
export type {
  ObligationIntent,
  ObligationDisposition,
  TurnObligation,
  HandledObligation,
  MultiIntentResolveResult,
} from "@/lib/dante-core/runtime-convergence/multi-intent";
