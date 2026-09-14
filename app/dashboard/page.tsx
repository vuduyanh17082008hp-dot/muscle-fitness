import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { computeDailyTotals } from "@/lib/nutrition/food-log/totals";
import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";
import { getOrBuildDailyIntelligence, type DailyIntelligence } from "@/lib/dante-core/daily-intelligence";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import type { AthleteState } from "@/lib/athlete-state/types";
import { loadTodaySession, localDateTimeParts } from "@/lib/training/load-today-session";
import { buildDailyDecision, type DailyDecision } from "@/lib/dante-core/daily-decision-engine";
import { buildTodayPlan } from "@/lib/daily-plan/build-today-plan";
import { buildAdaptiveProgram } from "@/lib/dante-core/adaptive-program-engine";
import { loadRecentWorkoutSessions } from "@/lib/dashboard/load-recent-workout-sessions";
import { loadWeeklyNutritionTotals } from "@/lib/dashboard/load-weekly-nutrition-totals";
import { buildMuscleIntelligence } from "@/lib/dashboard/muscle-intelligence";
import { buildRecentActivity } from "@/lib/dashboard/recent-activity";
import { buildProgressSnapshot } from "@/lib/dashboard/progress-snapshot";
import type { TraceableDecision } from "@/lib/dante-core/types";

import { DashboardHeader } from "@/components/dashboard/glass/dashboard-header";
import { TodaysPlanCard } from "@/components/dashboard/glass/todays-plan-card";
import { ReadinessCard } from "@/components/dashboard/glass/readiness-card";
import { NutritionCard } from "@/components/dashboard/glass/nutrition-card";
import { DanteCard } from "@/components/dashboard/glass/dante-card";
import { MuscleIntelligenceCard } from "@/components/dashboard/glass/muscle-intelligence-card";
import { RecentActivityCard } from "@/components/dashboard/glass/recent-activity-card";
import { ProgressSnapshotCard } from "@/components/dashboard/glass/progress-snapshot-card";

export const dynamic = "force-dynamic";

/* =========================================================
   HELPERS
========================================================= */

function formatTodayLabel(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).formatToParts(now);

    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";

    return [weekday, `${day} ${month}`].filter(Boolean).join(", ");
  } catch {
    return now.toDateString();
  }
}

function unwrap<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.warn(`[DASHBOARD] ${label} failed:`, result.reason);
  return null;
}

