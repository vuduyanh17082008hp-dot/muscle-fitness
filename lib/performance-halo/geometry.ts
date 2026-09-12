/**
 * Pure arc-path math for PerformanceHalo. Kept isolated from the
 * component and unit-tested (see __tests__/geometry.test.ts) since
 * there is no browser available to visually verify SVG output in
 * this environment — a wrong sign here would silently draw a
 * self-intersecting or inverted arc.
 *
 * Angle convention: 0deg points to 12 o'clock, increasing clockwise
 * (matches how the design references "sweep" visually).
 */

export type Point = { x: number; y: number };

export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): Point {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/**
 * SVG path `d` for a clockwise arc of a circle of radius `r`, from
 * `startAngleDeg` sweeping `sweepAngleDeg` degrees. Returns null for
 * a non-positive sweep (nothing to draw) rather than an empty/invalid
 * path string.
 */
export function describeArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  sweepAngleDeg: number,
): string | null {
  const sweep = Math.min(359.999, Math.max(0, sweepAngleDeg));

  if (sweep <= 0) return null;

  const start = polarToCartesian(cx, cy, r, startAngleDeg);
  const end = polarToCartesian(cx, cy, r, startAngleDeg + sweep);
  const largeArcFlag = sweep > 180 ? 1 : 0;

  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export type ArcSpec = {
  radius: number;
  /** Where this pillar's available range begins, in degrees (0 = 12 o'clock, clockwise). */
  startAngle: number;
  /** Total degrees this pillar's track occupies. */
  rangeAngle: number;
};

export type ArcPaths = {
  /** The full, dim background track — always drawn so the pillar is legible even with no data. */
  trackPath: string | null;
  /** The filled portion representing the value, or null when there's no data to show (never fabricated). */
  fillPath: string | null;
};

/**
 * Builds the track + fill paths for one pillar. `value` is 0-100 or
 * null (no data — draws the track only, never a fabricated fill).
 */
export function buildPillarArcs(spec: ArcSpec, value: number | null): ArcPaths {
  const trackPath = describeArcPath(100, 100, spec.radius, spec.startAngle, spec.rangeAngle);

  if (value === null) {
    return { trackPath, fillPath: null };
  }

  const clamped = Math.min(100, Math.max(0, value));
  const fillSweep = (clamped / 100) * spec.rangeAngle;
  const fillPath = describeArcPath(100, 100, spec.radius, spec.startAngle, fillSweep);

  return { trackPath, fillPath };
}
