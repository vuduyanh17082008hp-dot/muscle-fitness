import { describe, expect, it } from "vitest";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { evaluateClaimConfidence } from "@/lib/dante-core/confidence-engine/evaluator";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";

describe("confidence — causal humility", () => {
  it("TEST E: multi-factor improvement stays LOW causal attribution", () => {
    const message =
      "Volume giảm tuần này, nhưng tôi cũng ngủ nhiều hơn, ăn nhiều hơn và stress thấp hơn. Performance tốt lên. Có phải giảm volume là nguyên nhân không?";
    const assessment = assessTurnConfidence({
      message,
      currentState: extractCurrentTurnState(message),
    });
    const causal = assessment.claims.find((claim) => claim.claimId === "multi_factor_performance_cause");
    expect(causal?.level).toBe("LOW");
    expect(causal?.claimType).toBe("CAUSAL_ATTRIBUTION");
  });

  it("TEST F: repeated comparable pattern is MODERATE not HIGH", () => {
    const assessment = assessTurnConfidence({
      message: "Lower volume keeps beating higher volume for me under similar conditions.",
      currentState: extractCurrentTurnState("Lower volume keeps beating higher volume for me."),
      comparableObservations: 4,
      materialConfounderCount: 0,
      userSpecificEvidence: true,
      evidenceStrengthOverride: "STRONG",
    });
    const causal = assessment.claims.find((claim) => claim.claimId === "repeated_comparable_volume_pattern");
    expect(causal?.level).toBe("MODERATE");
  });

  it("TEST D: safety action HIGH while diagnosis remains insufficient", () => {
    const action = evaluateClaimConfidence(
      "SAFETY_ACTION",
      {
        evidenceStrength: "STRONG",
        userSpecificEvidence: false,
        comparableObservations: 0,
        currentStateComplete: true,
        provenanceQuality: "EXPLICIT_CURRENT_REPORT",
        materialConfounderCount: 0,
        contradictions: [],
        missingInformation: [],
      },
      "urgent_stop",
    );
    const diagnosis = evaluateClaimConfidence(
      "CAUSAL_ATTRIBUTION",
      {
        evidenceStrength: "NONE",
        userSpecificEvidence: false,
        comparableObservations: 0,
        currentStateComplete: false,
        provenanceQuality: "UNVERIFIED",
        materialConfounderCount: 0,
        contradictions: [],
        missingInformation: [],
      },
      "cardiac_diagnosis",
    );
    expect(action.level).toBe("HIGH");
    expect(diagnosis.level).toBe("INSUFFICIENT_EVIDENCE");
  });
});
