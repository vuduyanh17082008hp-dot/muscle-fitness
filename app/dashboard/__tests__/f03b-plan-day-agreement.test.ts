import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hero's Start form posts to a server action; rendering it needs only the reference.
vi.mock("@/app/dashboard/workouts/actions", () => ({ startWorkoutAction: vi.fn() }));

import { DailyActionHero } from "@/components/dashboard/daily-action-hero";
import { DanteDailyBrief } from "@/components/dashboard/dante-daily-brief";
import { buildDailyDecision, classifyTodaySession, trainingHold, type TodayWorkoutReads } from "@/lib/dante-core/daily-decision-engine";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { TodaySession } from "@/lib/training/load-today-session";
import { loadPlannedDay, loadPlannedDayRead, type PlannedDay } from "@/lib/training/planned-day";

/**
 * F-03B (Codex P1): a plan day scheduled for today has no workout_sessions row until it is started. The hero offered
 * "Start Workout" from the plan while the Daily Brief, which only saw session rows, said "No workout is scheduled for today."
 * Both now read the same TodayWorkoutReads; this renders the two components the dashboard renders, side by side.
 */
const state = {
  recovery: { painFlag: false, score: 80, status: "Good", trainingLoadState: "green", recoveryStatusCode: "good" },
  derived: { overallConfidence: 0.7, muscleRecoveryMap: [{ muscle: "chest", muscleLabel: "Chest", recoveryState: "well_recovered", score: 90, confidence: 0.8, drivers: [] }] },
} as unknown as AthleteState;
const context = { contributionsByExercise: new Map([["ex-1", [{ muscle: "chest", role: "primary", contribution: 1 }]]]) } as unknown as TrainingContext;
const session = (sessionState: string | null, skipped = false): TodaySession => ({
  id: "s-1", name: "Push A", scheduledFor: null, durationMinutes: 45, sessionState,
  exercises: [{ sessionExerciseId: "se-1", exerciseId: "ex-1", exerciseName: "Bench Press", targetSets: 4, repMin: 6, repMax: 8, restSeconds: 90, primaryMuscle: null, isSkipped: skipped }],
});
const SCHEDULED: PlannedDay = { kind: "SCHEDULED", dayId: "day-1", name: "Push A", exerciseCount: 5 };
const FLEXIBLE: PlannedDay = { kind: "FLEXIBLE", dayId: "day-2", name: "Pull B", exerciseCount: 4 };

function dashboard(todaySession: TodaySession | null, reads: TodayWorkoutReads) {
  const status = classifyTodaySession(todaySession, reads)
  const { decision, proposedActions } = buildDailyDecision(state, context, todaySession, reads)
  const text = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
  return {
    status,
    code: decision.decision.decisionCode,
    proposedActions,
    hero: text(createElement(DailyActionHero, { todaySession, sessionStatus: status, plannedDay: reads.plannedDay ?? null, hold: trainingHold(decision.decision) })),
    brief: text(createElement(DanteDailyBrief, { narrative: null, decision })),
  }
}

const NO_WORKOUT = /No workout is scheduled|No training session scheduled/
const START = /Start Workout/
const RESUME = /Resume Workout/

