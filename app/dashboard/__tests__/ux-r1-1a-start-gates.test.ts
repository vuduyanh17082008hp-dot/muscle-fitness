import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The Start forms post to a server action; rendering them needs only the reference.
vi.mock("@/app/dashboard/workouts/actions", () => ({ startWorkoutAction: vi.fn() }));

import { DailyActionHero } from "@/components/dashboard/daily-action-hero";
import { RecoveryScoreCard } from "@/components/recovery/recovery-score-card";
import { ScheduleConflictNote, TrainingHoldNotice, WorkoutStartButton } from "@/components/training/workout-start-control";
import { resolveDailyDecision } from "@/lib/dante-core/server/load-daily-decision";
import { trainingHeroAction } from "@/lib/dashboard/training-hero-action";
import { loadTodaySessionRead } from "@/lib/training/load-today-session";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { RecoveryScoreResult } from "@/lib/recovery/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { TodaySession } from "@/lib/training/load-today-session";
import type { PlannedDay } from "@/lib/training/planned-day";

/**
 * UX-R1.1A: Plan Detail and Session Detail (incl. direct links) obey the same Daily Brief hold as Today/Training; a failed
 * check-in read is never "no check-in"; a completed session reports logged sets, not the planned total.
 */
const baseState = {
  recovery: { painFlag: false, score: 80, status: "Good", trainingLoadState: "green", recoveryStatusCode: "good" },
  derived: { overallConfidence: 0.7, muscleRecoveryMap: [{ muscle: "chest", muscleLabel: "Chest", recoveryState: "well_recovered", score: 90, confidence: 0.8, drivers: [] }] },
} as unknown as AthleteState;
const withRecovery = (recovery: Partial<AthleteState["recovery"]>) => ({ ...baseState, recovery: { ...baseState.recovery, ...recovery } }) as AthleteState;
const PAIN = withRecovery({ painFlag: true });
const UNREADABLE = withRecovery({ painFlagUnavailable: true });
const context = { contributionsByExercise: new Map([["ex-1", [{ muscle: "chest", role: "primary", contribution: 1 }]]]) } as unknown as TrainingContext;
const exercise = (targetSets: number) => ({ sessionExerciseId: "se-1", exerciseId: "ex-1", exerciseName: "Bench Press", targetSets, repMin: 6, repMax: 8, restSeconds: 90, primaryMuscle: null, isSkipped: false });
const session = (sessionState: string | null, completedSets?: number | null): TodaySession => ({
  id: "s-1", name: "Full Body A", scheduledFor: null, durationMinutes: 5, sessionState,
  exercises: [exercise(9), { ...exercise(9), sessionExerciseId: "se-2" }],
  ...(completedSets === undefined ? {} : { completedSets }),
});
const SCHEDULED: PlannedDay = { kind: "SCHEDULED", dayId: "day-1", name: "Full Body A", exerciseCount: 6 };
const REST: PlannedDay = { kind: "REST" };

const text = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const decide = (todaySession: TodaySession | null, plannedDay: PlannedDay | null, state: AthleteState | null) =>
  resolveDailyDecision({ todaySessionRead: { status: "OK", session: todaySession }, plannedDay, planUnavailable: false, athleteState: state, trainingContext: context });

/** What Plan Detail renders for an active plan's workout day, given the decision (notice above the list + the day's control). */
const planDetail = (hold: ReturnType<typeof decide>["hold"]) =>
  `${hold ? text(createElement(TrainingHoldNotice, { hold })) : ""} ${text(createElement(WorkoutStartButton, { workoutDayId: "day-1", hold }))}`.trim();
/** What Session Detail renders for a not-started session (header control + notice under it). */
const sessionDetail = (hold: ReturnType<typeof decide>["hold"]) =>
  `${text(createElement(WorkoutStartButton, { workoutDayId: "day-1", hold, size: "lg" }))} ${hold ? text(createElement(TrainingHoldNotice, { hold, secondary: { label: "Review plan", href: "/dashboard/workouts/plans/p-1" } })) : ""}`.trim();

