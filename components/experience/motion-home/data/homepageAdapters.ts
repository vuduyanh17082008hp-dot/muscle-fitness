import "server-only";

import { createClient } from "@/lib/supabase/server";
import { loadTodaySession } from "@/lib/training/load-today-session";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import {
  FALLBACK_VIEW_MODEL,
  HOMEPAGE_ROUTES,
  type MotionHomepageViewModel,
  type MuscleViewModel,
  type NutritionViewModel,
  type RecoveryViewModel,
  type TrainingViewModel,
} from "@/components/experience/motion-home/data/homepageViewModel";

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  good: "Good",
  moderate: "Moderate",
  priority: "Priority",
};

/**
 * Builds the safe, presentation-only view model for the homepage (`/`).
 *
 * Never invokes Dante, never recomputes the recovery score (reads the
 * value `computeRecoveryScore` already wrote at check-in time — see
 * lib/recovery/score.ts), and never duplicates Adapt/training
 * algorithms. Every personalized read is independently wrapped so one
 * failing query degrades to the illustrative fallback instead of
 * breaking the page (spec: optional personalized request fails →
 * homepage still works).
 */
export async function getExperienceViewModel(): Promise<MotionHomepageViewModel> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return FALLBACK_VIEW_MODEL;
  }

  const [recovery, training, nutrition, muscle] = await Promise.all([
    loadRecoveryPreview(supabase, user.id),
    loadTrainingPreview(supabase, user.id),
    loadNutritionPreview(supabase, user.id),
    loadMusclePreview(supabase, user.id),
  ]);

  return {
    mode: "authenticated",
    training,
    recovery,
    nutrition,
    muscle,
    adapt: FALLBACK_VIEW_MODEL.adapt,
    dante: FALLBACK_VIEW_MODEL.dante,
    routes: HOMEPAGE_ROUTES,
  };
}

async function loadRecoveryPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<RecoveryViewModel> {
  try {
    const { data, error } = await supabase
      .from("recovery_checkins")
      .select("recovery_score, sleep_hours, checkin_date")
      .eq("user_id", userId)
      .order("checkin_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || typeof data.recovery_score !== "number") {
      return { ...FALLBACK_VIEW_MODEL.recovery, hasLiveScore: false };
    }

    const readiness = Math.min(100, Math.max(0, Math.round(data.recovery_score)));
    const status =
      readiness >= 80 ? "ready" : readiness >= 60 ? "good" : readiness >= 40 ? "moderate" : "priority";

    return {
      hasLiveScore: true,
      readiness,
      status: STATUS_LABEL[status] ?? "Ready",
      sleepHours: typeof data.sleep_hours === "number" ? data.sleep_hours : null,
    };
  } catch {
    return { ...FALLBACK_VIEW_MODEL.recovery, hasLiveScore: false };
  }
}

async function loadTrainingPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<TrainingViewModel> {
  try {
    const session = await loadTodaySession(supabase, userId);

    if (!session) {
      return { ...FALLBACK_VIEW_MODEL.training, hasLiveSession: false };
    }

    const firstExercise = session.exercises?.[0];
    const focus = firstExercise
      ? `${firstExercise.exerciseName} · ${firstExercise.targetSets ?? "-"} sets`
      : FALLBACK_VIEW_MODEL.training.focus;

    return {
      hasLiveSession: true,
      sessionName: session.name ?? FALLBACK_VIEW_MODEL.training.sessionName,
      focus,
      progressionNote: "Today's scheduled session",
    };
  } catch {
    return { ...FALLBACK_VIEW_MODEL.training, hasLiveSession: false };
  }
}

/** Same protein target/consumed source as /dashboard/nutrition — never recomputed here, only read. */
async function loadNutritionPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<NutritionViewModel> {
  try {
    const [nutritionContext, foodLog] = await Promise.all([
      loadNutritionContext(supabase, userId),
      loadFoodLogForDate(supabase, userId),
    ]);

    if (!nutritionContext.plan) {
      return { ...FALLBACK_VIEW_MODEL.nutrition, hasLiveTarget: false };
    }

    const target = nutritionContext.plan.target.protein;
    const consumed = Math.round(foodLog.totals.protein);
    const remaining = Math.max(0, Math.round(target - consumed));

    return {
      hasLiveTarget: true,
      proteinTargetG: target,
      proteinConsumedG: consumed,
      remainingLabel: `${remaining}g protein remaining`,
    };
  } catch {
    return { ...FALLBACK_VIEW_MODEL.nutrition, hasLiveTarget: false };
  }
}

/** Same Training Intelligence engine /dashboard/training-intelligence reads — the muscle with the most current-week effective sets, never recomputed or diagnosed here. */
async function loadMusclePreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<MuscleViewModel> {
  try {
    const athleteState = await buildAthleteState(supabase, userId);

    if (!athleteState.training.hasAnyLoggedData || athleteState.training.muscles.length === 0) {
      return { ...FALLBACK_VIEW_MODEL.muscle, hasLiveData: false };
    }

    const top = [...athleteState.training.muscles].sort(
      (a, b) => b.analytics.currentWeek.totalEffectiveSets - a.analytics.currentWeek.totalEffectiveSets,
    )[0];

    const changePercent = top.analytics.changePercent;
    const changeLabel =
      changePercent === null
        ? "New this week"
        : `${changePercent > 0 ? "+" : ""}${Math.round(changePercent)}% vs last week`;

    return {
      hasLiveData: true,
      focusMuscle: MUSCLE_DISPLAY_NAME[top.muscle] ?? top.muscle,
      weeklyEffectiveSets: Math.round(top.analytics.currentWeek.totalEffectiveSets),
      changeLabel,
    };
  } catch {
    return { ...FALLBACK_VIEW_MODEL.muscle, hasLiveData: false };
  }
}
