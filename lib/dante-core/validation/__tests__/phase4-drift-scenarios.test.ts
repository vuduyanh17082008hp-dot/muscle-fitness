import { describe, expect, it } from "vitest";

import { validateDrift } from "@/lib/dante-core/validation/drift-validation";
import type { DriftObservation, DriftPolicy } from "@/lib/dante-core/validation/types";

const policy = (domain: string, candidatePoints = 2, confirmationPoints = 4): DriftPolicy => ({
  domain,
  magnitudeThreshold: 1,
  candidatePoints,
  confirmationPoints,
  minimumConfidence: 0.8,
});
const observed = (domain: string, count: number, magnitude = 2): DriftObservation[] => Array.from({ length: count }, (_, index) => ({
  domain,
  magnitude,
  confidence: 0.9,
  explicitTransition: false,
  occurredAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
}));

describe("Phase 4 configurable drift scenarios", () => {
  it("treats one bad sleep night as an anomaly", () => {
    expect(validateDrift(policy("sleep"), observed("sleep", 1)).stage).toBe("ANOMALY");
  });

  it("treats one stressful day as an anomaly", () => {
    expect(validateDrift(policy("stress"), observed("stress", 1)).stage).toBe("ANOMALY");
  });

  it("does not confirm temporary travel", () => {
    expect(validateDrift(policy("schedule", 3, 5), observed("schedule", 2)).stage).toBe("ANOMALY");
  });

  it("confirms a persistent supported sleep change", () => {
    expect(validateDrift(policy("sleep"), observed("sleep", 4)).stage).toBe("CONFIRMED");
  });

  it("accepts a high-confidence explicit goal transition immediately", () => {
    expect(validateDrift(policy("goal"), [{ domain: "goal", magnitude: 0, confidence: 0.95, explicitTransition: true, occurredAt: "2026-09-01T00:00:00.000Z" }]).stage).toBe("CONFIRMED");
  });

  it("uses a domain-specific schedule policy", () => {
    expect(validateDrift(policy("schedule", 2, 3), observed("schedule", 2)).stage).toBe("CANDIDATE");
  });

  it("uses a distinct training-pattern policy", () => {
    expect(validateDrift(policy("training_pattern", 3, 5), observed("training_pattern", 4)).stage).toBe("CANDIDATE");
  });

  it("evaluates combined change per domain instead of one global score", () => {
    const combined = [...observed("sleep", 4), ...observed("stress", 2), ...observed("schedule", 1)];
    expect(validateDrift(policy("sleep"), combined).stage).toBe("CONFIRMED");
    expect(validateDrift(policy("stress"), combined).stage).toBe("CANDIDATE");
    expect(validateDrift(policy("schedule"), combined).stage).toBe("ANOMALY");
  });
});