describe("Plan Detail + Session Detail obey the Daily Brief hold", () => {
  it("pain/illness: Plan Detail shows recovery guidance and no Start form for any day", () => {
    for (const [today, plannedDay] of [[null, SCHEDULED], [session("not_started"), SCHEDULED], [session("completed"), SCHEDULED]] as const) {
      const { hold } = decide(today, plannedDay, PAIN);
      expect(hold).toBe("recovery");
      const rendered = planDetail(hold);
      expect(rendered).not.toMatch(/Start workout/i);
      expect(rendered).toMatch(/Recovery First Today/);
      expect(rendered).toMatch(/Recovery guidance/);
      expect(rendered).toMatch(/On hold — recovery first/);
      expect(html(createElement(WorkoutStartButton, { workoutDayId: "day-1", hold }))).not.toMatch(/<form/);
    }
  });

  it("pain/illness: Session Detail (direct link) for a planned session — no Start, recovery guidance, the plan stays reachable", () => {
    const { hold } = decide(session("not_started"), SCHEDULED, PAIN);
    const rendered = sessionDetail(hold);
    expect(rendered).not.toMatch(/Start workout/i);
    expect(rendered).toMatch(/Your check-in flagged pain or illness/);
    expect(rendered).toMatch(/Recovery guidance Review plan/);
  });

  it("pain/illness with a session already in progress: the hold notice is shown (the logger itself has no Start/Resume CTA)", () => {
    const d = decide(session("in_progress"), SCHEDULED, PAIN);
    expect(d.todaySessionStatus).toBe("active");
    expect(text(createElement(TrainingHoldNotice, { hold: d.hold!, secondary: { label: "Review plan", href: "/p" } }))).toMatch(/Recovery First Today .* Recovery guidance Review plan/);
  });

  it("failed check-in read (unverified): both pages say check recovery, never Start", () => {
    for (const state of [UNREADABLE, null]) {
      const { hold } = decide(session("not_started"), SCHEDULED, state);
      expect(hold).toBe("unverified");
      for (const rendered of [planDetail(hold), sessionDetail(hold)]) {
        expect(rendered).not.toMatch(/Start workout/i);
        expect(rendered).toMatch(/Check Recovery First/);
        expect(rendered).toMatch(/couldn't be confirmed/);
        expect(rendered).toMatch(/On hold — check recovery/);
      }
    }
  });

  it("normal recovery: Start is offered on both pages as a real start_workout form", () => {
    const { hold } = decide(session("not_started"), SCHEDULED, baseState);
    expect(hold).toBeNull();
    expect(planDetail(hold)).toMatch(/^Start workout$/);
    expect(sessionDetail(hold)).toMatch(/^Start workout$/);
    const form = html(createElement(WorkoutStartButton, { workoutDayId: "day-1", hold }));
    expect(form).toMatch(/<form/);
    expect(form).toMatch(/name="workout_day_id" value="day-1"/);
  });

  it("REST-plan/session conflict: no hold, so the session keeps its Start, under the 'needs review' note (Today still offers no Start)", () => {
    const d = decide(session("not_started"), REST, baseState);
    expect(d.todaySessionStatus).toBe("conflict");
    expect(d.hold).toBeNull();
    expect(text(createElement(ScheduleConflictNote))).toMatch(/Workout schedule needs review — your plan has today as a rest day/);
    expect(sessionDetail(d.hold)).toMatch(/Start workout/);
    const today = text(createElement(DailyActionHero, { todaySession: d.todaySession, sessionStatus: d.todaySessionStatus, plannedDay: REST, hold: d.hold }));
    expect(today).not.toMatch(/Start Workout/);
  });

  it("direct links: both pages load the decision themselves and route every Start through the gated control", () => {
    const read = (p: string) => readFileSync(path.resolve(__dirname, "../../..", p), "utf8");
    const sessionPage = read("app/dashboard/workouts/session/[sessionId]/page.tsx");
    const planPage = read("app/dashboard/workouts/plans/[planId]/page.tsx");
    for (const page of [sessionPage, planPage]) {
      expect(page).toMatch(/await loadDailyDecision\(supabase, user\.id\)/);
      expect(page).not.toMatch(/action=\{startWorkoutAction\}/); // no ungated Start form left on either page
      expect(page).toMatch(/<WorkoutStartButton[^>]*hold=\{hold\}/);
    }
    // the in-progress logger renders the hold notice before the player
    expect(sessionPage.indexOf("{holdNotice ? <div className=\"mt-8\">{holdNotice}</div> : null}")).toBeLessThan(sessionPage.indexOf("<WorkoutPlayer"));
    expect(sessionPage.indexOf("{holdNotice ? <div className=\"mt-8\">{holdNotice}</div> : null}")).toBeGreaterThan(0);
  });
});

describe("Completed / in-progress sessions report logged sets, not the plan's total", () => {
  const hero = (s: TodaySession) => {
    const d = decide(s, SCHEDULED, baseState);
    return text(createElement(DailyActionHero, { todaySession: d.todaySession, sessionStatus: d.todaySessionStatus, plannedDay: SCHEDULED, hold: d.hold }));
  };

  it("partial (2 of 18), full (18 of 18) and empty (0 of 18) completed workouts", () => {
    expect(hero(session("completed", 2))).toMatch(/Session Complete Full Body A 2 exercises · 2 of 18 sets logged/);
    expect(hero(session("completed", 18))).toMatch(/18 of 18 sets logged/);
    expect(hero(session("completed", 0))).toMatch(/0 of 18 sets logged/);
    for (const n of [0, 2, 18]) expect(hero(session("completed", n))).not.toMatch(/Start Workout|18 working sets/);
  });

  it("unknown logged count is never presented as done; a not-started session shows the plan's sets as planned", () => {
    expect(hero(session("completed", null))).toMatch(/18 sets planned/);
    expect(hero(session("completed"))).toMatch(/18 sets planned/);
    expect(hero(session("in_progress", 5))).toMatch(/5 of 18 sets logged/);
    expect(hero(session("not_started", 0))).toMatch(/18 sets planned/);
  });

  it("completed session: Training offers Review, not Start", () => {
    const d = decide(session("completed", 2), SCHEDULED, baseState);
    const action = trainingHeroAction({ status: d.todaySessionStatus, hold: d.hold, sessionId: "s-1", activePlanId: "p-1", restDay: false, buildPlanHref: "/x" });
    expect(action.label).toBe("Review session");
  });

  it("loadTodaySessionRead counts completed exercise_sets; a failed count read is null (unknown), not 0 or the plan total", async () => {
    const client = (setsResult: { count: number | null; error: { message: string } | null } | "throws") => ({
      from(table: string) {
        if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Asia/Singapore" }, error: null }) }) }) };
        if (table === "workout_sessions") {
          const q: Record<string, unknown> = {};
          for (const m of ["select", "eq", "gte", "lte", "order"]) q[m] = () => q;
          q.limit = async () => ({ data: [{ id: "s-1", name: "Full Body A", scheduled_for: "2026-10-27T05:00:00Z", duration_minutes: 5, session_state: "completed", workout_plan_id: null }], error: null });
          return q;
        }
        if (table === "workout_session_exercises") {
          return { select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "se-1", exercise_id: "ex-1", display_name: "Bench", target_sets: 9, target_rep_min: 6, target_rep_max: 8, rest_seconds: 90, is_skipped: false }, { id: "se-2", exercise_id: "ex-1", display_name: "Bench", target_sets: 9, target_rep_min: 6, target_rep_max: 8, rest_seconds: 90, is_skipped: false }], error: null }) }) }) };
        }
        if (table === "exercise_library") return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
        if (table === "exercise_sets") {
          if (setsResult === "throws") throw new Error("no such table in fake");
          return { select: () => ({ in: () => ({ eq: async () => setsResult }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    }) as unknown as Parameters<typeof loadTodaySessionRead>[0];
    const now = new Date("2026-10-27T06:00:00Z");
    const ok = await loadTodaySessionRead(client({ count: 2, error: null }), "u-1", now, "Asia/Singapore");
    expect(ok.status === "OK" && ok.session?.completedSets).toBe(2);
    const failed = await loadTodaySessionRead(client({ count: null, error: { message: "permission denied" } }), "u-1", now, "Asia/Singapore");
    expect(failed.status === "OK" && failed.session?.completedSets).toBeNull();
    const threw = await loadTodaySessionRead(client("throws"), "u-1", now, "Asia/Singapore");
    expect(threw.status === "OK" && threw.session?.completedSets).toBeNull();
  });
});

