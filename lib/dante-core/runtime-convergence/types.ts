/**
 * Phase 1 — Runtime Convergence types.
 * Route/boundary layer only. Does not redefine Control Plane truth.
 */

import type { DanteDecision, SemanticInterpretation } from "@/lib/dante-core/adaptive-coach-v2/types";
import type { DanteContextCapsule } from "@/lib/dante-core/adaptive-coach-v2/types";
import type { AuthoritativeResponseState } from "@/lib/dante-core/runtime-convergence/authoritative-state";

export type DanteResponseBranch =
  | "NORMAL_PROVIDER"
  | "HARD_SAFETY"
  | "SOCIAL"
  | "NOF1"
  | "TOOL"
  | "CORRECTION"
  | "FALLBACK"
  | "PROVIDER_FAILURE"
  | "CURRENT_STATE"
  | "CONFIDENCE"
  | "RISK"
  | "CASUAL";

/**
 * Closed fingerprint/route intent. Maps from existing DanteDecision.responseIntent
 * + branch — does not replace adaptive-coach-v2 DanteResponseIntent.
 */
export type FinalizerResponseIntent =
  | "COACHING_RESPONSE"
  | "CURRENT_STATE_UPDATE"
  | "SAFETY_RESPONSE"
  | "CAUSALITY_RESPONSE"
  | "CORRECTION_RESPONSE"
  | "TOOL_ACTION_RESPONSE"
  | "EXPERIMENT_RESPONSE"
  | "SOCIAL_RESPONSE"
  | "ANTI_MANIPULATION_RESPONSE"
  | "FALLBACK_RESPONSE";

export type SafetySurfaceClass =
  | "NONE"
  | "INFO"
  | "CAUTION"
  | "STOP_ACTIVITY"
  | "URGENT_EVALUATION"
  | "EMERGENCY_ACTION";

/** Phase 1: interface must be received; content quality is Phase 2. */
export type PersonaContract = {
  status: "RESOLVED" | "DEFAULT" | "UNRESOLVED";
  language: "en" | "vi";
  register?: "casual" | "neutral" | "formal";
  addressForm?: "bro" | "ong" | "ban" | "unresolved";
};

export type DanteRouteMetadata = {
  sourceBranch: DanteResponseBranch;
  /** Caller-owned request timestamp — never generated inside finalizer. */
  timestamp: string;
  responseFingerprint: string;
  finalizerApplied: boolean;
  hardSafetyBypass: boolean;
};

export type FinalizerDiscourseState = {
  rationaleCodes?: string[];
  alreadyExplained?: string[];
};

export type FinalizerToolState = {
  persisted?: boolean;
  permission?: "READ" | "PROPOSE" | "CONFIRMATION_REQUIRED" | "DENIED";
};

export type FinalizeDanteResponseInput = {
  draft: string;
  decisionObject: DanteDecision | null;
  semanticState: SemanticInterpretation | null;
  contextCapsule: DanteContextCapsule | null;
  personaContract: PersonaContract;
  routeMetadata: Omit<DanteRouteMetadata, "responseFingerprint" | "finalizerApplied" | "hardSafetyBypass"> & {
    responseFingerprint?: string;
    finalizerApplied?: boolean;
    hardSafetyBypass?: boolean;
  };
  discourseState?: FinalizerDiscourseState | null;
  toolState?: FinalizerToolState | null;
  responseIntent?: FinalizerResponseIntent;
  recommendationCode?: string | null;
  causalTarget?: string | null;
  safetySurfaceClass?: SafetySurfaceClass;
  /** Packaged authoritative facts — never invent inside finalizer. */
  authoritativeState?: AuthoritativeResponseState | null;
};

export type FinalizeDanteResponseResult = {
  response: string;
  audit: {
    routeMetadata: DanteRouteMetadata;
    responseIntent: FinalizerResponseIntent;
    recommendationCode: string | null;
    causalTarget: string | null;
    safetySurfaceClass: SafetySurfaceClass;
    violations: string[];
    personaContractReceived: true;
    claimValidatorApplied: boolean;
    controlPlaneMutated: false;
    externalSideEffects: false;
  };
};

export type HardSafetySurfaceInput = {
  draft: string;
  language: "en" | "vi";
  activityDirective: "CONTINUE" | "MODIFY" | "STOP";
  evaluationUrgency: "NONE" | "ROUTINE" | "URGENT" | "EMERGENCY";
  routeMetadata: Omit<DanteRouteMetadata, "responseFingerprint" | "finalizerApplied" | "hardSafetyBypass">;
  personaContract: PersonaContract;
};

export type HardSafetySurfaceResult = {
  response: string;
  audit: {
    routeMetadata: DanteRouteMetadata;
    safetySurfaceClass: SafetySurfaceClass;
    surfaceSeverityOk: boolean;
    hardSafetySurfaceContractApplied: true;
    controlPlaneMutated: false;
    externalSideEffects: false;
  };
};

export type ResponseFingerprintInput = {
  sourceBranch: DanteResponseBranch;
  responseIntent: FinalizerResponseIntent;
  rationaleCodes: string[];
  recommendationCode: string | null;
  causalTarget: string | null;
  safetySurfaceClass: SafetySurfaceClass;
  normalizedText: string;
};