/* =========================================================
   DASHBOARD PAGE — Performance Glass
========================================================= */

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar_url, timezone, onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load profile: ${profileError.message}`);
  }

  if (!profile || !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const timeZone = profile.timezone || "UTC";
  const now = new Date();
  const { localDate } = localDateTimeParts(now, timeZone);

  /* =======================================================
     DOMAIN LOADS — Promise.allSettled so one domain failing
     (e.g. Nutrition) never breaks the rest of the Dashboard
     (spec: "Partial Failures" — domain isolation).
  ======================================================= */

  const [
    readinessForUserResult,
    dailyIntelligenceResult,
    nutritionContextResult,
    foodLogResult,
    todaySessionResult,
    athleteStateResult,
    recentWorkoutSessionsResult,
    weeklyNutritionTotalsResult,
  ] = await Promise.allSettled([
    loadReadinessForUser(supabase, user.id),
    getOrBuildDailyIntelligence(supabase, user.id),
    loadNutritionContext(supabase, user.id),
    loadFoodLogForDate(supabase, user.id, localDate),
    loadTodaySession(supabase, user.id, now, timeZone),
    buildAthleteState(supabase, user.id, { now }),
    loadRecentWorkoutSessions(supabase, user.id, 5),
    loadWeeklyNutritionTotals(supabase, user.id, now, timeZone, 7),
  ]);

  const readinessForUser = unwrap(readinessForUserResult, "loadReadinessForUser");
  const dailyIntelligence: DailyIntelligence | null = unwrap(dailyIntelligenceResult, "getOrBuildDailyIntelligence");
  const nutritionContext = unwrap(nutritionContextResult, "loadNutritionContext");
  const foodLog = unwrap(foodLogResult, "loadFoodLogForDate") ?? {
    date: localDate,
    entries: [],
    totals: computeDailyTotals([]),
  };
  const todaySession = unwrap(todaySessionResult, "loadTodaySession");
  const athleteState: AthleteState | null = unwrap(athleteStateResult, "buildAthleteState");
  const recentWorkoutSessions = unwrap(recentWorkoutSessionsResult, "loadRecentWorkoutSessions") ?? [];
  const weeklyNutritionTotals = unwrap(weeklyNutritionTotalsResult, "loadWeeklyNutritionTotals") ?? [];

  const recoveryContext = readinessForUser?.recoveryContext ?? null;
  const trainingContext = readinessForUser?.trainingContext ?? null;
  const nutritionPlan = nutritionContext?.plan ?? null;

  /* =======================================================
     DISPLAY NAME / GREETING
  ======================================================= */

  const displayName =
    profile.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Athlete";

  /* =======================================================
     DANTE — Daily Decision Engine. Requires the Athlete State
     + Training Context; degrades to "unavailable" rather than
     guessing when either failed to load.
  ======================================================= */

  let dailyDecision: TraceableDecision<DailyDecision> | null = null;
  let proposedActions: ReturnType<typeof buildDailyDecision>["proposedActions"] = [];

  if (athleteState && trainingContext) {
    const result = buildDailyDecision(athleteState, trainingContext, todaySession);
    dailyDecision = result.decision;
    proposedActions = result.proposedActions;
  }

  const programAdaptations =
    athleteState && trainingContext ? buildAdaptiveProgram(athleteState, trainingContext) : [];

  const todaySessionExerciseIds = new Set(todaySession?.exercises.map((exercise) => exercise.exerciseId) ?? []);

  const readyToProgressCount = programAdaptations.filter(
    (adaptation) =>
      adaptation.decision.action === "INCREASE_LOAD" && todaySessionExerciseIds.has(adaptation.decision.exerciseId),
  ).length;

  /* =======================================================
     TODAY'S PLAN
  ======================================================= */

  const todayPlanActions = buildTodayPlan({
    todaySession,
    hasCheckinToday: Boolean(recoveryContext?.today),
    proteinTargetG: nutritionPlan?.target.protein ?? null,
    proteinLoggedG: foodLog.totals.protein,
    adaptive:
      todaySession && dailyDecision
        ? {
            dailyDecisionCode: dailyDecision.decision.decisionCode,
            dailyDecisionRecommendation: dailyDecision.recommendation,
            recoveryStatusLabel: athleteState?.recovery.status ?? null,
            readyToProgressCount,
          }
        : undefined,
  });

  /* =======================================================
     PROGRESS SNAPSHOT / MUSCLE INTELLIGENCE / RECENT ACTIVITY
     — pure view-model builders over data already loaded above.
  ======================================================= */

  const sessionsLast7Days = recoveryContext?.trainingLoad.sessionsLast7Days ?? 0;
  const trainingDaysTarget = athleteState?.profile.trainingFrequency ?? null;

  const muscleIntelligenceEntries = athleteState ? buildMuscleIntelligence(athleteState) : [];

  const recentActivityEntries = buildRecentActivity({
    recentWorkoutSessions,
    recoveryTrend: recoveryContext?.trend30Days ?? [],
    weeklyNutritionTotals,
    todayLocalDate: localDate,
  });

  const progressSnapshot = buildProgressSnapshot({
    sessionsCompletedLast7Days: sessionsLast7Days,
    trainingDaysTarget,
    recoveryTrend30Days: recoveryContext?.trend30Days ?? [],
    recoveryScoreToday: recoveryContext?.todayScoreResult.score ?? null,
    recoverySevenDayAverage: recoveryContext?.averages7Days.score ?? null,
    weeklyNutritionTotals,
    proteinTargetG: nutritionPlan?.target.protein ?? null,
    currentWeightKg: athleteState?.profile.weightKg ?? null,
  });

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    // DashboardShell already provides the page's <main> landmark plus a
    // max-w-[1600px] mx-auto padded wrapper — this used to duplicate both
    // (a second nested <main> and a second max-width+padding container),
    // which doubled the horizontal inset and starved the grid below of
    // width. This is a plain content fragment now, nothing more.
    <>
      <DashboardHeader
          displayName={displayName}
          todayLabel={formatTodayLabel(now, timeZone)}
          avatarUrl={profile.avatar_url}
        />

        {/* =================================================
            ONE canonical Bento grid — 12 columns at xl (>=1280px).
            Top row: Today's Plan / Readiness / Nutrition / Dante,
            each col-span-3 (sums to 12 — no wrap, no dead columns).
            Lower row: Muscle Intelligence (7) + a Recent Activity /
            Progress Snapshot stack (5). Mobile order puts Dante
            ahead of Nutrition (spec); md/xl restore Nutrition-then-
            Dante to match the approved reference composition.
        ================================================= */}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-12">
          <div className="order-1 xl:col-span-3">
            <TodaysPlanCard todaySession={todaySession} actions={todayPlanActions} timeZone={timeZone} />
          </div>

          <div className="order-2 xl:col-span-3">
            <ReadinessCard
              scoreResult={
                recoveryContext?.todayScoreResult ?? {
                  score: null,
                  status: null,
                  drivers: [],
                  missingInputs: [],
                  baseline: null,
                }
              }
              todayCheckin={recoveryContext?.today ?? null}
              error={readinessForUserResult.status === "rejected"}
            />
          </div>

          <div className="order-3 md:order-4 xl:col-span-3">
            <DanteCard decision={dailyDecision} narrative={dailyIntelligence?.narrative ?? null} />
          </div>

          <div className="order-4 md:order-3 xl:col-span-3">
            <NutritionCard
              target={nutritionPlan?.target ?? null}
              totals={foodLog.totals}
              error={nutritionContextResult.status === "rejected" || foodLogResult.status === "rejected"}
            />
          </div>

          <div className="order-5 md:col-span-2 xl:col-span-7">
            <MuscleIntelligenceCard
              entries={muscleIntelligenceEntries}
              error={athleteStateResult.status === "rejected"}
            />
          </div>

          <div className="order-6 flex flex-col gap-3 sm:gap-4 md:col-span-2 xl:col-span-5">
            <RecentActivityCard entries={recentActivityEntries} now={now} />
            <ProgressSnapshotCard snapshot={progressSnapshot} />
          </div>
        </div>
    </>
  );
}
