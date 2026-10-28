import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import type { AthleteState } from "@/lib/athlete-state/types";
import { buildDailyDecision, classifyTodaySession, trainingHold, type TodayWorkoutReads } from "@/lib/dante-core/daily-decision-engine";
import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";
import { loadTodaySessionRead, resolveUserTimeZone, type TodaySessionRead } from "@/lib/training/load-today-session";
import type { TrainingContext } from "@/lib/training/load-training-context";
import { loadPlannedDay, type PlannedDay } from "@/lib/training/planned-day";

/**
 * The dashboard's Daily Brief decision, from already-loaded reads. Every surface that offers or comments on today's training
 * (Today, Training, Recovery) goes through this one wiring of classifyTodaySession → buildDailyDecision → trainingHold, so a
 * pain/illness flag or an unreadable check-in holds all of them alike. `todaySessionRead: null` = the session read rejected.
 */
export function resolveDailyDecision(reads: {
  todaySessionRead: TodaySessionRead | null;
  plannedDay: PlannedDay | null;
  planUnavailable: boolean;
  athleteState: AthleteState | null;
  trainingContext: TrainingContext | null;
}) {
  const todaySession = reads.todaySessionRead?.status === "OK" ? reads.todaySessionRead.session : null;
  const workoutReads: TodayWorkoutReads = {
    sessionUnavailable: reads.todaySessionRead?.status !== "OK",
    plannedDay: reads.plannedDay,
    planUnavailable: reads.planUnavailable,
  };
  const todaySessionStatus = classifyTodaySession(todaySession, workoutReads);
  // Requires the Athlete State + Training Context; with either missing there is no decision, which trainingHold reads as "unverified".
  const dailyDecision =
    reads.athleteState && reads.trainingContext
      ? buildDailyDecision(reads.athleteState, reads.trainingContext, todaySession, workoutReads).decision
      : null;
  return { todaySession, workoutReads, todaySessionStatus, dailyDecision, hold: trainingHold(dailyDecision?.decision ?? null) };
}

/** Loads the reads the dashboard uses and resolves them the same way, for pages that don't already load them. */
export async function loadDailyDecision(supabase: SupabaseClient, userId: string, now: Date = new Date()) {
  const timeZone = await resolveUserTimeZone(supabase, userId);
  const [readiness, sessionRead, athleteState, plannedDay] = await Promise.allSettled([
    loadReadinessForUser(supabase, userId),
    loadTodaySessionRead(supabase, userId, now, timeZone),
    buildAthleteState(supabase, userId, { now }),
    loadPlannedDay(supabase, userId, now, timeZone),
  ]);
  const value = <T,>(result: PromiseSettledResult<T>) => (result.status === "fulfilled" ? result.value : null);
  return {
    ...resolveDailyDecision({
      todaySessionRead: value(sessionRead),
      plannedDay: value(plannedDay),
      planUnavailable: plannedDay.status === "rejected",
      athleteState: value(athleteState),
      trainingContext: value(readiness)?.trainingContext ?? null,
    }),
    plannedDay: value(plannedDay),
  };
}
