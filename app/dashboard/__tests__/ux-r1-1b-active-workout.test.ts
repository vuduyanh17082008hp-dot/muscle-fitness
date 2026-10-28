import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * UX-R1.1B Active Workout: compact rows, one expanded exercise, carry-forward shown as a hint (placeholder) and never
 * as a logged value, finish confirmation when sets are missing, and the rest timer kept below the mobile header.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/dashboard/workouts/actions", () => ({
  finishWorkoutAction: vi.fn(),
  replaceSessionExerciseAction: vi.fn(),
  saveWorkoutSetAction: vi.fn(),
  skipSessionExerciseAction: vi.fn(),
}));

import { suggestSetValues } from "@/features/workouts/calculations";
import type { WorkoutPlayerExercise, WorkoutPlayerSet } from "@/features/workouts/types";
import { WorkoutPlayer } from "@/features/workouts/workout-player";
import { loadPreviousPerformance } from "@/lib/training/load-previous-performance";

const set = (id: string, setNumber: number, patch: Partial<WorkoutPlayerSet> = {}): WorkoutPlayerSet => ({
  id, setNumber, setType: "working", targetReps: 8, weightKg: null, reps: null, rir: null, rpe: null, completed: false, ...patch,
});

const exercise = (id: string, name: string, sets: WorkoutPlayerSet[], patch: Partial<WorkoutPlayerExercise> = {}): WorkoutPlayerExercise => ({
  id, exerciseId: `x-${id}`, name, primaryMuscle: "chest", equipment: "barbell", exerciseOrder: 1, targetSets: sets.length,
  repMin: 6, repMax: 8, targetRir: 2, targetRpe: null, restSeconds: 120, notes: null, isSkipped: false, sets, previous: null, ...patch,
});

describe("carry-forward suggestion", () => {
  const history = { exercise_id: "x-e1", performed_at: "2026-10-20T10:00:00Z", sets: [
    { setNumber: 1, weightKg: 75, reps: 8, rir: 2, rpe: null },
    { setNumber: 2, weightKg: 77.5, reps: 7, rir: 1, rpe: null },
  ] };

  it("takes the closest earlier logged set of this exercise first", () => {
    const ex = exercise("e1", "Bench", [set("a", 1, { weightKg: 80, reps: 8, completed: true }), set("b", 2), set("c", 3)], { previous: history });
    expect(suggestSetValues(ex, 1)).toEqual({ weightKg: 80, reps: 8, source: { kind: "set", setNumber: 1 } });
    expect(suggestSetValues(ex, 2)).toEqual({ weightKg: 80, reps: 8, source: { kind: "set", setNumber: 1 } });
  });

  it("ignores values typed into an earlier set that was never logged", () => {
    const ex = exercise("e1", "Bench", [set("a", 1, { weightKg: 999, reps: 1 }), set("b", 2)]);
    expect(suggestSetValues(ex, 1)).toEqual({ weightKg: null, reps: 8, source: { kind: "target" } });
  });

  it("falls back to last session's same set, then its last set, then planned reps", () => {
    const ex = exercise("e1", "Bench", [set("a", 1), set("b", 2), set("c", 3)], { previous: history });
    expect(suggestSetValues(ex, 0)).toMatchObject({ weightKg: 75, reps: 8, source: { kind: "history" } });
    expect(suggestSetValues(ex, 2)).toMatchObject({ weightKg: 77.5, reps: 7, source: { kind: "history" } });
    expect(suggestSetValues(exercise("e2", "Row", [set("d", 1, { targetReps: null })]), 0)).toBeNull();
  });
});