describe("F-03B: Daily Brief and Action Hero agree on today's workout", () => {
  it("scheduled plan day, no session: planned workout + Start in the hero, the same workout in the Brief (the P1)", () => {
    const d = dashboard(null, { plannedDay: SCHEDULED })
    expect(d.status).toBe("planned")
    expect(d.code).toBe("insufficient_data")
    expect(d.hero).toMatch(START)
    expect(d.hero).toMatch(/Today's Training Push A 5 exercises · not started yet/)
    expect(d.brief).toMatch(/Today's planned workout is Push A \(5 exercises\) — not started yet\./)
    expect(d.brief).not.toMatch(NO_WORKOUT)
    expect(d.proposedActions).toEqual([])
  })

  it("flexible plan, no session: both name the next day in the rotation", () => {
    const d = dashboard(null, { plannedDay: FLEXIBLE })
    expect(d.hero).toMatch(/Next In Your Plan Pull B/)
    expect(d.hero).toMatch(START)
    expect(d.brief).toMatch(/Next in your plan is Pull B \(4 exercises\)/)
    expect(d.brief).not.toMatch(NO_WORKOUT)
  })

  it("scheduled plan day with a not-started session: the session governs, Start in both", () => {
    for (const sessionState of [null, "not_started"]) {
      const d = dashboard(session(sessionState), { plannedDay: SCHEDULED })
      expect(d.status).toBe("planned")
      expect(d.code).toBe("proceed_as_planned")
      expect(d.hero).toMatch(START)
      expect(d.brief).toMatch(/Proceed with today's session as planned\./)
    }
  })

  it("in-progress or paused session: Resume in the hero, continue in the Brief, never Start", () => {
    for (const sessionState of ["in_progress", "paused"]) {
      const d = dashboard(session(sessionState), { plannedDay: SCHEDULED })
      expect(d.status).toBe("active")
      expect(d.hero).toMatch(RESUME)
      expect(d.hero).not.toMatch(START)
      expect(d.brief).toMatch(/Continue today's session in progress as planned\./)
    }
  })

  it("completed session: no pending action anywhere", () => {
    const d = dashboard(session("completed"), { plannedDay: SCHEDULED })
    expect(d.code).toBe("session_completed")
    expect(d.hero).toMatch(/Session Complete/)
    expect(d.hero).not.toMatch(/Start Workout|Resume Workout/)
    expect(d.brief).toMatch(/already done/)
  })

  it("cancelled or all-postponed session on a scheduled plan day: rest/postponed in both, no Start (the session row wins over the plan)", () => {
    for (const today of [session("cancelled"), session("not_started", true)]) {
      const d = dashboard(today, { plannedDay: SCHEDULED })
      expect(d.code).toBe("session_postponed")
      expect(d.hero).toMatch(/Session Postponed · Rest Day/)
      expect(d.hero).not.toMatch(/Start Workout|Resume Workout/)
      expect(d.brief).toMatch(/postponed — treat today as a rest day/)
    }
  })

  it("no plan day (no plan, or a rest weekday) and no session: no workout scheduled in both", () => {
    for (const plannedDay of [null, { kind: "REST" } as PlannedDay]) {
      const d = dashboard(null, { plannedDay })
      expect(d.status).toBe("none")
      expect(d.code).toBe("no_session_scheduled")
      expect(d.hero).toMatch(/No training session scheduled for today/)
      expect(d.hero).not.toMatch(START)
      expect(d.brief).toMatch(/No workout is scheduled for today\./)
    }
  })

  it("failed plan read with no session, or failed session read: unknown in both, never 'no workout' and never Start", () => {
    for (const reads of [{ plannedDay: null, planUnavailable: true }, { sessionUnavailable: true, plannedDay: SCHEDULED }, { sessionUnavailable: true, planUnavailable: true }]) {
      const d = dashboard(null, reads)
      expect(d.status).toBe("unknown")
      expect(d.code).toBe("session_state_unknown")
      expect(d.hero).toMatch(/Workout status unavailable/)
      expect(d.hero).not.toMatch(START)
      expect(d.brief).toMatch(/couldn't be loaded/)
      expect(d.brief).not.toMatch(NO_WORKOUT)
    }
  })

  it("conflicting records: a started session decides over a failed plan read; a not-started one vs a REST plan is held for review", () => {
    const failedPlan = dashboard(session("in_progress"), { plannedDay: null, planUnavailable: true })
    expect(failedPlan.status).toBe("active")
    expect(failedPlan.hero).toMatch(RESUME)
    // Final safety closure P1-B: this used to expect proceed_as_planned + Start.
    const restDayWithSession = dashboard(session("not_started"), { plannedDay: { kind: "REST" } })
    expect(restDayWithSession.status).toBe("conflict")
    expect(restDayWithSession.code).toBe("session_state_unknown")
    expect(restDayWithSession.hero).toMatch(/Workout schedule needs review/)
    expect(restDayWithSession.hero).not.toMatch(START)
    expect(restDayWithSession.brief).toMatch(/Workout schedule needs review/)
    expect(restDayWithSession.brief).not.toMatch(NO_WORKOUT)
  })

  it("pain/illness still overrides a plan day without a session", () => {
    const pained = { ...state, recovery: { ...state.recovery, painFlag: true } } as AthleteState
    expect(buildDailyDecision(pained, context, null, { plannedDay: SCHEDULED }).decision.decision.decisionCode).toBe("prioritize_recovery")
  })
})

describe("F-03B: loadPlannedDay never reports a failed read as 'no plan'", () => {
  // Minimal PostgREST-style builder: every chained call returns itself; awaiting it (or maybeSingle) yields the table's result.
  const client = (results: Record<string, { data: unknown; error: { message: string } | null }>) => ({
    from: (table: string) => {
      const result = results[table]
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain
      chain.maybeSingle = async () => result
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
      return chain
    },
  }) as never
  const days = { data: [{ id: "day-1", name: "Push A", day_order: 1, scheduled_weekday: null, rest_day: false, workout_exercises: [{ id: "we-1" }] }], error: null }
  const ok = { workout_plans: { data: { id: "plan-1" }, error: null }, workout_days: days, workout_sessions: { data: null, error: null } }
  const now = new Date("2026-10-27T04:00:00Z")

  it("no active plan is null; a plan with a day is that day", async () => {
    expect(await loadPlannedDay(client({ ...ok, workout_plans: { data: null, error: null } }), "u", now, "Asia/Singapore")).toBeNull()
    expect(await loadPlannedDay(client(ok), "u", now, "Asia/Singapore")).toMatchObject({ kind: "FLEXIBLE", dayId: "day-1" })
  })

  it("a plan, days or last-completed read error throws, and loadPlannedDayRead reports planUnavailable", async () => {
    const failure = { data: null, error: { message: "permission denied" } }
    for (const table of ["workout_plans", "workout_days", "workout_sessions"] as const) {
      const supabase = client({ ...ok, [table]: failure })
      await expect(loadPlannedDay(supabase, "u", now, "Asia/Singapore"), table).rejects.toThrow(/permission denied/)
      expect(await loadPlannedDayRead(supabase, "u", now, "Asia/Singapore"), table).toEqual({ plannedDay: null, planUnavailable: true })
    }
    expect(await loadPlannedDayRead(client(ok), "u", now, "Asia/Singapore")).toMatchObject({ planUnavailable: false, plannedDay: { dayId: "day-1" } })
  })
})
