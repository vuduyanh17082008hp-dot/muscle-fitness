import { computeBaselineDeviation, type BaselineDeviation } from "@/lib/dante-core/personal-baseline";
import type { ConfidenceLevel, TraceableDecision } from "@/lib/dante-core/types";
import type { RadarSignal, RadarSignalName, RadarStatus, RecoveryRadarResult } from "@/lib/health-radar/types";

/**
 * Recovery Radar engine — an anomaly detector over PERSONAL baseline
 * deviation, never a population norm and never a diagnosis (spec Part
 * "4. PERFORMANCE / RECOVERY RADAR"). Reuses the same
 * computeBaselineDeviation primitive every other "you vs. your own
 * normal" feature in this codebase already uses
 * (lib/dante-core/personal-baseline.ts) — this is not a second,
 * competing statistics implementation.
 */

export type RecoveryRadarInput = {
  hrv: { history: Array<number | null>; today: number | null };
  restingHr: { history: Array<number | null>; today: number | null };
  sleepHours: { history: Array<number | null>; today: number | null };
  recoveryScore: { history: Array<number | null>; today: number | null };
  dataSource: { wearable: boolean; isDemoWearable: boolean; recoveryCheckins: boolean };
};

/** delta thresholds are direction-normalized: negative always means "worse". watch/significant are absolute-value cutoffs on that normalized delta. */
const THRESHOLDS: Record<RadarSignalName, { watch: number; significant: number; worseIsNegative: boolean }> = {
  hrv: { watch: 8, significant: 15, worseIsNegative: true }, // ms drop
  resting_hr: { watch: 4, significant: 8, worseIsNegative: false }, // bpm rise
  sleep: { watch: 60, significant: 120, worseIsNegative: true }, // minutes drop (sleepHours history passed in hours * 60 by caller convention below)
  recovery_score: { watch: 10, significant: 20, worseIsNegative: true }, // points drop
};

const SIGNAL_LABELS: Record<RadarSignalName, string> = {
  hrv: "HRV",
  resting_hr: "Resting heart rate",
  sleep: "Sleep",
  recovery_score: "Recovery score",
};

function confidenceLevelFromFraction(fraction: number): ConfidenceLevel {
  if (fraction >= 0.75) return "high";
  if (fraction >= 0.5) return "moderate";
  return "low";
}

function classify(deviation: BaselineDeviation, signal: RadarSignalName): RadarSignal["concerning"] {
  if (deviation.delta === null || deviation.confidence < 0.5) return "none";

  const config = THRESHOLDS[signal];
  const normalizedBadDelta = config.worseIsNegative ? -deviation.delta : deviation.delta;

  if (normalizedBadDelta >= config.significant) return "significant";
  if (normalizedBadDelta >= config.watch) return "watch";
  return "none";
}

function directionFor(deviation: BaselineDeviation, signal: RadarSignalName): RadarSignal["direction"] {
  if (deviation.delta === null) return "unknown";
  if (deviation.delta === 0) return "flat";

  const config = THRESHOLDS[signal];
  const isWorse = config.worseIsNegative ? deviation.delta < 0 : deviation.delta > 0;
  return isWorse ? "worse" : "better";
}

function describeSignal(signal: RadarSignal, unit: string): string {
  const { deviation, label } = signal;
  if (deviation.current === null || deviation.baseline === null || deviation.delta === null) {
    return `${label}: not enough history yet to compare against your own normal.`;
  }

  const magnitude = Math.abs(deviation.delta);
  const trendWord = signal.direction === "worse" ? "below" : signal.direction === "better" ? "above" : "at";

  return `${label} is ${magnitude}${unit} ${trendWord} your usual ${deviation.baseline}${unit} (currently ${deviation.current}${unit}).`;
}

