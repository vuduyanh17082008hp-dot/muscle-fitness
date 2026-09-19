import type {
  ClaimCategory,
  ClaimConfidence,
  ConfidenceAssessmentContext,
} from "@/lib/dante-core/confidence-engine/types";

/**
 * Deterministic claim-specific confidence. No LLM, no probabilities.
 */
export function evaluateClaimConfidence(
  category: ClaimCategory,
  ctx: ConfidenceAssessmentContext,
  claimId: string,
): ClaimConfidence {
  // ------------------------------------------------------
  // 1. SAFETY ACTION — action certainty ≠ diagnosis
  // ------------------------------------------------------
  if (category === "SAFETY_ACTION") {
    return {
      claimType: category,
      claimId,
      level: "HIGH",
      reasons: [
        "Current signals are sufficient to support the conservative safety action.",
        "Safety-action confidence does not establish a medical diagnosis.",
      ],
    };
  }

  // ------------------------------------------------------
  // 2. CURRENT STATE FACT
  // ------------------------------------------------------
  if (category === "CURRENT_STATE_FACT") {
    if (ctx.contradictions.length > 0) {
      return {
        claimType: category,
        claimId,
        level: "LOW",
        reasons: ["Current evidence contains unresolved contradictions."],
      };
    }

    if (
      ctx.provenanceQuality === "VERIFIED" ||
      ctx.provenanceQuality === "EXPLICIT_CURRENT_REPORT"
    ) {
      return {
        claimType: category,
        claimId,
        level: "HIGH",
        reasons: ["Supported by verified data or explicit current-turn reporting."],
      };
    }

    return {
      claimType: category,
      claimId,
      level: "LOW",
      reasons: ["Current-state provenance is weak or incomplete."],
    };
  }

  // ------------------------------------------------------
  // SHARED PENALTIES FOR INFERENTIAL CLAIMS
  // ------------------------------------------------------
  if (ctx.provenanceQuality === "UNVERIFIED") {
    return {
      claimType: category,
      claimId,
      level: "INSUFFICIENT_EVIDENCE",
      reasons: ["The claim depends on unverified provenance."],
    };
  }

  if (ctx.contradictions.length > 0) {
    return {
      claimType: category,
      claimId,
      level: "LOW",
      reasons: ["Relevant evidence is contradictory."],
    };
  }

  if (ctx.materialConfounderCount >= 2) {
    return {
      claimType: category,
      claimId,
      level: "LOW",
      reasons: ["Multiple material confounders prevent clean attribution."],
    };
  }

  // ------------------------------------------------------
  // 3. CAUSAL ATTRIBUTION
  // ------------------------------------------------------
  if (category === "CAUSAL_ATTRIBUTION") {
    if (ctx.evidenceStrength === "NONE" || ctx.comparableObservations < 2) {
      return {
        claimType: category,
        claimId,
        level: "INSUFFICIENT_EVIDENCE",
        reasons: ["There are not enough comparable observations for causal attribution."],
      };
    }

    if (
      ctx.userSpecificEvidence &&
      ctx.evidenceStrength === "STRONG" &&
      ctx.materialConfounderCount === 0 &&
      ctx.comparableObservations >= 3
    ) {
      return {
        claimType: category,
        claimId,
        level: "MODERATE",
        reasons: [
          "Repeated user-specific observations are directionally consistent with low confounding.",
          "The data still does not establish causality with certainty.",
        ],
      };
    }

    return {
      claimType: category,
      claimId,
      level: "LOW",
      reasons: ["The evidence is suggestive but insufficient for confident causal attribution."],
    };
  }

  // ------------------------------------------------------
  // 4. STRATEGY PREDICTION
  // ------------------------------------------------------
  if (category === "STRATEGY_PREDICTION") {
    if (!ctx.currentStateComplete) {
      return {
        claimType: category,
        claimId,
        level: "LOW",
        reasons: ["Current state is incomplete for a reliable strategy prediction."],
      };
    }

    if (
      ctx.userSpecificEvidence &&
      ctx.provenanceQuality === "VERIFIED" &&
      ctx.evidenceStrength === "STRONG" &&
      ctx.materialConfounderCount === 0
    ) {
      return {
        claimType: category,
        claimId,
        level: "MODERATE",
        reasons: [
          "The strategy is supported by verified user-specific evidence.",
          "Individual response remains uncertain enough to avoid HIGH confidence.",
        ],
      };
    }

    // Conditional strategies grounded in explicit current constraints
    // (e.g. pain-free warm-up gate) — actionable MODERATE, not guesswork.
    if (
      ctx.provenanceQuality === "EXPLICIT_CURRENT_REPORT" &&
      ctx.materialConfounderCount === 0 &&
      (ctx.evidenceStrength === "MIXED" || ctx.evidenceStrength === "STRONG" || ctx.evidenceStrength === "WEAK")
    ) {
      return {
        claimType: category,
        claimId,
        level: "MODERATE",
        reasons: [
          "Current constraints are clear enough for a conditional strategy.",
          "Individual response to the strategy remains uncertain.",
        ],
      };
    }

    if (ctx.evidenceStrength === "MIXED" || ctx.materialConfounderCount === 1) {
      return {
        claimType: category,
        claimId,
        level: "LOW",
        reasons: ["The strategy has partial support but material uncertainty remains."],
      };
    }

    return {
      claimType: category,
      claimId,
      level: "INSUFFICIENT_EVIDENCE",
      reasons: ["No sufficiently reliable individual response history is available."],
    };
  }

  return {
    claimType: category,
    claimId,
    level: "INSUFFICIENT_EVIDENCE",
    reasons: ["The claim does not have enough evaluable evidence."],
  };
}
