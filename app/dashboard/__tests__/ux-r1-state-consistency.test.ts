import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hero's Start form posts to a server action; rendering it needs only the reference.
vi.mock("@/app/dashboard/workouts/actions", () => ({ startWorkoutAction: vi.fn() }));

import { DailyActionHero } from "@/components/dashboard/daily-action-hero";
import { WhatMattersNow } from "@/components/dashboard/what-matters-now";
import { TrainingRecoveryCard } from "@/components/recovery/training-recovery-card";
import { resolveDailyDecision } from "@/lib/dante-core/server/load-daily-decision";
import { todayWorkoutItem } from "@/lib/dashboard/today-workout-item";
import { trainingHeroAction } from "@/lib/dashboard/training-hero-action";
import { buildRecoveryRecommendation } from "@/lib/recovery/recommendation";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { RecoveryScoreResult, TrainingLoadSummary } from "@/lib/recovery/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { TodaySession } from "@/lib/training/load-today-session";
import type { PlannedDay } from "@/lib/training/planned-day";

/**
 * UX-R1.0: Today, Training and Recovery read one decision (resolveDailyDecision → trainingHold). With pain/illness or an
 * unreadable check-in, no surface may say Start/Resume, "train normally" or "on track"; a completed session is never offered
 * as a start; no plan is not a rest day.
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
const moderateScore: RecoveryScoreResult = { score: 65, status: "moderate", drivers: [{ key: "stress", label: "Stress", score: 60, weight: 0.2, available: true }], missingInputs: [], baseline: null } as unknown as RecoveryScoreResult;
const greenLoad: TrainingLoadSummary = { state: "green", reason: "Training load looks manageable relative to your recovery data. Train your plan as normal.", sessionsLast7Days: 1, restDaysLast7Days: 6, averageSessionRpe: null, totalVolumeKgLast7Days: null, lastSessionDaysAgo: 0 };

const text = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** Every surface's training-facing copy for one set of reads, wired as the pages wire it. */
function surfaces(todaySession: TodaySession | null, plannedDay: PlannedDay | null, state: AthleteState | null, activePlanId: string | null = "plan-1") {
  const d = resolveDailyDecision({
    todaySessionRead: { status: "OK", session: todaySession },
    plannedDay,
    planUnavailable: false,
    athleteState: state,
    trainingContext: context,
  });
  const item = todayWorkoutItem(d.todaySession, d.todaySessionStatus, d.hold);
  const training = trainingHeroAction({ status: d.todaySessionStatus, hold: d.hold, sessionId: d.todaySession?.id ?? null, activePlanId, restDay: plannedDay?.kind === "REST", buildPlanHref: "/dashboard/workouts/plans/new" });
  return {
    ...d,
    today: text(createElement(DailyActionHero, { todaySession: d.todaySession, sessionStatus: d.todaySessionStatus, plannedDay, hold: d.hold })),
    whatMatters: text(createElement(WhatMattersNow, { items: item ? [item] : [], hold: d.hold })),
    training: `${training.eyebrow} ${training.label} ${training.note ?? ""}`,
    recoveryLine: buildRecoveryRecommendation(moderateScore, greenLoad, d.hold),
    recoveryLoadCard: text(createElement(TrainingRecoveryCard, { summary: greenLoad, hold: d.hold })),
  };
}

const AFFIRM_TRAINING =
  /Start Workout|Resume Workout|Start workout|Resume workout|Start from your plan|Train normally|Train your plan as normal|Maintain your planned intensity|Proceed with your planned session|Plan is on track/;
const READS: Array<[string, TodaySession | null, PlannedDay | null]> = [
  ["no plan", null, null],
  ["REST plan day", null, REST],
  ["scheduled plan day, no row", null, SCHEDULED],
  ["not-started session", session("not_started"), SCHEDULED],
  ["in-progress session", session("in_progress"), SCHEDULED],
  ["paused session", session("paused"), SCHEDULED],
  ["completed session", session("completed"), SCHEDULED],
  ["REST plan + not-started session (conflict)", session("not_started"), REST],
];

describe("safety hold: Today, Training and Recovery never affirm training", () => {
  for (const [label, state] of [
    ["pain/illness", withRecovery({ painFlag: true })],
    ["unreadable check-in", withRecovery({ painFlagUnavailable: true })],
    ["no decision (athlete state failed)", null],
  ] as const) {
    it(`${label}: no Start/Resume/"train normally"/"on track" on any surface, in every workout state`, () => {
      for (const [readsLabel, today, plannedDay] of READS) {
        const s = surfaces(today, plannedDay, state);
        expect(s.hold, readsLabel).not.toBeNull();
        for (const [surface, copy] of Object.entries({ today: s.today, whatMatters: s.whatMatters, training: s.training, recoveryLine: s.recoveryLine, recoveryLoadCard: s.recoveryLoadCard })) {
          expect(copy, `${label} / ${readsLabel} / ${surface}`).not.toMatch(AFFIRM_TRAINING);
        }
      }
    });
  }

  it("pain/illness: Recovery says recovery comes first, and the load chip is on hold, not GREEN", () => {
    const s = surfaces(session("not_started"), SCHEDULED, withRecovery({ painFlag: true }));
    expect(s.dailyDecision?.decision.decisionCode).toBe("prioritize_recovery");
    expect(s.recoveryLine).toMatch(/flagged pain or illness, so recovery comes before training today/);
    expect(s.recoveryLoadCard).toMatch(/On hold — Recovery first/);
    expect(s.recoveryLoadCard).not.toMatch(/GREEN/);
    expect(s.training).toMatch(/Recovery First Today Recovery guidance/);
  });

  it("pain/illness with the session done or nothing planned: What matters points to recovery instead of 'on track'", () => {
    for (const [today, plannedDay] of [[session("completed"), SCHEDULED], [null, null], [null, REST]] as const) {
      const s = surfaces(today, plannedDay, withRecovery({ painFlag: true }));
      expect(s.whatMatters).toMatch(/Recovery first today — your check-in flagged pain or illness/);
    }
  });

  it("building a first plan isn't training: with no active plan the Training hero still offers it under a hold", () => {
    const s = surfaces(null, null, withRecovery({ painFlag: true }), null);
    expect(s.training).toMatch(/Build recommended plan/);
  });
});