export function buildRecoveryRadar(input: RecoveryRadarInput): TraceableDecision<RecoveryRadarResult> {
  // Sleep is measured in hours by every caller in this codebase (recovery_checkins.sleep_hours) —
  // convert to minutes internally only for threshold comparison, keep the reported unit in hours.
  const sleepHoursDeviation = computeBaselineDeviation(input.sleepHours.history, input.sleepHours.today);
  const sleepMinutesDeviation = computeBaselineDeviation(
    input.sleepHours.history.map((h) => (h === null ? null : h * 60)),
    input.sleepHours.today === null ? null : input.sleepHours.today * 60,
  );

  const hrvDeviation = computeBaselineDeviation(input.hrv.history, input.hrv.today);
  const restingHrDeviation = computeBaselineDeviation(input.restingHr.history, input.restingHr.today);
  const recoveryScoreDeviation = computeBaselineDeviation(input.recoveryScore.history, input.recoveryScore.today);

  const signals: RadarSignal[] = [
    {
      name: "hrv",
      label: SIGNAL_LABELS.hrv,
      direction: directionFor(hrvDeviation, "hrv"),
      deviation: hrvDeviation,
      concerning: classify(hrvDeviation, "hrv"),
    },
    {
      name: "resting_hr",
      label: SIGNAL_LABELS.resting_hr,
      direction: directionFor(restingHrDeviation, "resting_hr"),
      deviation: restingHrDeviation,
      concerning: classify(restingHrDeviation, "resting_hr"),
    },
    {
      name: "sleep",
      label: SIGNAL_LABELS.sleep,
      direction: directionFor(sleepHoursDeviation, "sleep"),
      deviation: sleepHoursDeviation,
      concerning: classify(sleepMinutesDeviation, "sleep"),
    },
    {
      name: "recovery_score",
      label: SIGNAL_LABELS.recovery_score,
      direction: directionFor(recoveryScoreDeviation, "recovery_score"),
      deviation: recoveryScoreDeviation,
      concerning: classify(recoveryScoreDeviation, "recovery_score"),
    },
  ];

  const significantCount = signals.filter((s) => s.concerning === "significant").length;
  const watchCount = signals.filter((s) => s.concerning === "watch").length;

  let status: RadarStatus = "normal";
  if (significantCount >= 1 || watchCount >= 2) {
    status = "significant_deviation";
  } else if (watchCount === 1) {
    status = "watch";
  }

  const concerningSignals = signals.filter((s) => s.concerning !== "none");

  const why =
    concerningSignals.length > 0
      ? concerningSignals.map((s) => describeSignal(s, s.name === "sleep" ? "h" : s.name === "recovery_score" ? "" : s.name === "hrv" ? "ms" : "bpm"))
      : ["Every measured signal is within your own normal range right now."];

  const usableSignals = signals.filter((s) => s.deviation.confidence > 0);
  const confidenceFraction =
    usableSignals.length > 0
      ? usableSignals.reduce((sum, s) => sum + s.deviation.confidence, 0) / usableSignals.length
      : 0;

  const recommendation =
    status === "significant_deviation"
      ? "An unusual recovery pattern stands out today, compared with your own recent normal."
      : status === "watch"
        ? "One recovery signal looks slightly off from your normal pattern — worth watching."
        : "Your recovery signals look consistent with your own normal pattern.";

  const limitations = [
    "This compares today against YOUR OWN recent history, never a population average, and it is not a medical assessment — it cannot diagnose illness, injury, or overtraining.",
  ];

  if (usableSignals.length < signals.length) {
    limitations.push(
      `${signals.length - usableSignals.length} of ${signals.length} signals don't have enough history yet to compare confidently.`,
    );
  }

  if (input.dataSource.isDemoWearable) {
    limitations.push("HRV and resting heart rate are from a demo wearable scenario, not a connected real device.");
  } else if (!input.dataSource.wearable) {
    limitations.push("No wearable is connected, so HRV and resting heart rate can't be assessed — only sleep and recovery score.");
  }

  const dataUsed: Record<string, string | number | null> = {
    hrvDeltaMs: hrvDeviation.delta,
    restingHrDeltaBpm: restingHrDeviation.delta,
    sleepDeltaHours: sleepHoursDeviation.delta,
    recoveryScoreDelta: recoveryScoreDeviation.delta,
    status,
  };

  const result: RecoveryRadarResult = {
    status,
    signals,
    dataSource: input.dataSource,
  };

  return {
    recommendation,
    decision: result,
    why,
    dataUsed,
    confidence: confidenceLevelFromFraction(confidenceFraction),
    sources: [],
    limitations,
  };
}
