export type ConfidenceLevel =
  | "HIGH"
  | "MODERATE"
  | "LOW"
  | "INSUFFICIENT_EVIDENCE";

export type EvidenceStrength =
  | "STRONG"
  | "MIXED"
  | "WEAK"
  | "NONE";

export type ProvenanceQuality =
  | "VERIFIED"
  | "EXPLICIT_CURRENT_REPORT"
  | "PARTIAL"
  | "UNVERIFIED";

/**
 * SAFETY_ACTION is deliberate: high confidence that a conservative action
 * is warranted must never be read as diagnostic certainty.
 */
export type ClaimCategory =
  | "CURRENT_STATE_FACT"
  | "SAFETY_ACTION"
  | "CAUSAL_ATTRIBUTION"
  | "STRATEGY_PREDICTION";

export interface ConfidenceAssessmentContext {
  evidenceStrength: EvidenceStrength;
  userSpecificEvidence: boolean;
  /** Clean comparable observations only — not raw event counts. */
  comparableObservations: number;
  currentStateComplete: boolean;
  provenanceQuality: ProvenanceQuality;
  /** Material confounders only (sleep/calories/stress/load shifts), not trivial timing noise. */
  materialConfounderCount: number;
  contradictions: string[];
  missingInformation: string[];
}

export interface ClaimConfidence {
  claimType: ClaimCategory;
  /** Short stable id for observability / directive anchoring. */
  claimId: string;
  level: ConfidenceLevel;
  reasons: string[];
}

export type ConfidenceLogFields = {
  claimType: ClaimCategory;
  claimId: string;
  confidenceLevel: ConfidenceLevel;
  evidenceStrength: EvidenceStrength;
  provenanceQuality: ProvenanceQuality;
  materialConfounderCount: number;
  comparableObservations: number;
};
