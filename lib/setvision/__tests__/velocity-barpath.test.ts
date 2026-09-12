import { describe, expect, it } from "vitest";
import { computeBarPathConsistency, computeRepHorizontalDeviation } from "@/lib/setvision/bar-path";
import { computeVelocity } from "@/lib/setvision/velocity";
import type { CompletedRep, Landmark } from "@/lib/setvision/types";

const TORSO_LENGTH = 0.4;

function track(
  points: Array<{ t: number; x: number; y: number }>,
): CompletedRep["barProxyTrack"] {
  return points.map((p) => ({ timestampMs: p.t, landmark: { x: p.x, y: p.y, score: 1 } as Landmark }));
}

function rep(overrides: Partial<CompletedRep> = {}): CompletedRep {
  return {
    repNumber: 1,
    topAtMs: 0,
    bottomAtMs: 500,
    ascentStartAtMs: 500,
    ascentEndAtMs: 1500,
    minAngleDeg: 90,
    maxAngleDeg: 160,
    bottomBarProxy: null,
    bottomFrame: null,
    barProxyTrack: [],
    ...overrides,
  };
}

describe("computeVelocity", () => {
  it("returns calibrated: false with a torso-lengths/s unit by default", () => {
    const reps = [
      rep({
        repNumber: 1,
        ascentStartAtMs: 0,
        ascentEndAtMs: 1000,
        barProxyTrack: track([
          { t: 0, x: 0.5, y: 0.5 },
          { t: 1000, x: 0.5, y: 0.1 },
        ]),
      }),
    ];

    const result = computeVelocity(reps, TORSO_LENGTH);

    expect(result.calibrated).toBe(false);
    expect(result.unit).toBe("torso-lengths/s");
    expect(result.perRep).toHaveLength(1);
    expect(result.mean).not.toBeNull();
  });

  it("converts to real m/s when a calibration factor is supplied", () => {
    const reps = [
      rep({
        repNumber: 1,
        ascentStartAtMs: 0,
        ascentEndAtMs: 1000,
        barProxyTrack: track([
          { t: 0, x: 0.5, y: 0.5 },
          { t: 1000, x: 0.5, y: 0.1 },
        ]),
      }),
    ];

    const result = computeVelocity(reps, TORSO_LENGTH, { metersPerTorsoLength: 0.5 });

    expect(result.calibrated).toBe(true);
    expect(result.unit).toBe("m/s");
  });

  it("computes velocity loss between the first and final rep", () => {
    const fastRep = rep({
      repNumber: 1,
      ascentStartAtMs: 0,
      ascentEndAtMs: 500,
      barProxyTrack: track([
        { t: 0, x: 0.5, y: 0.5 },
        { t: 500, x: 0.5, y: 0.1 },
      ]),
    });

    const slowRep = rep({
      repNumber: 2,
      ascentStartAtMs: 0,
      ascentEndAtMs: 2000,
      barProxyTrack: track([
        { t: 0, x: 0.5, y: 0.5 },
        { t: 2000, x: 0.5, y: 0.1 },
      ]),
    });

    const result = computeVelocity([fastRep, slowRep], TORSO_LENGTH);

    expect(result.velocityLoss).not.toBeNull();
    expect(result.velocityLoss as number).toBeGreaterThan(0);
    expect(result.velocityLoss as number).toBeCloseTo(0.75, 2); // 4x slower -> 75% loss
  });

  it("degrades gracefully with no torso length available", () => {
    const result = computeVelocity(
      [rep({ barProxyTrack: track([{ t: 0, x: 0.5, y: 0.5 }, { t: 1000, x: 0.5, y: 0.1 }]) })],
      null,
    );

    expect(result.perRep).toHaveLength(0);
    expect(result.mean).toBeNull();
  });

  it("returns null velocityLoss with only one rep", () => {
    const result = computeVelocity(
      [
        rep({
          ascentStartAtMs: 0,
          ascentEndAtMs: 1000,
          barProxyTrack: track([{ t: 0, x: 0.5, y: 0.5 }, { t: 1000, x: 0.5, y: 0.1 }]),
        }),
      ],
      TORSO_LENGTH,
    );

    expect(result.velocityLoss).toBeNull();
  });
});

describe("bar path", () => {
  it("reports zero deviation for a perfectly vertical bar path", () => {
    const deviation = computeRepHorizontalDeviation(
      rep({
        barProxyTrack: track([
          { t: 0, x: 0.5, y: 0.5 },
          { t: 500, x: 0.5, y: 0.3 },
          { t: 1000, x: 0.5, y: 0.1 },
        ]),
      }),
      TORSO_LENGTH,
    );

    expect(deviation).toBe(0);
  });

  it("reports nonzero deviation when the bar drifts horizontally", () => {
    const deviation = computeRepHorizontalDeviation(
      rep({
        barProxyTrack: track([
          { t: 0, x: 0.5, y: 0.5 },
          { t: 500, x: 0.6, y: 0.3 },
          { t: 1000, x: 0.5, y: 0.1 },
        ]),
      }),
      TORSO_LENGTH,
    );

    expect(deviation).not.toBeNull();
    expect(deviation as number).toBeGreaterThan(0);
  });

  it("returns null with an unknown torso length", () => {
    const deviation = computeRepHorizontalDeviation(
      rep({ barProxyTrack: track([{ t: 0, x: 0.5, y: 0.5 }, { t: 500, x: 0.6, y: 0.3 }]) }),
      null,
    );

    expect(deviation).toBeNull();
  });

  it("computes consistency across multiple reps, null with fewer than 2", () => {
    const consistentReps = [
      rep({
        repNumber: 1,
        barProxyTrack: track([{ t: 0, x: 0.5, y: 0.5 }, { t: 500, x: 0.5, y: 0.1 }]),
      }),
      rep({
        repNumber: 2,
        barProxyTrack: track([{ t: 0, x: 0.5, y: 0.5 }, { t: 500, x: 0.5, y: 0.1 }]),
      }),
    ];

    expect(computeBarPathConsistency(consistentReps, TORSO_LENGTH)).toBe(1);
    expect(computeBarPathConsistency([consistentReps[0]], TORSO_LENGTH)).toBeNull();
  });
});
