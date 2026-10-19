/**
 * AI-R1B shared epistemic core — pure types. Provider-free, persistence-free.
 * Maps FROM Dante (DanteEvidenceKind / ProvenanceKind / confidence-engine) and
 * Gemma/Nutrition (DataSource / DraftStatus) — it replaces none of them.
 */

/** Where a piece of evidence came from. Ordering lives in logic.ts, not here. */
export type EvidenceOrigin =
  | "USER_CORRECTION"
  | "USER_EXPLICIT"
  | "USER_UNCERTAIN"
  | "VERIFIED_STATE"
  | "DETERMINISTIC_RESULT"
  | "RETRIEVED_KNOWLEDGE"
  | "PRIOR_INFERENCE"
  | "MODEL_INFERENCE"
  | "SIMULATION"
  | "UNKNOWN";

/** Gemma-facing truth status. Only VERIFIED may ever be treated as mutation truth. */
export type VerificationStatus = "VERIFIED" | "ESTIMATED" | "UNRESOLVED" | "PROPOSED" | "SIMULATED";

export type EvidenceDirection = "FOR" | "AGAINST" | "NEUTRAL";
export type EvidenceWeight = "STRONG" | "MODERATE" | "WEAK";

export type EvidenceItem = {
  id: string;
  origin: EvidenceOrigin;
  verification: VerificationStatus;
  direction: EvidenceDirection;
  strength: EvidenceWeight;
  /** Hypothesis this item bears on, if any. */
  hypothesisId?: string;
  summary: string;
  /** ISO timestamp; informational only. */
  observedAt?: string;
  /** Caller-declared: the observation no longer reflects current state. */
  stale?: boolean;
  /** Provenance trail (Dante capsule labels, retrieval section ids, ...). Never dropped on merge. */
  sourceRefs: string[];
};

export type MissingEvidence = { id: string; description: string; hypothesisId?: string };

export type IdentifiabilityStatus =
  | "IDENTIFIED"
  | "PARTIALLY_IDENTIFIED"
  | "UNDERDETERMINED"
  | "CONFLICTING"
  | "UNKNOWN";

/** Qualitative only — deliberately no numeric probability. */
export type UncertaintyClass = "HIGH_SUPPORT" | "MODERATE_SUPPORT" | "WEAK_SUPPORT" | "UNRESOLVED";

export type HypothesisStatus =
  | "EARLY_SIGNAL"
  | "PLAUSIBLE"
  | "SUPPORTED"
  | "PARTIALLY_IDENTIFIED"
  | "IDENTIFIED"
  | "REJECTED"
  | "UNRESOLVED";

export type Hypothesis = {
  id: string;
  domain: "training" | "nutrition" | "recovery" | "general";
  question: string;
  candidateExplanation: string;
  supportingEvidence: EvidenceItem[];
  counterEvidence: EvidenceItem[];
  missingEvidence: MissingEvidence[];
  /** True only after findCounterEvidence() has been run against the evidence pool. */
  counterEvidenceEvaluated: boolean;
  identifiability: IdentifiabilityStatus;
  uncertainty: UncertaintyClass;
  status: HypothesisStatus;
};

export type ClaimType =
  | "VERIFIED_FACT"
  | "USER_EXPLICIT"
  | "USER_UNCERTAIN"
  | "DETERMINISTIC_RESULT"
  | "RETRIEVED_KNOWLEDGE"
  | "INFERENCE"
  | "HYPOTHESIS"
  | "PROPOSAL"
  | "UNKNOWN";

/** In-memory / derived only in R1B. */
export type ClaimLedgerEntry = {
  id: string;
  claimType: ClaimType;
  statement: string;
  verification: VerificationStatus;
  evidenceIds: string[];
};

export type CounterEvidenceResult = {
  /** Always true — running findCounterEvidence is the "check" canPromoteHypothesis demands. */
  evaluated: true;
  counterEvidence: EvidenceItem[];
};

export type PromotionDecision = { allowed: boolean; reasons: string[] };
