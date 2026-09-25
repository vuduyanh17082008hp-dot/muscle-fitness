import { describe, expect, it } from "vitest";
import { evaluateClaimConfidence } from "@/lib/dante-core/confidence-engine/evaluator";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import type { ConfidenceAssessmentContext } from "@/lib/dante-core/confidence-engine/types";

const base = (partial: Partial<ConfidenceAssessmentContext> = {}): ConfidenceAssessmentContext => ({
  evidenceStrength: "NONE",
  userSpecificEvidence: false,
  comparableObservations: 0,
  currentStateComplete: false,
  provenanceQuality: "UNVERIFIED",
  materialConfounderCount: 0,
  contradictions: [],
  missingInformation: [],
  ...partial,
});

describe("confidence assessment — core evaluator", () => {
  it("assigns HIGH to safety actions without implying diagnosis", () => {
    const action = evaluateClaimConfidence("SAFETY_ACTION", base({ evidenceStrength: "STRONG" }), "stop_exercise");
    expect(action.level).toBe("HIGH");
    expect(action.reasons.some((reason) => /diagnosis/i.test(reason))).toBe(true);
  });

  it("marks explicit current reports HIGH and contradictions LOW", () => {
    expect(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        base({ provenanceQuality: "EXPLICIT_CURRENT_REPORT", evidenceStrength: "STRONG" }),
        "sleep",
      ).level,
    ).toBe("HIGH");
    expect(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        base({
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          contradictions: ["self_report_recovery_vs_wearable"],
        }),
        "recovery",
      ).level,
    ).toBe("LOW");
  });

  it("keeps causal attribution at MODERATE even with strong repeated evidence", () => {
    const result = evaluateClaimConfidence(
      "CAUSAL_ATTRIBUTION",
      base({
        evidenceStrength: "STRONG",
        userSpecificEvidence: true,
        comparableObservations: 4,
        provenanceQuality: "VERIFIED",
        materialConfounderCount: 0,
      }),
      "volume_pattern",
    );
    expect(result.level).toBe("MODERATE");
  });

  it("returns INSUFFICIENT_EVIDENCE for unverified provenance strategies", () => {
    expect(
      evaluateClaimConfidence(
        "STRATEGY_PREDICTION",
        base({ provenanceQuality: "UNVERIFIED", currentStateComplete: true }),
        "tolerance_based_plan",
      ).level,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("confidence assessment — turn assessor", () => {
  it("TEST A: explicit sleep report is HIGH current-state fact", () => {
    const state = extractCurrentTurnState("I slept 8h today.");
    const assessment = assessTurnConfidence({ message: "I slept 8h today.", currentState: state });
    const sleep = assessment.claims.find((claim) => claim.claimId === "sleep_hours_reported");
    expect(sleep?.level).toBe("HIGH");
    expect(sleep?.claimType).toBe("CURRENT_STATE_FACT");
  });

  it("TEST B: caffeine consumed HIGH, performance effect insufficient", () => {
    const message = "I've had 300mg caffeine today. Will that make my bench stronger?";
    const state = extractCurrentTurnState(message);
    const assessment = assessTurnConfidence({ message, currentState: state });
    expect(assessment.claims.find((claim) => claim.claimId === "caffeine_consumed_mg")?.level).toBe("HIGH");
    expect(
      assessment.claims.find((claim) => claim.claimId === "caffeine_performance_effect")?.level,
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
});
