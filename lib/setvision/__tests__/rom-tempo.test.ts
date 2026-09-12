import { describe, expect, it } from "vitest";
import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import { computeAllRepRom, computeRepRom, computeRomConsistency } from "@/lib/setvision/rom";
import {
  averageConcentricTime,
  averageEccentricTime,
  computeAllRepTempo,
  computeRepTempo,
  computeTempoConsistency,
} from "@/lib/setvision/tempo";
import type { CompletedRep } from "@/lib/setvision/types";

function rep(overrides: Partial<CompletedRep> = {}): CompletedRep {
  return {
    repNumber: 1,
    topAtMs: 0,
    bottomAtMs: 1000,
    ascentStartAtMs: 1200,
    ascentEndAtMs: 2000,
    minAngleDeg: 90,
    maxAngleDeg: 160,
    bottomBarProxy: null,
    bottomFrame: null,
    barProxyTrack: [],
    ...overrides,
  };
}

describe("computeRepRom", () => {
  it("returns 100% when observed range exactly matches the reference range", () => {
    const config = getExerciseConfig("squat"); // referenceRangeDeg: 70
    const result = computeRepRom(rep({ minAngleDeg: 90, maxAngleDeg: 160 }), config);
    expect(result.romPercent).toBe(100);
  });

  it("does not clamp above 100% for a lifter with more range than the reference", () => {
    const config = getExerciseConfig("squat");
    const result = computeRepRom(rep({ minAngleDeg: 70, maxAngleDeg: 160 }), config);
    expect(result.romPercent).toBeGreaterThan(100);
  });

  it("reports a lower percentage for a shallow rep", () => {
    const config = getExerciseConfig("squat");
    const result = computeRepRom(rep({ minAngleDeg: 130, maxAngleDeg: 160 }), config);
    expect(result.romPercent).toBeLessThan(50);
  });
});

describe("computeRomConsistency", () => {
  it("returns null with fewer than 2 reps", () => {
    expect(computeRomConsistency(computeAllRepRom([rep()], getExerciseConfig("squat")))).toBeNull();
  });

  it("returns a high consistency score for identical reps", () => {
    const config = getExerciseConfig("squat");
    const reps = [rep({ repNumber: 1 }), rep({ repNumber: 2 }), rep({ repNumber: 3 })];
    const consistency = computeRomConsistency(computeAllRepRom(reps, config));
    expect(consistency).toBe(1);
  });

  it("returns a lower consistency score for highly variable reps", () => {
    const config = getExerciseConfig("squat");
    const reps = [
      rep({ repNumber: 1, minAngleDeg: 90, maxAngleDeg: 160 }),
      rep({ repNumber: 2, minAngleDeg: 140, maxAngleDeg: 160 }),
      rep({ repNumber: 3, minAngleDeg: 100, maxAngleDeg: 155 }),
    ];
    const consistency = computeRomConsistency(computeAllRepRom(reps, config));
    expect(consistency).not.toBeNull();
    expect(consistency as number).toBeLessThan(1);
  });
});

describe("computeRepTempo", () => {
  it("derives eccentric/pause/concentric directly from phase timestamps", () => {
    const result = computeRepTempo(
      rep({ topAtMs: 0, bottomAtMs: 1500, ascentStartAtMs: 1800, ascentEndAtMs: 2600 }),
    );

    expect(result.eccentricSec).toBe(1.5);
    expect(result.pauseSec).toBe(0.3);
    expect(result.concentricSec).toBe(0.8);
  });
});

describe("average tempo helpers", () => {
  it("averages eccentric/concentric time across reps", () => {
    const tempos = computeAllRepTempo([
      rep({ repNumber: 1, topAtMs: 0, bottomAtMs: 1000, ascentStartAtMs: 1000, ascentEndAtMs: 1500 }),
      rep({ repNumber: 2, topAtMs: 0, bottomAtMs: 2000, ascentStartAtMs: 2000, ascentEndAtMs: 2500 }),
    ]);

    expect(averageEccentricTime(tempos)).toBe(1.5);
    expect(averageConcentricTime(tempos)).toBe(0.5);
  });

  it("returns null averages for an empty rep list", () => {
    expect(averageEccentricTime([])).toBeNull();
    expect(averageConcentricTime([])).toBeNull();
  });
});

describe("computeTempoConsistency", () => {
  it("returns null with fewer than 2 reps", () => {
    expect(computeTempoConsistency(computeAllRepTempo([rep()]))).toBeNull();
  });

  it("returns 1 for identical-duration reps", () => {
    const reps = [rep({ repNumber: 1 }), rep({ repNumber: 2 })];
    expect(computeTempoConsistency(computeAllRepTempo(reps))).toBe(1);
  });
});