describe("Recovery: a failed check-in read is not 'no check-in'", () => {
  const empty: RecoveryScoreResult = { score: null, status: null, drivers: [], missingInputs: [], baseline: null } as unknown as RecoveryScoreResult;
  it("failed read → 'couldn't be loaded', no score, no clearance; confirmed absence → 'No check-in recorded today'", () => {
    const failed = text(createElement(RecoveryScoreCard, { result: empty, recommendation: "x", checkinUnavailable: true }));
    expect(failed).toMatch(/Recovery check-in couldn't be loaded/);
    expect(failed).toMatch(/won't recommend a training session/);
    expect(failed).not.toMatch(/No check-in recorded today|No check-in yet today/);
    const absent = text(createElement(RecoveryScoreCard, { result: empty, recommendation: "x" }));
    expect(absent).toMatch(/No check-in recorded today/);
    expect(absent).not.toMatch(/couldn't be loaded/);
  });

  it("the failed read still holds training (unverified) everywhere the decision is used", () => {
    const d = decide(session("not_started"), SCHEDULED, UNREADABLE);
    expect(d.hold).toBe("unverified");
    expect(text(createElement(DailyActionHero, { todaySession: d.todaySession, sessionStatus: d.todaySessionStatus, plannedDay: SCHEDULED, hold: d.hold }))).not.toMatch(/Start Workout/);
  });
});
