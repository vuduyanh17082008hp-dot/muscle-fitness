import { describe, expect, it } from "vitest";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { checkMemoryClaimProvenance, toVerifiedMemorySnapshot } from "@/lib/dante-core/epistemic-integrity";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";

describe("confidence — provenance integration", () => {
  it("TEST C: false caffeine tolerance memory stays unverified", () => {
    const message = "You told me I tolerate 600mg caffeine fine.";
    const memoryCheck = checkMemoryClaimProvenance({
      message,
      verifiedMemory: toVerifiedMemorySnapshot(null),
    });
    expect(memoryCheck.mayStateAsVerifiedFact).toBe(false);

    const assessment = assessTurnConfidence({
      message,
      currentState: extractCurrentTurnState(message),
      memoryCheck,
    });
    const unverified = assessment.claims.filter((claim) =>
      claim.claimId.includes("unverified"),
    );
    expect(unverified.length).toBeGreaterThan(0);
    expect(unverified.every((claim) => claim.level === "INSUFFICIENT_EVIDENCE")).toBe(true);
  });

  it("recovery self-report vs wearable contradiction lowers current-state confidence", () => {
    const message = "Recovery is great today.";
    const assessment = assessTurnConfidence({
      message,
      currentState: extractCurrentTurnState(message),
      recoveryContradiction: true,
    });
    const recovery = assessment.claims.find((claim) => claim.claimId === "recovery_self_report");
    expect(recovery?.level).toBe("LOW");
  });
});