describe("hold cleared: each surface follows the session state", () => {
  it("completed session: Review on Today and Training, never a Start", () => {
    const s = surfaces(session("completed"), SCHEDULED, baseState);
    expect(s.hold).toBeNull();
    expect(s.today).toMatch(/Session Complete.*Review Session/);
    expect(s.training).toMatch(/Session Complete Review session/);
    expect(s.training).not.toMatch(/Start/);
  });

  it("in progress: Resume on both; not started: Start on both; plan day without a row: Start from the plan", () => {
    expect(surfaces(session("in_progress"), SCHEDULED, baseState).training).toMatch(/Session In Progress Resume workout/);
    expect(surfaces(session("not_started"), SCHEDULED, baseState).training).toMatch(/Today's Session Start workout/);
    const planDay = surfaces(null, SCHEDULED, baseState);
    expect(planDay.today).toMatch(/Start Workout/);
    expect(planDay.training).toMatch(/Next In Your Plan Start from your plan/);
  });

  it("cancelled session: postponed, reviewed, not started", () => {
    const s = surfaces(session("cancelled"), SCHEDULED, baseState);
    expect(s.training).toMatch(/Session Postponed · Rest Day Review session/);
    expect(s.today).not.toMatch(/Start Workout/);
  });

  it("REST conflict: review the plan, no Start", () => {
    const s = surfaces(session("not_started"), REST, baseState);
    expect(s.todaySessionStatus).toBe("conflict");
    expect(s.training).toMatch(/Workout Schedule Needs Review Review your plan/);
    expect(s.training).not.toMatch(/Start/);
  });

  it("no plan is not a rest day; a REST plan day is", () => {
    const noPlan = surfaces(null, null, baseState, null);
    expect(noPlan.today).toMatch(/No Plan Day Today No workout planned/);
    expect(noPlan.today).not.toMatch(/Scheduled Rest Day/);
    expect(noPlan.training).toMatch(/Build recommended plan/);
    const rest = surfaces(null, REST, baseState);
    expect(rest.today).toMatch(/Scheduled Rest Day Active Recovery/);
    expect(rest.training).toMatch(/Rest Day In Your Plan View your plan/);
    expect(rest.training).not.toMatch(/Start/);
  });

  it("a cleared hold restores the score-based Recovery line and load chip", () => {
    const s = surfaces(session("not_started"), SCHEDULED, baseState);
    expect(s.recoveryLine).toMatch(/Recovery is moderate today/);
    expect(s.recoveryLoadCard).toMatch(/GREEN — Train normally/);
  });

  it("a failed session read is unknown on Training too, never a Start", () => {
    const d = resolveDailyDecision({ todaySessionRead: null, plannedDay: SCHEDULED, planUnavailable: false, athleteState: baseState, trainingContext: context });
    const action = trainingHeroAction({ status: d.todaySessionStatus, hold: d.hold, sessionId: null, activePlanId: "plan-1", restDay: false, buildPlanHref: "/x" });
    expect(d.todaySessionStatus).toBe("unknown");
    expect(action.eyebrow).toBe("Workout Status Unavailable");
    expect(action.label).not.toMatch(/Start/);
  });
});

describe("Nutrition Coach totals follow the tracker's food log", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "../../..", p), "utf8");
  it("the tracker announces every entries change and the coach panel re-reads its server context on it", () => {
    const tracker = read("components/nutrition/nutrition-tracker.tsx");
    const panel = read("components/nutrition/coach/nutrition-coach-panel.tsx");
    expect(tracker).toMatch(/announceFoodLogChanged\("tracker"\)\s*\n\s*\}, \[entries\]\)/);
    // ...and a Dante-confirmed log (any non-tracker announcement) makes the tracker re-read the server's day.
    expect(tracker).toMatch(/foodLogChangeSource\(event\) === "tracker"\) return[\s\S]*?reloadLog\(\)/);
    expect(panel).toMatch(/addEventListener\(FOOD_LOG_CHANGED_EVENT, onFoodLogChanged\)/);
    expect(panel).toMatch(/const onFoodLogChanged = \(\) => void refreshSuggestions\(\)/);
    // only the newest re-read may set the remaining macros
    expect(panel).toMatch(/if \(seq !== refreshSeq\.current\) return\s*\n\s*if \(ctx\?\.json\.context\) setContext/);
  });
});
