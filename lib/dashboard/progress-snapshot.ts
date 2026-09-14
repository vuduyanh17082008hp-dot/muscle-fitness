import type { RecoveryTrendPoint } from "@/lib/recovery/load-recovery-context";
import type { DailyNutritionTotal } from "@/lib/dashboard/load-weekly-nutrition-totals";

export type ProgressTrainingAdherence = {
  percent: number | null;
  sessionsCompleted: number;
  sessionsTarget: number | null;
};

export type ProgressRecoveryTrend = {
  points: Array<{ date: string; score: number | null }>;
  current: number | null;
  sevenDayAverage: number | null;
};

export type ProgressProteinAdherence = {
  /** Average % of target across days that actually have a log entry. Null when nothing was logged. */
  averagePercent: number | null;
  daysLogged: number;
  daysInWindow: number;
};

export type ProgressWeightSnapshot = {
  currentKg: number | null;
  /** Always false today — no bodyweight-history feature exists yet (see lib/dashboard/progress-snapshot.ts). Kept explicit so the UI shows an honest "trend needs logged weigh-ins" state instead of fabricating one. */
  trendAvailable: false;
};

export type DashboardProgressSnapshot = {
  trainingAdherence: ProgressTrainingAdherence;
  recoveryTrend: ProgressRecoveryTrend;
  proteinAdherence: ProgressProteinAdherence;
  weight: ProgressWeightSnapshot;
};

export type BuildProgressSnapshotInput = {
  sessionsCompletedLast7Days: number;
  trainingDaysTarget: number | null;
  recoveryTrend30Days: RecoveryTrendPoint[];
  recoveryScoreToday: number | null;
  recoverySevenDayAverage: number | null;
  weeklyNutritionTotals: DailyNutritionTotal[];
  proteinTargetG: number | null;
  currentWeightKg: number | null;
};

/**
 * Pure Progress Snapshot derivation — every number here is read from
 * data already loaded elsewhere on the dashboard (Recovery Engine,
 * Nutrition Engine, workout_sessions); nothing is computed twice with
 * different logic than the dedicated pages use.
 */
export function buildProgressSnapshot(input: BuildProgressSnapshotInput): DashboardProgressSnapshot {
  const trainingAdherence: ProgressTrainingAdherence = {
    percent:
      input.trainingDaysTarget && input.trainingDaysTarget > 0
        ? Math.round((input.sessionsCompletedLast7Days / input.trainingDaysTarget) * 100)
        : null,
    sessionsCompleted: input.sessionsCompletedLast7Days,
    sessionsTarget: input.trainingDaysTarget,
  };

  const last7 = input.recoveryTrend30Days.slice(-7);

  const recoveryTrend: ProgressRecoveryTrend = {
    points: last7.map((point) => ({ date: point.date, score: point.score })),
    current: input.recoveryScoreToday,
    sevenDayAverage: input.recoverySevenDayAverage,
  };

  const loggedDays = input.weeklyNutritionTotals.filter((day) => day.entryCount > 0);

  const proteinAdherence: ProgressProteinAdherence = {
    averagePercent:
      input.proteinTargetG && input.proteinTargetG > 0 && loggedDays.length > 0
        ? Math.round(
            (loggedDays.reduce((sum, day) => sum + day.proteinG / (input.proteinTargetG as number), 0) /
              loggedDays.length) *
              100,
          )
        : null,
    daysLogged: loggedDays.length,
    daysInWindow: input.weeklyNutritionTotals.length,
  };

  const weight: ProgressWeightSnapshot = {
    currentKg: input.currentWeightKg,
    trendAvailable: false,
  };

  return { trainingAdherence, recoveryTrend, proteinAdherence, weight };
}