describe("active workout player (SSR)", () => {
  const render = (exercises: WorkoutPlayerExercise[]) =>
    renderToStaticMarkup(createElement(WorkoutPlayer, {
      sessionId: "s1", sessionName: "Push A", startedAt: null, allowSubstitution: false, initialExercises: exercises, replacementOptions: [],
    }));

  const bench = exercise("e1", "Bench Press", [set("a", 1, { weightKg: 80, reps: 8, rir: 2, completed: true }), set("b", 2), set("c", 3)]);
  const press = exercise("e2", "Overhead Press", [set("d", 1), set("e", 2)]);
  const html = render([bench, press]);

  it("expands only the first exercise with an unlogged set; the others are summaries", () => {
    expect(html.match(/<input[^>]*data-set-input/g)).toHaveLength(9); // 3 sets × kg/reps/RIR, Overhead Press collapsed
    expect(html).toContain("Overhead Press");
    expect(html).toContain("0/2 sets");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
  });

  it("shows carry-forward as a placeholder hint, never as a value or a completed set", () => {
    expect(html).toContain('placeholder="80"');
    expect(html.match(/value="80"/g)).toHaveLength(1); // only the logged set 1 carries a real value
    expect(html).toContain("Suggested from set 1 — not logged yet");
    expect(html).toContain('aria-label="Log set 2 of Bench Press"');
    expect(html).toContain('aria-label="Undo set 1 of Bench Press"');
    expect(html).toContain(">1/5<");
  });

  it("uses 16px numeric inputs and 48px row actions", () => {
    // `!`: globals.css's unlayered `input { font: inherit }` beats a plain text-base (15px body on mobile → iOS zoom).
    expect(html).toMatch(/<input[^>]*data-set-input[^>]*inputMode="decimal"[^>]*class="[^"]*\bh-12\b[^"]*\btext-base!/);
    expect(html).toContain('inputMode="numeric"');
  });

  it("asks before finishing with missing sets, never completes them", () => {
    expect(html).toContain("You logged 1 of 5 sets. Finish this workout?");
    expect(html).toContain("Continue Workout");
    expect(html).toContain("Finish Anyway");
    expect(html.split("Complete workout").length - 1).toBe(1);
  });

  it("keeps the rest timer below the sticky mobile header and focused inputs clear of the finish bar", () => {
    expect(html).toContain("sticky top-[4.5rem] z-20");
    expect(html).toContain("Rest timer");
    expect(html).toMatch(/<input[^>]*data-set-input[^>]*class="[^"]*\bscroll-mb-40\b/);
    // Never toggle the bar on focus: a Log tap blurs the input and the bar would reappear under the finger.
    expect(html).not.toContain("group-has-[[data-set-input]:focus]");
  });
});

describe("loadPreviousPerformance", () => {
  const fake = (tables: Record<string, Record<string, unknown>[]>) => ({
    from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), q),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), q),
        order: () => q,
        limit: () => q,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    },
  });

  it("returns the newest completed session's logged sets per exercise, ignoring other users and open sessions", async () => {
    const db = fake({
      workout_sessions: [
        { id: "new", user_id: "u1", session_state: "completed", completed_at: "2026-10-25T10:00:00Z" },
        { id: "old", user_id: "u1", session_state: "completed", completed_at: "2026-10-18T10:00:00Z" },
        { id: "now", user_id: "u1", session_state: "in_progress", completed_at: null },
        { id: "other", user_id: "u2", session_state: "completed", completed_at: "2026-10-26T10:00:00Z" },
      ],
      workout_session_exercises: [
        { id: "se-new", exercise_id: "x1", workout_session_id: "new", is_skipped: false },
        { id: "se-old", exercise_id: "x1", workout_session_id: "old", is_skipped: false },
        { id: "se-now", exercise_id: "x1", workout_session_id: "now", is_skipped: false },
        { id: "se-other", exercise_id: "x1", workout_session_id: "other", is_skipped: false },
      ],
      exercise_sets: [
        { session_exercise_id: "se-new", set_number: 1, weight_kg: "82.5", reps: 6, rir: null, rpe: null, completed: true },
        { session_exercise_id: "se-new", set_number: 2, weight_kg: 90, reps: 1, rir: null, rpe: null, completed: false },
        { session_exercise_id: "se-old", set_number: 1, weight_kg: 70, reps: 8, rir: 2, rpe: null, completed: true },
        { session_exercise_id: "se-now", set_number: 1, weight_kg: 100, reps: 5, rir: 1, rpe: null, completed: true },
        { session_exercise_id: "se-other", set_number: 1, weight_kg: 200, reps: 5, rir: 1, rpe: null, completed: true },
      ],
    });
    const result = await loadPreviousPerformance(db as never, "u1", ["x1"]);
    expect(result.get("x1")).toEqual({
      exercise_id: "x1", performed_at: "2026-10-25T10:00:00Z", sets: [{ setNumber: 1, weightKg: 82.5, reps: 6, rir: null, rpe: null }],
    });
  });

  it("never blocks logging: a throwing client yields no history", async () => {
    const broken = { from: () => { throw new Error("network"); } };
    expect((await loadPreviousPerformance(broken as never, "u1", ["x1"])).size).toBe(0);
  });
});
