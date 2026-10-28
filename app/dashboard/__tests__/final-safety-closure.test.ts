import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hero's Start form posts to a server action; rendering it needs only the reference.
vi.mock("@/app/dashboard/workouts/actions", () => ({ startWorkoutAction: vi.fn() }));

import { DailyActionHero } from "@/components/dashboard/daily-action-hero";
import { DanteDailyBrief } from "@/components/dashboard/dante-daily-brief";
import { buildDailyDecision, classifyTodaySession, trainingHold, type TodayWorkoutReads } from "@/lib/dante-core/daily-decision-engine";
import { todayWorkoutItem } from "@/lib/dashboard/today-workout-item";
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { TodaySession } from "@/lib/training/load-today-session";
import type { PlannedDay } from "@/lib/training/planned-day";

/**
 * Final safety closure (Codex P1-A, P1-B), on the components the dashboard renders:
 *   P1-A: a pain/illness flag made the Brief say prioritize_recovery while the hero still offered Start/Resume.
 *   P1-B: a not-started session on a plan REST day was recommended as Start / proceed_as_planned.
 * `pain: null` = no decision at all (its inputs failed), as when buildAthleteState rejects on the dashboard.
 */
const baseState = {
  recovery: { painFlag: false, score: 80, status: "Good", trainingLoadState: "green", recoveryStatusCode: "good" },
  derived: { overallConfidence: 0.7, muscleRecoveryMap: [{ muscle: "chest", muscleLabel: "Chest", recoveryState: "well_recovered", score: 90, confidence: 0.8, drivers: [] }] },
} as unknown as AthleteState;
const withRecovery = (recovery: Partial<AthleteState["recovery"]>) => ({ ...baseState, recovery: { ...baseState.recovery, ...recovery } }) as AthleteState;
const context = { contributionsByExercise: new Map([["ex-1", [{ muscle: "chest", role: "primary", contribution: 1 }]]]) } as unknown as TrainingContext;
const session = (sessionState: string | null): TodaySession => ({
  id: "s-1", name: "Push A", scheduledFor: null, durationMinutes: 45, sessionState,
  exercises: [{ sessionExerciseId: "se-1", exerciseId: "ex-1", exerciseName: "Bench Press", targetSets: 4, repMin: 6, repMax: 8, restSeconds: 90, primaryMuscle: null, isSkipped: false }],
});
const SCHEDULED: PlannedDay = { kind: "SCHEDULED", dayId: "day-1", name: "Push A", exerciseCount: 5 };
const REST: PlannedDay = { kind: "REST" };

function dashboard(todaySession: TodaySession | null, reads: TodayWorkoutReads, state: AthleteState | null = baseState) {
  const status = classifyTodaySession(todaySession, reads);
  const built = state ? buildDailyDecision(state, context, todaySession, reads) : null;
  const decision = built?.decision ?? null;
  const hold = trainingHold(decision?.decision ?? null);
  const text = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  return {
    status,
    hold,
    code: decision?.decision.decisionCode ?? null,
    actions: built?.proposedActions.map((a) => a.payload.type) ?? [],
    item: todayWorkoutItem(todaySession, status, hold),
    hero: text(createElement(DailyActionHero, { todaySession, sessionStatus: status, plannedDay: reads.plannedDay ?? null, hold })),
    brief: text(createElement(DanteDailyBrief, { narrative: "Great day to train hard!", decision })),
  };
}

const TRAIN_CTA = /Start Workout|Resume Workout/;
const PAIN = withRecovery({ painFlag: true });

