import { describe, expect, it } from "vitest";

import { assertLearningScope, IMMUTABLE_LEARNING_DOMAINS } from "@/lib/dante-core/learning-guardrails";

describe("assertLearningScope", () => {
  it("allows client-scoped fitness interventions", () => {
    expect(
      assertLearningScope({
        userId: "user-a",
        interventionType: "reduce_volume",
        provenance: "dante_action_log",
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks learning that targets immutable safety domains", () => {
    const result = assertLearningScope({
      userId: "user-a",
      interventionType: "reduce_volume",
      provenance: "manual",
      targetDomain: "safety_rules",
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.blockedDomain).toBe("safety_rules");
    }
  });

  it("blocks safety-layer provenance from producing patterns", () => {
    const result = assertLearningScope({
      userId: "user-a",
      interventionType: "no_change",
      provenance: "safety-layer/chest_pain",
    });

    expect(result.allowed).toBe(false);
  });

  it("requires a user id", () => {
    expect(
      assertLearningScope({
        userId: "",
        interventionType: "hold_load",
        provenance: "test",
      }).allowed,
    ).toBe(false);
  });

  it("documents all immutable domains", () => {
    expect(IMMUTABLE_LEARNING_DOMAINS).toContain("medical_boundaries");
    expect(IMMUTABLE_LEARNING_DOMAINS).toContain("evidence_rules");
  });
});
