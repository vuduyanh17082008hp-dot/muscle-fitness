import { describe, expect, it } from "vitest";
import { validatePremises } from "@/lib/dante-core/premise-validation";

const BASE = { hasTrainingHistory: true, hasRecoveryData: true, hasNutritionProfile: true };

describe("validatePremises", () => {
  it("returns no issues for a well-supported, unanchored message", () => {
    const issues = validatePremises({ message: "How should I progress my bench press?", ...BASE });
    expect(issues).toEqual([]);
  });

  it("flags an anchored numeric target with a short deadline", () => {
    const issues = validatePremises({
      message: "I want to add 20kg to my squat in 10 days.",
      ...BASE,
    });

    expect(issues.some((i) => i.type === "anchored_numeric_target")).toBe(true);
    expect(issues.some((i) => i.type === "unclear_deadline")).toBe(true);
  });

  it("flags an anchored numeric target but not unclear_deadline when the timeframe is reasonable", () => {
    const issues = validatePremises({
      message: "I want to add 5kg to my deadlift in 12 weeks.",
      ...BASE,
    });

    expect(issues.some((i) => i.type === "anchored_numeric_target")).toBe(true);
    expect(issues.some((i) => i.type === "unclear_deadline")).toBe(false);
  });

  it("flags unclear_deadline for a numeric target paired with vague urgency instead of a timeframe", () => {
    const issues = validatePremises({
      message: "I need to lose 10kg asap.",
      ...BASE,
    });

    expect(issues).toEqual([{ type: "unclear_deadline", detail: expect.any(String) }]);
  });

  it("flags missing_baseline for a training question with no training history", () => {
    const issues = validatePremises({
      message: "What should my next progression be on bench press?",
      ...BASE,
      hasTrainingHistory: false,
    });

    expect(issues).toEqual([{ type: "missing_baseline", detail: expect.any(String) }]);
  });

  it("flags missing_required_variable for a recovery question with no recovery data", () => {
    const issues = validatePremises({
      message: "Is my fatigue too high to train today?",
      ...BASE,
      hasRecoveryData: false,
    });

    expect(issues).toEqual([{ type: "missing_required_variable", detail: expect.any(String) }]);
  });

  it("flags missing_required_variable for a nutrition question with no nutrition profile", () => {
    const issues = validatePremises({
      message: "How many calories should I eat in a deficit?",
      ...BASE,
      hasNutritionProfile: false,
    });

    expect(issues).toEqual([{ type: "missing_required_variable", detail: expect.any(String) }]);
  });

  it("combines multiple issues at once", () => {
    const issues = validatePremises({
      message: "I want to add 20kg to my bench in 5 days, what's my program progression?",
      hasTrainingHistory: false,
      hasRecoveryData: true,
      hasNutritionProfile: true,
    });

    const types = issues.map((i) => i.type).sort();
    expect(types).toEqual(["anchored_numeric_target", "missing_baseline", "unclear_deadline"].sort());
  });
});
