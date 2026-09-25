export type PropositionState = "PRESENT" | "ABSENT" | "UNKNOWN" | "HISTORICAL" | "RESOLVED";
export type TemporalScope = "CURRENT" | "RECENT" | "HISTORICAL" | "UNSPECIFIED";
export type ProvenanceKind =
  | "EXPLICIT_CURRENT_REPORT"
  | "EXPLICIT_HISTORICAL_REPORT"
  | "USER_RECALL_UNCERTAIN"
  | "VERIFIED_TOOL_DATA"
  | "DERIVED"
  | "ASSISTANT_GENERATED"
  | "UNKNOWN";

/** Separable semantic dimensions (APEX). Prefer these over collapsing into `state` alone. */
export type SignalPolarity = "PRESENT" | "ABSENT" | "UNCERTAIN";
export type TemporalAnchor = "CURRENT" | "RECENT_PAST" | "HISTORICAL" | "UNKNOWN";
export type SignalTrend = "IMPROVING" | "WORSENING" | "STABLE" | "UNKNOWN";
export type ResolutionState = "ACTIVE" | "RESOLVED" | "PARTIALLY_RESOLVED" | "UNKNOWN";
export type EvidenceCertainty = "EXPLICIT" | "UNCERTAIN" | "INFERRED" | "VERIFIED";

export type SemanticProposition = {
  concept: string;
  /** @deprecated Prefer polarity + resolution; retained for V2 compat. */
  state: PropositionState;
  /** @deprecated Prefer temporalAnchor; retained for V2 compat. */
  temporal: TemporalScope;
  provenance: ProvenanceKind;
  polarity?: SignalPolarity;
  temporalAnchor?: TemporalAnchor;
  trend?: SignalTrend;
  resolution?: ResolutionState;
  certainty?: EvidenceCertainty;
  laterality?: "LEFT" | "RIGHT" | "UNSPECIFIED" | "UNCERTAIN";
  count?: "UNKNOWN" | "UNVERIFIED" | number;
  rawSpan?: string;
};

export type SemanticInterpretation = {
  rawText: string;
  language: "en" | "vi" | "mixed";
  propositions: SemanticProposition[];
};

export type DanteResponseIntent =
  | "COACH"
  | "SAFETY"
  | "CLARIFY"
  | "ACTION_PROPOSAL"
  | "ACTION_CONFIRMATION"
  | "EXPERIMENT_UPDATE"
  | "BOUNDARY"
  | "CORRECTION";

export type DanteDecision = {
  userLanguage: "en" | "vi";
  responseIntent: DanteResponseIntent;
  safety: {
    action: "NORMAL" | "ESCALATE" | "REDIRECT";
    category: string | null;
    relevantSignals: string[];
    /** Epistemic certainty can be low while urgency stays high. */
    urgency?: "NONE" | "ELEVATED" | "HIGH";
    epistemicCertainty?: EvidenceCertainty | "LOW" | "MEDIUM" | "HIGH";
  };
  currentState: {
    facts: Array<{ concept: string; state: string; provenance: string }>;
    resolvedHistory?: Array<{ concept: string; state: string }>;
  };
  evidence: {
    supported: Array<{ claim: string; provenance: string }>;
    conditional: Array<{ claim: string; provenance: string }>;
    unknown: Array<{ claim: string; provenance: string }>;
    prohibitedAttributions?: Array<{ claim: string; reason: string }>;
  };
  risk?: { coachingBias: string };
  experiment?: { userFacingMeaning: string; internalStatus?: string };
  tool?: { permission: "READ" | "PROPOSE" | "CONFIRMATION_REQUIRED" | "DENIED"; persisted: boolean };
  discourse: {
    alreadyExplained: string[];
    previousIntent?: string;
    preferredDepth?: "brief" | "normal" | "detailed";
    rationaleCodes?: string[];
  };
  style: {
    language: "en" | "vi";
    tone: "calm_direct" | "boundary" | "safety" | "correction";
    slangLevel?: number;
    frustrated?: boolean;
    joking?: boolean;
    /** Lower when safety severity rises. */
    personaAttenuation?: number;
  };
  flags?: {
    templateAttractor?: boolean;
    alreadyExplainedRationale?: boolean;
    hideInternalJargon?: boolean;
  };
  /** Control-plane claim constraints for the output validator. */
  claimConstraints?: OutputClaimConstraints;
};

