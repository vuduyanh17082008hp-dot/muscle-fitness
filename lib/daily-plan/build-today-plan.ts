import type { TodaySession } from "@/lib/training/load-today-session";
import {
  sessionStateToActionStatus,
  type DailyAction,
} from "@/lib/daily-plan/types";

export type BuildTodayPlanInput = {
  todaySession: TodaySession | null;
  /** Recovery check-in row for today, if the user has already completed one — real presence check only, never fabricated. */
  hasCheckinToday: boolean;
  /** Null when the user has no nutrition target set — never defaulted to 0. */
  proteinTargetG: number | null;
  proteinLoggedG: number;
};

/**
 * Pure derivation — answers "what should I do today?" from data the
 * dashboard already loads (no extra Supabase round trips). Reused by
 * the Calendar's "today" row so the two surfaces never disagree about
 * what's on the plan.
 */
export function buildTodayPlan(input: BuildTodayPlanInput): DailyAction[] {
  const actions: DailyAction[] = [];

  actions.push({
    id: "checkin-today",
    type: "checkin",
    title: "Daily Check-in",
    subtitle: input.hasCheckinToday
      ? "Completed"
      : "Log sleep, stress, and readiness",
    status: input.hasCheckinToday ? "completed" : "planned",
    scheduledAt: null,
    priority: 1,
    actionUrl: "/dashboard/recovery",
    source: "recovery_checkins",
  });

  if (input.todaySession) {
    const activeExerciseCount = input.todaySession.exercises.filter(
      (exercise) => !exercise.isSkipped,
    ).length;
    const parts: string[] = [];

    if (activeExerciseCount > 0) {
      parts.push(
        `${activeExerciseCount} exercise${activeExerciseCount === 1 ? "" : "s"}`,
      );
    }

    if (input.todaySession.durationMinutes) {
      parts.push(`~${input.todaySession.durationMinutes} min`);
    }

    actions.push({
      id: `workout-${input.todaySession.id}`,
      type: "workout",
      title: input.todaySession.name ?? "Training session",
      subtitle: parts.length > 0 ? parts.join(" • ") : null,
      status: sessionStateToActionStatus(input.todaySession.sessionState),
      scheduledAt: input.todaySession.scheduledFor,
      priority: 2,
      actionUrl: `/dashboard/workouts/session/${input.todaySession.id}`,
      source: "workout_sessions",
      metadata: {
        exerciseCount: activeExerciseCount,
        durationMinutes: input.todaySession.durationMinutes,
      },
    });
  }

  if (input.proteinTargetG !== null) {
    const remaining = Math.max(
      0,
      Math.round(input.proteinTargetG - input.proteinLoggedG),
    );

    actions.push({
      id: "nutrition-protein-today",
      type: "nutrition",
      title: "Nutrition",
      subtitle:
        remaining > 0
          ? `${remaining} g protein remaining`
          : "Protein target reached",
      status: remaining > 0 ? "planned" : "completed",
      scheduledAt: null,
      priority: 3,
      actionUrl: "/dashboard/nutrition",
      source: "nutrition",
      metadata: {
        proteinTargetG: input.proteinTargetG,
        proteinRemainingG: remaining,
      },
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}
