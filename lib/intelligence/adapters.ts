import type { ProvenanceKind } from "@/lib/dante-core/adaptive-coach-v2/types";
import type { EvidenceStrength } from "@/lib/dante-core/confidence-engine/types";
import type { DanteConfidence, DanteEvidenceKind } from "@/lib/dante-core/epistemics/types";
import type { Confidence, DataSource, DraftStatus } from "@/lib/nutrition/coach/types";
import type { EvidenceOrigin, UncertaintyClass, VerificationStatus } from "./types";

export function fromDanteEvidenceKind(kind: DanteEvidenceKind): EvidenceOrigin {
  switch (kind) {
    case "system_fact":
    case "verified_memory":
      return "VERIFIED_STATE";
    case "user_report":
    case "user_subjective_report":
      return "USER_EXPLICIT";
    case "user_claimed_memory":
      return "USER_UNCERTAIN";
    case "external_evidence":
    case "retrieved_knowledge":
      return "RETRIEVED_KNOWLEDGE";
    case "model_inference":
      return "MODEL_INFERENCE";
    case "unknown":
      return "UNKNOWN";
  }
}

/** `stale` is a hint for the caller to set EvidenceItem.stale (historical reports). */
export function fromDanteProvenance(kind: ProvenanceKind): { origin: EvidenceOrigin; stale: boolean } {
  switch (kind) {
    case "EXPLICIT_CURRENT_REPORT": return { origin: "USER_EXPLICIT", stale: false };
    case "EXPLICIT_HISTORICAL_REPORT": return { origin: "USER_EXPLICIT", stale: true };
    case "USER_RECALL_UNCERTAIN": return { origin: "USER_UNCERTAIN", stale: false };
    case "VERIFIED_TOOL_DATA": return { origin: "VERIFIED_STATE", stale: false };
    case "DERIVED": return { origin: "PRIOR_INFERENCE", stale: false }; // conservative: DERIVED may be model-derived
    case "ASSISTANT_GENERATED": return { origin: "MODEL_INFERENCE", stale: false };
    case "UNKNOWN": return { origin: "UNKNOWN", stale: false };
  }
}

/** Accepts Dante confidence, confidence-engine strength, or Gemma Confidence. Never numeric. */
export function fromExistingConfidence(c: DanteConfidence | EvidenceStrength | Confidence): UncertaintyClass {
  switch (c) {
    case "high":
    case "HIGH":
    case "STRONG":
      return "HIGH_SUPPORT";
    case "medium":
    case "MEDIUM":
      return "MODERATE_SUPPORT";
    case "low":
    case "LOW":
    case "WEAK":
    case "MIXED": // mixed evidence is not corroboration
      return "WEAK_SUPPORT";
    case "NONE":
      return "UNRESOLVED";
  }
}

/** `isEstimated` wins over a VERIFIED source: an estimate never becomes verified by adapter. */
export function fromGemmaSource(source: DataSource, isEstimated: boolean): VerificationStatus {
  if (isEstimated || source === "ESTIMATED") return "ESTIMATED";
  return source === "VERIFIED" ? "VERIFIED" : "UNRESOLVED";
}

/** Only LOGGED has left draft-space; everything earlier is a proposal, even CONFIRMED. */
export function fromGemmaDraftStatus(status: DraftStatus, isEstimated: boolean): VerificationStatus {
  return status === "LOGGED" ? (isEstimated ? "ESTIMATED" : "VERIFIED") : "PROPOSED";
}

export function fromRetrievalMetadata(meta: { sectionId?: string | null; docId?: string | null }): {
  origin: EvidenceOrigin;
  sourceRefs: string[];
} {
  const refs = [meta.docId, meta.sectionId].filter((x): x is string => !!x);
  return { origin: refs.length ? "RETRIEVED_KNOWLEDGE" : "UNKNOWN", sourceRefs: refs };
}
