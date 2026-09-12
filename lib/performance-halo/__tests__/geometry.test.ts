import { describe, expect, it } from "vitest";

import { buildPillarArcs, describeArcPath, polarToCartesian } from "../geometry";

describe("polarToCartesian", () => {
  it("places 0deg at 12 o'clock (top, directly above center)", () => {
    const p = polarToCartesian(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5); // above center: cy - r
  });

  it("places 90deg at 3 o'clock (right of center)", () => {
    const p = polarToCartesian(100, 100, 50, 90);
    expect(p.x).toBeCloseTo(150, 5); // right: cx + r
    expect(p.y).toBeCloseTo(100, 5);
  });

  it("places 180deg at 6 o'clock (below center)", () => {
    const p = polarToCartesian(100, 100, 50, 180);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(150, 5); // below: cy + r
  });

  it("places 270deg at 9 o'clock (left of center)", () => {
    const p = polarToCartesian(100, 100, 50, 270);
    expect(p.x).toBeCloseTo(50, 5); // left: cx - r
    expect(p.y).toBeCloseTo(100, 5);
  });
});

describe("describeArcPath", () => {
  it("returns null for zero or negative sweep (nothing to draw)", () => {
    expect(describeArcPath(100, 100, 50, 0, 0)).toBeNull();
    expect(describeArcPath(100, 100, 50, 0, -10)).toBeNull();
  });

  it("uses the large-arc flag only when sweep exceeds 180deg", () => {
    const small = describeArcPath(100, 100, 50, 0, 90);
    const large = describeArcPath(100, 100, 50, 0, 200);

    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    // The large-arc-flag is the 5th space-separated token in "M x y A r r 0 FLAG 1 x y"
    expect(small!.split(" ")[7]).toBe("0");
    expect(large!.split(" ")[7]).toBe("1");
  });

  it("starts and ends at the expected points for a quarter sweep from 12 o'clock", () => {
    const path = describeArcPath(100, 100, 50, 0, 90);
    // Start at 12 o'clock (100, 50), end at 3 o'clock (150, 100)
    expect(path).toContain("100.000 50.000");
    expect(path).toContain("150.000 100.000");
  });
});

describe("buildPillarArcs", () => {
  const spec = { radius: 88, startAngle: 200, rangeAngle: 140 };

  it("draws a track but no fill when value is null (never fabricates a fill)", () => {
    const arcs = buildPillarArcs(spec, null);
    expect(arcs.trackPath).not.toBeNull();
    expect(arcs.fillPath).toBeNull();
  });

  it("draws no fill for value 0, and the full range for value 100", () => {
    expect(buildPillarArcs(spec, 0).fillPath).toBeNull();

    const full = buildPillarArcs(spec, 100);
    const track = buildPillarArcs(spec, null).trackPath;
    expect(full.fillPath).toBe(track);
  });

  it("clamps out-of-range values instead of overshooting the track", () => {
    const over = buildPillarArcs(spec, 150);
    const atCap = buildPillarArcs(spec, 100);
    expect(over.fillPath).toBe(atCap.fillPath);

    const under = buildPillarArcs(spec, -20);
    expect(under.fillPath).toBeNull();
  });

  it("produces a shorter fill sweep for a smaller value", () => {
    const half = buildPillarArcs(spec, 50).fillPath!;
    const full = buildPillarArcs(spec, 100).fillPath!;
    // Both arcs share the same start point; the full-sweep path's
    // end point should differ from the half-sweep path's end point.
    const halfEnd = half.split(" ").slice(-2).join(" ");
    const fullEnd = full.split(" ").slice(-2).join(" ");
    expect(halfEnd).not.toBe(fullEnd);
  });
});
