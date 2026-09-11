/**
 * Performance analytics (spec §14).
 *
 * `exercise_sets.estimated_1rm_kg` is already a generated column in
 * the database using the Epley formula:
 *
 *   e1RM = weight_kg * (1 + reps / 30)     (reps between 1 and 12)
 *
 * `epley1RM` here is the same formula, documented centrally, for the
 * rare case a caller needs to recompute it outside SQL (e.g. a
 * What-If simulation on hypothetical sets that were never logged).
 * Comparisons only ever happen within the SAME exercise — different
 * exercises are never treated as equivalent performance measures.
 */

export function epley1RM(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || !Number.isFinite(weightKg)) {
    return null;
  }

  if (!Number.isInteger(reps) || reps < 1 || reps > 12) {
    return null;
  }

  return Math.round(weightKg * (1 + reps / 30) * 100) / 100;
}

export type PerformanceDataPoint = {
  date: string;
  estimated1RmKg: number;
};

export type PerformanceTrend =
  | "improving"
  | "stable"
  | "declining"
  | "mixed"
  | "insufficient_data";

export type PerformanceTrendResult = {
  trend: PerformanceTrend;
  changePercent: number | null;
  sampleSize: number;
};

const MIN_POINTS_FOR_TREND = 3;
const STABLE_BAND_PERCENT = 3;

/**
 * Classifies the trend for ONE exercise's e1RM history. Callers are
 * responsible for only passing comparable points (same exercise,
 * completed working sets in a comparable rep range) — this function
 * does not attempt to reconcile different exercises or rep ranges.
 */
export function classifyPerformanceTrend(
  points: PerformanceDataPoint[],
): PerformanceTrendResult {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < MIN_POINTS_FOR_TREND) {
    return { trend: "insufficient_data", changePercent: null, sampleSize: sorted.length };
  }

  const midpoint = Math.ceil(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const average = (values: PerformanceDataPoint[]) =>
    values.reduce((sum, point) => sum + point.estimated1RmKg, 0) / values.length;

  const firstAvg = average(firstHalf);
  const secondAvg = average(secondHalf);

  if (firstAvg <= 0) {
    return { trend: "insufficient_data", changePercent: null, sampleSize: sorted.length };
  }

  const changePercent = Math.round(((secondAvg - firstAvg) / firstAvg) * 10000) / 100;

  // Internal consistency check: do individual point-to-point deltas
  // actually agree with the overall direction, or do they conflict
  // enough that a single "improving"/"declining" label would overstate
  // confidence?
  let increases = 0;
  let decreases = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const delta = sorted[i].estimated1RmKg - sorted[i - 1].estimated1RmKg;
    const deltaPercent = (delta / sorted[i - 1].estimated1RmKg) * 100;

    if (deltaPercent > 1) {
      increases += 1;
    } else if (deltaPercent < -1) {
      decreases += 1;
    }
  }

  const conflicting = increases > 0 && decreases > 0;

  if (Math.abs(changePercent) <= STABLE_BAND_PERCENT) {
    return {
      trend: conflicting ? "mixed" : "stable",
      changePercent,
      sampleSize: sorted.length,
    };
  }

  if (conflicting && increases > 0 && decreases > 0 && Math.abs(increases - decreases) <= 1) {
    return { trend: "mixed", changePercent, sampleSize: sorted.length };
  }

  return {
    trend: changePercent > 0 ? "improving" : "declining",
    changePercent,
    sampleSize: sorted.length,
  };
}
