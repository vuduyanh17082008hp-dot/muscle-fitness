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
import { loadSetVisionContext } from "@/lib/setvision/load-setvision-context";
import { computeBaselineDeviation, deviationFromSummary } from "@/lib/dante-core/personal-baseline";
import { buildMuscleRecoveryMap } from "@/lib/dante-core/muscle-recovery-map";
import { computeFreshness, FRESHNESS_THRESHOLDS } from "@/lib/athlete-state/data-freshness";
import { evaluateReadiness } from "@/lib/dante-core/readiness-engine";
import { loadDemoSettings } from "@/lib/demo/settings";
import { resolveWearableProvider } from "@/lib/wearables/registry";

type FitnessProfileRow = {
  goal: string | null;
  experience: string | null;
  training_days: number | null;
  priority_muscles: string[] | null;
  updated_at: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  session_duration_minutes: number | null;
  available_equipment: string[] | null;
  physical_limitations: string | null;
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

  const [
    trainingContext,
    nutritionContext,
    recoveryContext,
    fitnessProfileResponse,
    setVisionContext,
    latestFoodLogResponse,
    demoSettings,
  ] = await Promise.all([
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
        .select(
          "goal, experience, training_days, priority_muscles, updated_at, height_cm, weight_kg, session_duration_minutes, available_equipment, physical_limitations",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      loadSetVisionContext(supabase, userId, { now }),
      supabase
        .from("food_logs")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadDemoSettings(supabase, userId),
    ]);

  const fitnessProfile = (fitnessProfileResponse.data as FitnessProfileRow | null) ?? null;

  // WearableProvider -> normalize -> Athlete Digital Twin (spec Part
  // "1. WEARABLE PROVIDER LAYER"). Only ever populated when THIS user
  // has explicitly opted into their own demo scenario — never a
  // silent fallback for a real user with no wearable connected.
  const wearableProvider = resolveWearableProvider(demoSettings);
  const endIso = now.toISOString().slice(0, 10);
  const wearableBundle = wearableProvider
    ? await wearableProvider.fetchSnapshots(userId, { startDate: endIso, endDate: endIso })
    : null;
  const latestWearableDay = wearableBundle?.days[wearableBundle.days.length - 1] ?? null;

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

  /* =======================================================
     DERIVED — baseline deviations, muscle recovery map,
     confidence, missing-data indicators. Every computation here
     reuses data already loaded above; nothing is fetched twice
     and nothing is invented.
  ======================================================= */

  const todayCheckinDate = recoveryContext?.today?.checkin_date ?? null;

  const sleepDeviation = computeBaselineDeviation(
    recoveryContext
      ? recoveryContext.trend30Days
          .filter((point) => point.date !== todayCheckinDate)
          .map((point) => point.sleepHours)
      : [],
    recoveryContext?.today?.sleep_hours ?? null,
  );

  const recoveryScoreDeviation = computeBaselineDeviation(
    recoveryContext
      ? recoveryContext.trend30Days
          .filter((point) => point.date !== todayCheckinDate)
          .map((point) => point.score)
      : [],
    recoveryContext?.todayScoreResult.score ?? null,
  );

  // Whole-body training-load baseline: aggregates the SAME per-muscle
  // baselines already computed above (lib/training/baseline.ts) rather
  // than re-deriving load from raw sets — one source of truth for
  // "what is this lifter's own normal volume".
  const trainingLoadDeviation = (() => {
    let currentTotal = 0;
    let baselineTotal = 0;
    let minSampleWeeks = Infinity;
    let musclesWithBaseline = 0;

    for (const entry of muscles) {
      currentTotal += entry.analytics.currentWeek.totalEffectiveSets;

      if (entry.baseline.typicalWeeklyVolume !== null) {
        baselineTotal += entry.baseline.typicalWeeklyVolume;
        minSampleWeeks = Math.min(minSampleWeeks, entry.baseline.sampleWeeks);
        musclesWithBaseline += 1;
      }
    }

    if (musclesWithBaseline === 0) {
      return deviationFromSummary(currentTotal, null, 0);
    }

    return deviationFromSummary(currentTotal, baselineTotal, minSampleWeeks);
  })();

  // Muscle Recovery Map — built on the SAME MuscleRecoveryEstimate[]
  // Dante Core's readiness engine already computes (never a second,
  // parallel recovery-percent calculation). trainingContext /
  // recoveryContext are already loaded above, so this only assembles
  // the engine's input, it doesn't fetch anything new.
  const readinessMuscleInputs = Array.from(trainingContext.weeklyAnalytics.entries()).map(
    ([muscle, analytics]) => ({
      muscle,
      lastTrainedDate: analytics.lastTrainedDate,
      recentEffectiveSets: analytics.currentWeek.totalEffectiveSets,
      typicalWeeklyVolume: trainingContext.baseline.get(muscle)?.typicalWeeklyVolume ?? null,
    }),
  );

  const readiness = evaluateReadiness({
    recoveryScore: recoveryContext?.todayScoreResult ?? {
      score: null,
      status: null,
      drivers: [],
      missingInputs: [],
      baseline: null,
    },
    trainingLoad: recoveryContext?.trainingLoad ?? null,
    muscles: readinessMuscleInputs,
    now,
  });

  const performanceTrendByMuscle = new Map<CanonicalMuscle, PerformanceTrend>(
    muscles.map((entry) => [
      entry.muscle,
      pickPerformanceTrendForMuscle(entry.muscle, trainingContext),
    ]),
  );

  const sorenessDriver = recoveryContext?.todayScoreResult.drivers.find(
    (driver) => driver.key === "soreness" && driver.available,
  );

  const muscleRecoveryMap = buildMuscleRecoveryMap({
    muscleRecovery: readiness.muscleRecovery,
    systemicFatigue: readiness.systemicFatigue,
    sorenessScoreToday: sorenessDriver?.score ?? null,
    performanceTrendByMuscle,
  });

  const baselineConfidences = [
    sleepDeviation.confidence,
    recoveryScoreDeviation.confidence,
    trainingLoadDeviation.confidence,
    ...muscleRecoveryMap.map((entry) => entry.confidence),
  ].filter((confidence) => confidence > 0);

  const overallConfidence =
    baselineConfidences.length > 0
      ? Math.round(
          (baselineConfidences.reduce((sum, value) => sum + value, 0) / baselineConfidences.length) *
            100,
        ) / 100
      : 0;

  const missingData: string[] = [];
  if (!recoveryContext) missingData.push("recovery");
  if (!nutritionContext.plan) missingData.push("nutrition");
  if (!trainingContext.hasAnyLoggedData) missingData.push("training");
  if (!setVisionContext.available) missingData.push("setVision");

  /* =======================================================
     DATA FRESHNESS
  ======================================================= */

  let lastTrainingSessionAt: string | null = null;
  for (const session of trainingContext.lastSessionByExercise.values()) {
    if (session.completedAt && (!lastTrainingSessionAt || session.completedAt > lastTrainingSessionAt)) {
      lastTrainingSessionAt = session.completedAt;
    }
  }

  const dataFreshness: AthleteState["dataFreshness"] = {
    recovery: computeFreshness(
      recoveryContext?.today?.updated_at ?? null,
      FRESHNESS_THRESHOLDS.recoveryCheckin,
      now,
    ),
    nutrition: computeFreshness(
      (latestFoodLogResponse.data as { created_at: string } | null)?.created_at ?? null,
      FRESHNESS_THRESHOLDS.nutritionLog,
      now,
    ),
    training: computeFreshness(lastTrainingSessionAt, FRESHNESS_THRESHOLDS.training, now),
    setVision: computeFreshness(
      setVisionContext.latest?.analyzed_at ?? null,
      FRESHNESS_THRESHOLDS.setVision,
      now,
    ),
    bodyweight: computeFreshness(
      fitnessProfile?.updated_at ?? null,
      FRESHNESS_THRESHOLDS.bodyweight,
      now,
    ),
  };

  return {
    generatedAt: now.toISOString(),
    dataWindow: trainingContext.dataWindow,

    profile: {
      goal: fitnessProfile?.goal ?? null,
      experience: fitnessProfile?.experience ?? null,
      trainingFrequency: fitnessProfile?.training_days ?? null,
      priorityMuscles: fitnessProfile?.priority_muscles ?? [],
      heightCm: fitnessProfile?.height_cm ?? null,
      weightKg: fitnessProfile?.weight_kg ?? null,
      sessionDurationMinutes: fitnessProfile?.session_duration_minutes ?? null,
      availableEquipment: fitnessProfile?.available_equipment ?? [],
      physicalLimitations: fitnessProfile?.physical_limitations ?? null,
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
      sleepHours: recoveryContext?.today?.sleep_hours ?? null,
      stress: recoveryContext?.today?.stress ?? null,
      soreness: recoveryContext?.today?.soreness ?? null,
      fatigue: recoveryContext?.today?.fatigue ?? null,
      painFlag: recoveryContext?.today?.pain_illness === "yes",
      recoveryStatusCode: recoveryStatus,
    },

    nutrition: {
      available: nutritionContext.plan !== null,
      calorieTarget: nutritionContext.plan?.target.calories ?? null,
      proteinTargetGrams: nutritionContext.plan?.target.protein ?? null,
      carbsTargetGrams: nutritionContext.plan?.target.carbs ?? null,
      fatTargetGrams: nutritionContext.plan?.target.fat ?? null,
    },

    setVision: {
      available: setVisionContext.available,
      latestExercise: setVisionContext.latest?.exercise ?? null,
      analysesLast30Days: setVisionContext.analysesLast30Days,
      romConsistencyDeviation: setVisionContext.romConsistencyDeviation,
      tempoConsistencyDeviation: setVisionContext.tempoConsistencyDeviation,
    },

    wearable: {
      available: latestWearableDay !== null,
      isDemo: wearableBundle?.isDemo ?? false,
      providerLabel: wearableBundle?.providerLabel ?? null,
      latestDay: latestWearableDay,
    },

    derived: {
      baselineDeviations: {
        sleep: sleepDeviation,
        recoveryScore: recoveryScoreDeviation,
        trainingLoad: trainingLoadDeviation,
      },
      muscleRecoveryMap,
      overallConfidence,
      missingData,
    },

    dataFreshness,

    progress: {
      status: "not_yet_implemented",
    },
  };
}
