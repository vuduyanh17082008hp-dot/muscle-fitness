import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadTrainingContext } from "@/lib/training/load-training-context";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import {
  computeMuscleRecommendation,
  type RecoveryStatusInput,
  type TrainingLoadStateInput,
} from "@/lib/training/recommendations";
import { classifyPerformanceTrend, type PerformanceTrend } from "@/lib/training/performance";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { AthleteState } from "@/lib/athlete-state/types";

type FitnessProfileRow = {
  goal: string | null;
  experience: string | null;
  training_days: number | null;
  priority_muscles: string[] | null;
};

/**
 * Picks a single, comparable-exercise performance trend for a muscle:
 * among the exercises that contribute to it as a PRIMARY mover, uses
 * whichever one has the most logged e1RM history. Different exercises
 * are never blended into one trend (spec §14).
 */
function pickPerformanceTrendForMuscle(
  muscle: CanonicalMuscle,
  trainingContext: TrainingContext,
): PerformanceTrend {
  let bestExerciseId: string | null = null;
  let bestCount = 0;

  for (const [exerciseId, contributions] of trainingContext.contributionsByExercise) {
    const isPrimaryForMuscle = contributions.some(
      (contribution) => contribution.muscle === muscle && contribution.role === "primary",
    );

    if (!isPrimaryForMuscle) {
      continue;
    }

    const history = trainingContext.e1RmHistoryByExercise.get(exerciseId) ?? [];

    if (history.length > bestCount) {
      bestCount = history.length;
      bestExerciseId = exerciseId;
    }
  }

  if (!bestExerciseId) {
    return "insufficient_data";
  }

  return classifyPerformanceTrend(
    trainingContext.e1RmHistoryByExercise.get(bestExerciseId) ?? [],
  ).trend;
}

/**
 * Builds the normalized Athlete State (spec §4) — the single object
 * consumed by the dashboard, Training Intelligence UI, Weekly
 * Review, and Dante's context builder. Aggregates existing
 * deterministic engines; invents nothing itself.
 */
export async function buildAthleteState(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: Date; timeZoneOffsetMinutes?: number } = {},
): Promise<AthleteState> {
  const now = options.now ?? new Date();

  const [trainingContext, nutritionContext, recoveryContext, fitnessProfileResponse] =
    await Promise.all([
      loadTrainingContext(supabase, userId, {
        now,
        timeZoneOffsetMinutes: options.timeZoneOffsetMinutes,
      }),
      loadNutritionContext(supabase, userId),
      loadRecoveryContext(supabase, userId).catch((error: unknown) => {
        console.warn("[ATHLETE STATE] recovery context failed:", error);
        return null;
      }),
      supabase
        .from("fitness_profiles")
        .select("goal, experience, training_days, priority_muscles")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  const fitnessProfile = (fitnessProfileResponse.data as FitnessProfileRow | null) ?? null;

  const recoveryStatus: RecoveryStatusInput = recoveryContext
    ? (recoveryContext.todayScoreResult.status as RecoveryStatusInput)
    : null;

  const trainingLoadState: TrainingLoadStateInput = recoveryContext
    ? recoveryContext.trainingLoad.state
    : null;

  const recoveryLoggingCompleteness = recoveryContext
    ? recoveryContext.averages7Days.sampleSize / 7
    : null;

  const muscles = Array.from(trainingContext.weeklyAnalytics.entries()).map(
    ([muscle, analytics]) => {
      const performanceTrend = pickPerformanceTrendForMuscle(muscle, trainingContext);
      const baseline = trainingContext.baseline.get(muscle) ?? {
        muscle,
        sampleWeeks: 0,
        typicalWeeklyVolume: null,
        recentRange: null,
        variability: null,
      };

      const maxSingleSessionShare = null; // session-distribution breakdown deferred to a later phase

      const recommendation = computeMuscleRecommendation({
        currentEffectiveVolume: analytics.currentWeek.totalEffectiveSets,
        previousVolume: analytics.previousWeek?.totalEffectiveSets ?? null,
        changePercent: analytics.changePercent,
        baseline,
        frequency: analytics.frequency,
        maxSingleSessionShare,
        performanceTrend,
        recoveryStatus,
        trainingLoadState,
        recoveryLoggingCompleteness,
      });

      return { muscle, analytics, baseline, recommendation };
    },
  );

  return {
    generatedAt: now.toISOString(),
    dataWindow: trainingContext.dataWindow,

    profile: {
      goal: fitnessProfile?.goal ?? null,
      experience: fitnessProfile?.experience ?? null,
      trainingFrequency: fitnessProfile?.training_days ?? null,
      priorityMuscles: fitnessProfile?.priority_muscles ?? [],
    },

    training: {
      hasAnyLoggedData: trainingContext.hasAnyLoggedData,
      muscles,
      exerciseNames: Object.fromEntries(
        Array.from(trainingContext.exercisesById.entries()).map(([id, exercise]) => [
          id,
          exercise.name,
        ]),
      ),
    },

    recovery: {
      available: recoveryContext !== null,
      score: recoveryContext?.todayScoreResult.score ?? null,
      status:
        recoveryContext?.todayScoreResult.status !== null &&
        recoveryContext?.todayScoreResult.status !== undefined
          ? RECOVERY_STATUS_LABEL[recoveryContext.todayScoreResult.status]
          : null,
      trainingLoadState,
      sevenDayAverageScore: recoveryContext?.averages7Days.score ?? null,
    },

    nutrition: {
      available: nutritionContext.plan !== null,
      calorieTarget: nutritionContext.plan?.target.calories ?? null,
      proteinTargetGrams: nutritionContext.plan?.target.protein ?? null,
      carbsTargetGrams: nutritionContext.plan?.target.carbs ?? null,
      fatTargetGrams: nutritionContext.plan?.target.fat ?? null,
    },

    progress: {
      status: "not_yet_implemented",
    },
  };
}