describe("P1-A: a pain/illness override governs the hero, What matters and the Brief", () => {
  it("scheduled plan day, pain flag: no Start; recovery guidance and the plan stay reachable; the Brief prioritizes recovery", () => {
    const d = dashboard(null, { plannedDay: SCHEDULED }, PAIN);
    expect(d.code).toBe("prioritize_recovery");
    expect(d.hold).toBe("recovery");
    expect(d.actions).toEqual(["recovery_action"]);
    expect(d.hero).not.toMatch(TRAIN_CTA);
    expect(d.hero).toMatch(/Recovery First Today Push A · on hold/);
    expect(d.hero).toMatch(/isn't cancelled/);
    expect(d.hero).toMatch(/Recovery Guidance.*Review Plan/);
    expect(d.brief).toMatch(/Prioritize recovery today — a recent check-in flagged pain or illness\./);
    expect(d.item).toMatchObject({ id: "training-hold", title: "Recovery first today", href: "/dashboard/recovery" });
  });

  it("not-started, in-progress and paused sessions with a pain/illness flag: never Start or Resume; the session stays viewable", () => {
    for (const sessionState of ["not_started", "in_progress", "paused"]) {
      const d = dashboard(session(sessionState), { plannedDay: SCHEDULED }, PAIN);
      expect(d.code).toBe("prioritize_recovery");
      expect(d.hero).not.toMatch(TRAIN_CTA);
      expect(d.hero).toMatch(/View Session/);
      expect(d.hero).toMatch(/Recovery Guidance/);
      expect(d.brief).toMatch(/Prioritize recovery/);
      expect(d.item?.id).toBe("training-hold");
    }
  });

  it("completed session or no workout with a pain flag: no training prompt anywhere, the Brief still prioritizes recovery", () => {
    for (const [today, reads] of [[session("completed"), { plannedDay: SCHEDULED }], [null, { plannedDay: null }], [null, { plannedDay: REST }]] as const) {
      const d = dashboard(today, reads, PAIN);
      expect(d.code).toBe("prioritize_recovery");
      expect(d.hero).not.toMatch(TRAIN_CTA);
      expect(d.item).toBeNull();
      expect(d.brief).toMatch(/Prioritize recovery/);
    }
    expect(dashboard(session("completed"), { plannedDay: SCHEDULED }, PAIN).hero).toMatch(/Session Complete/);
  });

  it("override cleared: normal Start/Resume behaviour and pending-workout prompts come back", () => {
    const planned = dashboard(null, { plannedDay: SCHEDULED });
    expect(planned.hold).toBeNull();
    expect(planned.hero).toMatch(/Start Workout/);
    const pending = dashboard(session("not_started"), { plannedDay: SCHEDULED });
    expect(pending.code).toBe("proceed_as_planned");
    expect(pending.hero).toMatch(/Start Workout/);
    expect(pending.item?.id).toBe("pending-session");
    for (const sessionState of ["in_progress", "paused"]) {
      const active = dashboard(session(sessionState), { plannedDay: SCHEDULED });
      expect(active.hero).toMatch(/Resume Workout/);
      expect(active.brief).toMatch(/Continue today's session in progress/);
      expect(active.item?.title).toBe("Today's workout is in progress");
    }
  });

  it("unreadable check-in (painFlagUnavailable): no clearance invented — no Start/Resume, the Brief says it couldn't be loaded", () => {
    for (const today of [null, session("not_started"), session("in_progress")]) {
      const d = dashboard(today, { plannedDay: SCHEDULED }, withRecovery({ painFlagUnavailable: true }));
      expect(d.code).toBe("safety_state_unknown");
      expect(d.hold).toBe("unverified");
      expect(d.actions).toEqual([]);
      expect(d.hero).not.toMatch(TRAIN_CTA);
      expect(d.hero).toMatch(/Check Recovery First/);
      expect(d.brief).toMatch(/recovery check-in couldn't be loaded/);
      expect(d.item?.title).toBe("Check recovery before training");
    }
  });

  it("no decision at all (athlete state failed): the hero holds and the Brief never voices the cached narrative as clearance", () => {
    const d = dashboard(session("not_started"), { plannedDay: SCHEDULED }, null);
    expect(d.hold).toBe("unverified");
    expect(d.hero).not.toMatch(TRAIN_CTA);
    expect(d.brief).toMatch(/training decision couldn't be loaded/);
    expect(d.brief).not.toMatch(/Great day to train hard/);
  });

  it("loadRecoveryContext marks a failed recovery_checkins read instead of returning 'no check-in'", async () => {
    const client = (error: { message: string } | null) => ({
      from(table: string) {
        if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Asia/Singapore" } }) }) }) };
        const query: Record<string, unknown> = {};
        for (const m of ["select", "eq", "gte", "lte", "order"]) query[m] = () => query;
        query.limit = async () => ({ data: table === "recovery_checkins" && error ? null : [], error: table === "recovery_checkins" ? error : null });
        return query;
      },
    }) as unknown as Parameters<typeof loadRecoveryContext>[0];
    const failed = await loadRecoveryContext(client({ message: "permission denied for table recovery_checkins" }), "u-1");
    expect(failed.checkinsUnavailable).toBe(true);
    expect(failed.today).toBeNull();
    expect((await loadRecoveryContext(client(null), "u-1")).checkinsUnavailable).toBeUndefined();
  });
});

describe("P1-B: a REST plan day vs a session row", () => {
  it("REST plan + not-started session: conflicting records — 'Workout schedule needs review', no Start, no proceed_as_planned", () => {
    for (const sessionState of ["not_started", null]) {
      const d = dashboard(session(sessionState), { plannedDay: REST });
      expect(d.status).toBe("conflict");
      expect(d.code).toBe("session_state_unknown");
      expect(d.code).not.toBe("proceed_as_planned");
      expect(d.actions).toEqual([]);
      expect(d.hero).toMatch(/Workout schedule needs review/);
      expect(d.hero).toMatch(/Review Schedule.*View Session/);
      expect(d.hero).not.toMatch(TRAIN_CTA);
      expect(d.brief).toMatch(/Workout schedule needs review — your plan has today as a rest day/);
      expect(d.brief).not.toMatch(/Proceed with today's session/);
      expect(d.item).toBeNull();
    }
  });

  it("REST plan + a session the user already acted on: in-progress resumes, completed is done, cancelled is postponed", () => {
    const active = dashboard(session("in_progress"), { plannedDay: REST });
    expect(active.status).toBe("active");
    expect(active.hero).toMatch(/Resume Workout/);
    expect(active.brief).toMatch(/Continue today's session in progress/);
    const done = dashboard(session("completed"), { plannedDay: REST });
    expect(done.code).toBe("session_completed");
    expect(done.hero).not.toMatch(TRAIN_CTA);
    const cancelled = dashboard(session("cancelled"), { plannedDay: REST });
    expect(cancelled.code).toBe("session_postponed");
    expect(cancelled.hero).toMatch(/Session Postponed · Rest Day/);
    expect(cancelled.hero).not.toMatch(TRAIN_CTA);
  });

  it("no authorized-reschedule record exists in the domain model: a not-started session only governs when the plan doesn't say REST", () => {
    for (const plannedDay of [SCHEDULED, null]) {
      const d = dashboard(session("not_started"), { plannedDay });
      expect(d.status).toBe("planned");
      expect(d.code).toBe("proceed_as_planned");
      expect(d.hero).toMatch(/Start Workout/);
    }
  });

  it("failed plan read: a not-started session can't be checked against the plan — unknown in both; a started one still resumes", () => {
    const d = dashboard(session("not_started"), { plannedDay: null, planUnavailable: true });
    expect(d.status).toBe("unknown");
    expect(d.code).toBe("session_state_unknown");
    expect(d.hero).toMatch(/Workout status unavailable/);
    expect(d.hero).not.toMatch(TRAIN_CTA);
    expect(d.brief).toMatch(/couldn't be confirmed/);
    expect(dashboard(session("in_progress"), { plannedDay: null, planUnavailable: true }).hero).toMatch(/Resume Workout/);
  });

  it("REST plan and no session: a plain rest day in both", () => {
    const d = dashboard(null, { plannedDay: REST });
    expect(d.status).toBe("none");
    expect(d.code).toBe("no_session_scheduled");
    expect(d.hero).toMatch(/Scheduled Rest Day/);
    expect(d.hero).not.toMatch(TRAIN_CTA);
  });

  it("pain/illness still wins over a REST-plan conflict", () => {
    const d = dashboard(session("not_started"), { plannedDay: REST }, PAIN);
    expect(d.code).toBe("prioritize_recovery");
    expect(d.hero).toMatch(/Recovery First Today/);
    expect(d.hero).not.toMatch(TRAIN_CTA);
    expect(d.item?.id).toBe("training-hold");
  });
});