export type OutputClaimConstraints = {
  episodeCount?: "UNKNOWN" | "UNVERIFIED" | number;
  /** BOTH = the user named each side with its own state ("left hurts, right doesn't"): neither side may be scrubbed. */
  laterality?: "LEFT" | "RIGHT" | "BOTH" | "UNSPECIFIED" | "UNCERTAIN";
  persisted?: boolean;
  sleepCausality?: "NOT_ESTABLISHED" | "CONDITIONAL" | "ESTABLISHED";
  currentChestPain?: SignalPolarity;
  currentShoulder?: SignalPolarity;
  experimentConclusion?: "SUPPORTS" | "DOES_NOT_SUPPORT" | "INCONCLUSIVE" | "CONFOUNDED" | "NONE";
  rejectedClaims?: string[];
};

export type ContextTier = "L1" | "L2" | "L3";

export type ConversationCommitments = {
  activeConclusions: string[];
  rejectedClaims: string[];
  pendingActions: string[];
  pendingQuestions: string[];
  alreadyExplainedRationales: string[];
  rationaleCodes: string[];
  recentCorrections: string[];
};

export type DanteContextCapsule = {
  id: string;
  raw?: string;
  summary?: string;
  facts?: Array<{ concept: string; state: string; provenance: string }>;
  structured?: unknown;
  entities?: string[];
  topics?: string[];
  provenance: ProvenanceKind | string;
  sourceType: string;
  trustLevel?: "HIGH" | "MEDIUM" | "LOW" | "STYLE_ONLY";
  temporalScope?: TemporalScope | string;
  safetyRelevance?: string[];
  fitnessRelevance?: string[];
  createdAt: string;
  lastConfirmedAt?: string;
  supersededBy?: string;
  authority?: "TRUTH" | "STYLE_CONTEXT_ONLY";
  /** Session-scoped epistemic/action commitments — not durable memory by default. */
  commitments?: ConversationCommitments;
};

export type DanteTaskId =
  | "INTERPRET_CURRENT_STATE"
  | "RUN_SAFETY_CHECK"
  | "RETRIEVE_MEMORY"
  | "ASSESS_PROVENANCE"
  | "ASSESS_CONFIDENCE"
  | "ASSESS_RISK"
  | "SELECT_TRAINING_STRATEGY"
  | "MANAGE_EXPERIMENT"
  | "EXECUTE_TOOL"
  | "REALIZE_RESPONSE";

export type FailureClass =
  | "HALLUCINATION"
  | "OMISSION"
  | "MISINTERPRETATION"
  | "STALE_STATE"
  | "TEMPORAL_ERROR"
  | "NEGATION_ERROR"
  | "PROVENANCE_INFLATION"
  | "COUNT_FABRICATION"
  | "LATERALITY_ERROR"
  | "CAUSAL_OVERCLAIM"
  | "TOOL_STATE_ERROR"
  | "CONTEXT_LOSS"
  | "RESPONSE_REALIZATION_ERROR"
  | "USER_UPDATE";

export type ClaimViolationKind =
  | "HARD_INVARIANT"
  | "STYLE";

export type ClaimViolationCode =
  | "FABRICATED_COUNT"
  | "FABRICATED_LATERALITY"
  | "FALSE_PERSISTENCE"
  | "CAUSAL_OVERCLAIM"
  | "CURRENT_STATE_CONTRADICTION"
  | "PROVENANCE_INFLATION"
  | "EXPERIMENT_OVERCLAIM"
  | "MILD_JARGON"
  | "REPEATED_RATIONALE";
