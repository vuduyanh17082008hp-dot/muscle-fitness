import type { ClaimConfidence } from "@/lib/dante-core/confidence-engine/types";

/**
 * Compact micro-directive. Evaluator owns levels; the model only realizes language.
 */
export function getConfidenceLanguageDirective(claims: ClaimConfidence[]): string {
  if (claims.length === 0) {
    return "";
  }

  const claimLines = claims
    .map(
      (claim) =>
        `- ${claim.claimId} [${claim.claimType}] → ${claim.level}` +
        (claim.reasons[0] ? ` (${claim.reasons[0]})` : ""),
    )
    .join("\n");

  return `
============================================================
CONFIDENCE LANGUAGE (session-only micro-directive)
============================================================

The confidence levels below were computed outside the language model.
Do not invent numerical probabilities or fake percentages.
Do not upgrade or downgrade supplied confidence.
Confidence applies claim-by-claim, not to the entire response.
Safety-action confidence does NOT imply diagnostic certainty.
A HIGH current-user report means the report is clear, not necessarily objectively measured truth.
Do not convert LOW / INSUFFICIENT_EVIDENCE into a confident causal claim.
Do not hedge HIGH-confidence claims unnecessarily.
Do not turn every sentence into "maybe" / "possibly".
Do not expose internal scoring labels unless the user asks.

CLAIM CALIBRATION:
${claimLines}

LANGUAGE POLICY:
- HIGH: concise and decisive for that supported claim only.
- MODERATE: conditional but actionable ("I'd lean toward…", "reasonable if…").
- LOW: acknowledge the important uncertainty or confounder.
- INSUFFICIENT_EVIDENCE: do not guess; say evidence is missing.

This directive does not override safety, tool confirmation, current state, or provenance rules.
`.trim();
}

/** Compact log payload — no raw user content. */
export function toConfidenceLogFields(claims: ClaimConfidence[]): Array<{
  claimType: ClaimConfidence["claimType"];
  claimId: string;
  confidenceLevel: ClaimConfidence["level"];
}> {
  return claims.map((claim) => ({
    claimType: claim.claimType,
    claimId: claim.claimId,
    confidenceLevel: claim.level,
  }));
}
