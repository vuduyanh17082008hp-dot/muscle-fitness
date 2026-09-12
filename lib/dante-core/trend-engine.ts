import {
  classifyPerformanceTrend,
  type PerformanceDataPoint,
} from "@/lib/training/performance";
import type {
  SetVisionTrendPoint,
  TrendEvaluation,
} from "@/lib/dante-core/types";

/**
 * Trend Engine (spec Part A §5).
 *
 * This does NOT reimplement trend classification — that already
 * exists, tested, in lib/training/performance.ts::classifyPerformanceTrend
 * (e1RM-based, same-exercise-only, rolling-window comparison with a
 * stable band and a "mixed" signal for conflicting deltas). Dante
 * Core's job here is narrow: fuse in a SetVision cross-check when
 * available, without ever overriding the underlying classification.
 */

const MIN_SETVISION_POINTS = 3;
const NOTABLE_VELOCITY_LOSS_DRIFT = 0.08; // 8 percentage points, e1RM/session

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Compares the average velocity loss of the first half vs. second
 * half of the supplied SetVision history to see whether it agrees or
 * conflicts with the e1RM-based trend. Descriptive only — it never
 * changes `trend`/`changePercent`.
 */
function buildSetVisionNote(
  trend: TrendEvaluation["trend"],
  setVisionPoints: SetVisionTrendPoint[] | undefined,
): string | null {
  if (!setVisionPoints || setVisionPoints.length === 0) {
    return null;
  }

  const withLoss = setVisionPoints
    .filter((p) => p.velocityLoss !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (withLoss.length < MIN_SETVISION_POINTS) {
    return "Not enough SetVision sessions with calibrated velocity data yet to cross-check this trend.";
  }

  const midpoint = Math.ceil(withLoss.length / 2);
  const firstHalf = withLoss.slice(0, midpoint);
  const secondHalf = withLoss.slice(midpoint);

  const average = (points: SetVisionTrendPoint[]) =>
    points.reduce((sum, p) => sum + (p.velocityLoss as number), 0) /
    points.length;

  const firstAvg = average(firstHalf);
  const secondAvg = average(secondHalf);
  const drift = round(secondAvg - firstAvg);

  const velocityLossRising = drift > NOTABLE_VELOCITY_LOSS_DRIFT;
  const velocityLossFalling = drift < -NOTABLE_VELOCITY_LOSS_DRIFT;

  if (trend === "declining" && velocityLossRising) {
    return `Velocity loss has also been trending upward across recent SetVision sessions (+${round(drift * 100)} pts), consistent with the declining e1RM trend.`;
  }

  if (trend === "improving" && velocityLossFalling) {
    return `Velocity loss has been trending downward across recent SetVision sessions (${round(drift * 100)} pts), consistent with the improving e1RM trend.`;
  }

  if (trend === "declining" && velocityLossFalling) {
    return "Velocity loss has actually been improving even though e1RM is declining — worth checking whether load/rep-range changes explain the e1RM drop rather than fatigue.";
  }

  if (Math.abs(drift) <= NOTABLE_VELOCITY_LOSS_DRIFT) {
    return "SetVision velocity loss has been stable across recent sessions, with no strong signal in either direction.";
  }

  return null;
}

export function evaluateTrend(
  e1rmPoints: PerformanceDataPoint[],
  setVisionPoints?: SetVisionTrendPoint[],
): TrendEvaluation {
  const base = classifyPerformanceTrend(e1rmPoints);

  return {
    trend: base.trend,
    changePercent: base.changePercent,
    sampleSize: base.sampleSize,
    setVisionNote: buildSetVisionNote(base.trend, setVisionPoints),
  };
}
