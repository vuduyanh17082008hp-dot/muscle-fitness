import { describe, expect, it } from "vitest";

import { analyzeExperimentObservations, buildExperimentResult, type ExperimentDayObservation } from "@/lib/experiments/engine";
import { EXPOSURE_TYPES, OUTCOME_TYPES } from "@/lib/experiments/catalog";

const exposure = EXPOSURE_TYPES[0]; // late_caffeine
const outcome = OUTCOME_TYPES[0]; // sleep_hours

function obs(exposurePresent: boolean, outcomeValue: number | null, date = "2026-09-01"): ExperimentDayObservation {
  return { date, exposurePresent, outcomeValue };
}

describe("analyzeExperimentObservations", () => {
  it("computes separate means for exposed vs unexposed groups", () => {
    const analysis = analyzeExperimentObservations([
      obs(true, 6),
      obs(true, 6.5),
      obs(false, 8),
      obs(false, 7.5),
    ]);

    expect(analysis.exposedGroup).toMatchObject({ n: 2, mean: 6.25 });
    expect(analysis.unexposedGroup).toMatchObject({ n: 2, mean: 7.75 });
    expect(analysis.difference).toBe(-1.5);
  });

  it("excludes days with a missing outcome value rather than treating them as zero", () => {
    const analysis = analyzeExperimentObservations([obs(true, 6), obs(true, null), obs(false, 8)]);

    expect(analysis.exposedGroup.n).toBe(1);
    expect(analysis.daysExcludedMissingOutcome).toBe(1);
    expect(analysis.totalDaysConsidered).toBe(3);
  });

  it("returns null means for an empty group rather than fabricating a value", () => {
    const analysis = analyzeExperimentObservations([obs(false, 8), obs(false, 7)]);

    expect(analysis.exposedGroup).toEqual({ n: 0, mean: null, standardDeviation: null });
  });
});

describe("buildExperimentResult", () => {
  it("reports insufficient data with fewer than 2 days in a group", () => {
    const result = buildExperimentResult(exposure, outcome, exposure.question, [obs(true, 6), obs(false, 8), obs(false, 7.5)]);

    expect(result.recommendation).toContain("Not enough days");
    expect(result.confidence).toBe("low");
  });

  it("never reports 'high' confidence, even with a large, clean-looking difference", () => {
    const observations: ExperimentDayObservation[] = [];
    for (let i = 0; i < 10; i += 1) observations.push(obs(true, 5, `2026-09-${i + 1}`));
    for (let i = 0; i < 10; i += 1) observations.push(obs(false, 8, `2026-10-${i + 1}`));

    const result = buildExperimentResult(exposure, outcome, exposure.question, observations);

    expect(result.confidence).not.toBe("high");
    expect(["low", "moderate"]).toContain(result.confidence);
  });

  it("always distinguishes association from causation in its limitations", () => {
    const result = buildExperimentResult(exposure, outcome, exposure.question, [
      obs(true, 6),
      obs(true, 6.2),
      obs(false, 8),
      obs(false, 7.8),
    ]);

    expect(result.limitations?.some((l) => l.toLowerCase().includes("not a proven cause"))).toBe(true);
  });

  it("reports the sample size and effect size honestly in the why bullets", () => {
    const result = buildExperimentResult(exposure, outcome, exposure.question, [
      obs(true, 6),
      obs(true, 6.5),
      obs(false, 8),
      obs(false, 8.2),
    ]);

    expect(result.why[0]).toContain("2 day(s)");
    expect(result.why[1]).toContain("2 day(s)");
  });

  it("reports no meaningful difference when the groups are essentially equal", () => {
    const result = buildExperimentResult(exposure, outcome, exposure.question, [
      obs(true, 7),
      obs(true, 7),
      obs(false, 7),
      obs(false, 7),
    ]);

    expect(result.recommendation).toContain("No meaningful difference");
  });
});
