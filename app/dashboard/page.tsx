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


import { loadRecentWorkoutSessions } from "@/lib/dashboard/load-recent-workout-sessions";
import { loadWeeklyNutritionTotals } from "@/lib/dashboard/load-weekly-nutrition-totals";
import { buildMuscleIntelligence } from "@/lib/dashboard/muscle-intelligence";
import { buildRecentActivity } from "@/lib/dashboard/recent-activity";
import { buildProgressSnapshot } from "@/lib/dashboard/progress-snapshot";
import type { TraceableDecision } from "@/lib/dante-core/types";

import { DashboardHeader } from "@/components/dashboard/glass/dashboard-header";
import { DailyActionHero } from "@/components/dashboard/daily-action-hero";
import { loadPlannedDay } from "@/lib/training/planned-day";
import { AthleteStateStrip } from "@/components/dashboard/athlete-state-strip";
import { WhatMattersNow, type WhatMattersItem } from "@/components/dashboard/what-matters-now";
import { NutritionOpportunity } from "@/components/dashboard/nutrition-opportunity";
import { DanteDailyBrief } from "@/components/dashboard/dante-daily-brief";
import { NewUserDashboard } from "@/components/dashboard/new-user-dashboard";
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

function formatGreeting(now: Date, timeZone: string): string {
  try {
    const hourRaw = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = Number.parseInt(hourRaw, 10);
    if (!Number.isFinite(hour)) return "Hello";
    if (hour < 5) return "Good evening";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  } catch {
    return "Hello";
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

  if (!profile) {
    throw new Error("Unable to load profile.");
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
    plannedDayResult,
  ] = await Promise.allSettled([
    loadReadinessForUser(supabase, user.id),
    getOrBuildDailyIntelligence(supabase, user.id),
    loadNutritionContext(supabase, user.id),
    loadFoodLogForDate(supabase, user.id, localDate),
    loadTodaySession(supabase, user.id, now, timeZone),
    buildAthleteState(supabase, user.id, { now }),
    loadRecentWorkoutSessions(supabase, user.id, 5),
    loadWeeklyNutritionTotals(supabase, user.id, now, timeZone, 7),
    loadPlannedDay(supabase, user.id, now, timeZone),
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
  const plannedDay = unwrap(plannedDayResult, "loadPlannedDay");
  const athleteState: AthleteState | null = unwrap(athleteStateResult, "buildAthleteState");
  const recentWorkoutSessions = unwrap(recentWorkoutSessionsResult, "loadRecentWorkoutSessions") ?? [];
  const weeklyNutritionTotals = unwrap(weeklyNutritionTotalsResult, "loadWeeklyNutritionTotals") ?? [];

  const recoveryContext = readinessForUser?.recoveryContext ?? null;
  const trainingContext = readinessForUser?.trainingContext ?? null;
  const nutritionPlan = nutritionContext?.plan ?? null;
  const nutritionTargets = nutritionContext?.targets ?? null;

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

  if (athleteState && trainingContext) {
    dailyDecision = buildDailyDecision(athleteState, trainingContext, todaySession).decision;
  }





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
    proteinTargetG: nutritionTargets?.protein ?? null,
    currentWeightKg: athleteState?.profile.weightKg ?? null,
  });

  /* =======================================================
     STATE A VS STATE B DETECTION (Section 2, 45, 46)
     State A (New User / Insufficient Data):
     - onboarding not marked completed, OR
     - no today session AND no food log entries AND no recovery score AND no recent workouts
  ======================================================= */

  const hasOnboarded = Boolean(profile.onboarding_completed);
  const hasAnyActivityData =
    Boolean(todaySession) ||
    foodLog.entries.length > 0 ||
    recoveryContext?.todayScoreResult?.score !== null ||
    recentWorkoutSessions.length > 0;

  const isNewUser = !hasOnboarded && !hasAnyActivityData;

  /* =======================================================
     WHAT MATTERS NOW — Max 1-3 deterministic items
  ======================================================= */

  const whatMattersItems: WhatMattersItem[] = [];

  if (todaySession && todaySession.sessionState !== "completed") {
    whatMattersItems.push({
      id: "pending-session",
      title: "Today's workout is pending",
      subtitle: `${todaySession.name || "Scheduled Session"} (${todaySession.exercises.length} exercises)`,
      href: `/dashboard/workouts/session/${todaySession.id}`,
      urgency: "high",
    });
  }

  if (nutritionTargets?.protein) {
    const proteinRemaining = Math.max(0, nutritionTargets.protein - Math.round(foodLog.totals.protein));
    if (proteinRemaining > 0 && foodLog.totals.protein > 0) {
      whatMattersItems.push({
        id: "protein-gap",
        title: `${proteinRemaining}g protein remaining today`,
        subtitle: `Logged ${Math.round(foodLog.totals.protein)}g / ${nutritionTargets.protein}g target`,
        href: "/dashboard/nutrition",
        urgency: "normal",
      });
    }
  }

  if (!recoveryContext?.today) {
    whatMattersItems.push({
      id: "recovery-checkin",
      title: "Recovery check-in needed",
      subtitle: "Log your sleep, soreness and fatigue for tailored daily adaptation",
      href: "/dashboard/recovery",
      urgency: "normal",
    });
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <>
      <DashboardHeader
        displayName={displayName}
        todayLabel={formatTodayLabel(now, timeZone)}
        greeting={formatGreeting(now, timeZone)}
        avatarUrl={profile.avatar_url}
      />

      {isNewUser ? (
        <div className="mt-6">
          <NewUserDashboard
            displayName={displayName}
            hasProfileGoal={Boolean(athleteState?.profile.goal)}
            hasWorkoutPlan={Boolean(todaySession || trainingContext?.hasAnyLoggedData)}
            hasNutritionTarget={Boolean(nutritionTargets?.calories)}
          />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5 sm:mt-6 sm:gap-6">
          {/* 1. Daily Action Hero (Dominant Above-The-Fold Action) */}
          <DailyActionHero todaySession={todaySession} plannedDay={plannedDay} hasCheckinToday={Boolean(recoveryContext?.today)} />

          {/* 2. Athlete State Strip (Compact Horizontal Row) */}
          <AthleteStateStrip
            recoveryScore={recoveryContext?.todayScoreResult.score ?? null}
            recoveryStatus={recoveryContext?.todayScoreResult.status ?? null}
            caloriesConsumed={foodLog.totals.calories}
            caloriesTarget={nutritionTargets?.calories ?? null}
            proteinConsumed={foodLog.totals.protein}
            proteinTarget={nutritionTargets?.protein ?? null}
            weightKg={athleteState?.profile.weightKg ?? null}
          />

          {/* 3. What Matters Now (Max 1-3 deterministic priorities) */}
          <WhatMattersNow items={whatMattersItems} />

          {/* 4. Core Intelligence Grid: Nutrition Opportunity + Dante Daily Brief */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <NutritionOpportunity plan={nutritionPlan} totals={foodLog.totals} />
            <DanteDailyBrief narrative={dailyIntelligence?.narrative ?? null} decision={dailyDecision} />
          </div>

          {/* 5. Trajectory & Detailed Analytics (Below the Fold) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <MuscleIntelligenceCard
                entries={muscleIntelligenceEntries}
                error={athleteStateResult.status === "rejected"}
              />
            </div>

            <div className="flex flex-col gap-4 xl:col-span-5">
              <RecentActivityCard entries={recentActivityEntries} now={now} />
              <ProgressSnapshotCard snapshot={progressSnapshot} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
