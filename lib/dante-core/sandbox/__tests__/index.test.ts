import { describe, expect, it } from "vitest";

import {
  buildDefaultTrainingScenarios,
  scoreScenario,
  selectBestScenario,
  type ScenarioContext,
} from "@/lib/dante-core/sandbox";

const NEUTRAL_CONTEXT: ScenarioContext = {
  recoveryScore: null,
  trainingLoadState: null,
  volumeTolerance: null,
  goalFavorsVolume: false,
};

describe("selectBestScenario", () => {
  it("NO_CHANGE wins when training load and recovery are normal (nothing beats it)", () => {
    const scenarios = buildDefaultTrainingScenarios();
    const result = selectBestScenario(scenarios, {
      ...NEUTRAL_CONTEXT,
      recoveryScore: 80,
      trainingLoadState: "green",
    });

    expect(result.scenario.id).toBe("NO_CHANGE");
  });

  it("a clearly better scenario (volume reduction) wins under high training load, even with NO_CHANGE present", () => {
    const scenarios = buildDefaultTrainingScenarios();
    const result = selectBestScenario(scenarios, {
      ...NEUTRAL_CONTEXT,
      recoveryScore: 40,
      trainingLoadState: "red",
    });

    expect(result.scenario.id).not.toBe("NO_CHANGE");
    expect(result.scenario.volumeChangeFraction).toBeLessThanOrEqual(0);
  });

  it("ties resolve to NO_CHANGE rather than an arbitrary scenario", () => {
    // Two scenarios engineered to score identically under a neutral context.
    const tiedScenarios = [
      { id: "NO_CHANGE", label: "Keep as planned", volumeChangeFraction: 0, preservesVolume: true },
      { id: "ALT_NEUTRAL", label: "An equally neutral alternative", volumeChangeFraction: 0, preservesVolume: true },
    ];

    const result = selectBestScenario(tiedScenarios, NEUTRAL_CONTEXT);
    expect(result.scenario.id).toBe("NO_CHANGE");
  });

  it("a low volume tolerance (learned policy) penalizes large reductions relative to a volume-preserving alternative", () => {
    const scenarios = buildDefaultTrainingScenarios();
    const context: ScenarioContext = {
      recoveryScore: 45,
      trainingLoadState: "amber",
      volumeTolerance: "low",
      goalFavorsVolume: false,
    };

    const reduce10 = scoreScenario(scenarios.find((s) => s.id === "REDUCE_VOLUME_10")!, context);
    const preserveVolume = scoreScenario(
      scenarios.find((s) => s.id === "PRESERVE_VOLUME_REMOVE_FAILURE_SET")!,
      context,
    );

    expect(preserveVolume.score).toBeGreaterThan(reduce10.score);
  });

  it("every score comes with at least one human-readable reason when a signal actually fired", () => {
    const scenarios = buildDefaultTrainingScenarios();
    const scored = scoreScenario(scenarios.find((s) => s.id === "REDUCE_VOLUME_10")!, {
      ...NEUTRAL_CONTEXT,
      trainingLoadState: "red",
    });

    expect(scored.reasons.length).toBeGreaterThan(0);
  });
});
