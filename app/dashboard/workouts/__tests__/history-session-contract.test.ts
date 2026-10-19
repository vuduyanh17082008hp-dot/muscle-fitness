import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WF-04 / WF-05: History + Session Detail must read through the canonical
 * relation workout_sessions -> workout_session_exercises -> exercise_sets
 * (exercise_sets.session_exercise_id) and use duration_minutes /
 * total_volume_kg. The fake client behaves like PostgREST: referencing a
 * column the migration schema lacks is an error, so a legacy query fails.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/dashboard/workouts/actions", () => ({
  finishWorkoutAction: vi.fn(),
  replaceSessionExerciseAction: vi.fn(),
  saveWorkoutSetAction: vi.fn(),
  skipSessionExerciseAction: vi.fn(),
}));
vi.mock("@/lib/athlete-state/build-athlete-state", () => ({ buildAthleteState: vi.fn() }));
vi.mock("@/lib/training/load-training-context", () => ({ loadTrainingContext: vi.fn() }));
vi.mock("@/lib/dante-core/program-adaptation-log", () => ({ logProgramAdaptations: vi.fn() }));
vi.mock("@/lib/dante-core/load-adaptation-history", () => ({ loadAdaptationHistory: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import HistoryPage from "@/app/dashboard/workouts/history/page";
import SessionPage from "@/app/dashboard/workouts/session/[sessionId]/page";

const COLUMNS: Record<string, string[]> = {
  workout_sessions: [
    "id", "user_id", "name", "session_state", "workout_plan_id", "workout_day_id",
    "started_at", "completed_at", "created_at", "duration_minutes", "total_volume_kg", "total_sets",
  ],
  workout_session_exercises: [
    "id", "workout_session_id", "exercise_id", "exercise_order", "display_name",
    "target_sets", "target_rep_min", "target_rep_max", "target_rir", "rest_seconds", "tempo", "is_skipped",
  ],
  exercise_sets: [
    "id", "session_exercise_id", "set_number", "weight_kg", "reps", "rir", "completed",
  ],
  workout_plans: ["id", "name", "allow_client_substitution"],
  exercise_library: ["id", "name", "primary_muscle", "equipment", "is_active"],
  workout_days: ["id", "name"],
};

type Row = Record<string, unknown>;
type DbError = { message: string };

function fakeSupabase(
  tables: Record<string, Row[]>,
  opts: { failTable?: string } = {},
) {
  const queries: Array<{ table: string; columns: string[] }> = [];

  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const used: string[] = [];
    let orderBy: string | null = null;
    let schemaError: DbError | null = null;

    const touch = (col: string) => {
      used.push(col);
      if (!COLUMNS[table]?.includes(col)) {
        schemaError = { message: `column ${table}.${col} does not exist` };
      }
    };

    const run = () => {
      queries.push({ table, columns: used });
      if (opts.failTable === table) {
        return { data: null, error: { message: "boom: relation secret_internal failed" } };
      }
      if (schemaError) return { data: null, error: schemaError };
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderBy) {
        const key = orderBy;
        rows = [...rows].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0));
      }
      return { data: rows, error: null as DbError | null };
    };

    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        touch(col);
        filters.push((r) => r[col] === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        touch(col);
        filters.push((r) => vals.includes(r[col]));
        return q;
      },
      order: (col: string) => {
        touch(col);
        orderBy = col;
        return q;
      },
      limit: () => q,
      maybeSingle: async () => {
        const res = run();
        return { data: res.data?.[0] ?? null, error: res.error };
      },
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return q;
  };

  return {
    queries,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from,
  };
}

const session = {
  id: "s1", user_id: "u1", name: "Push A", session_state: "completed",
  workout_plan_id: "p1", workout_day_id: "d1",
  started_at: "2026-10-01T10:00:00Z", completed_at: "2026-10-01T11:00:00Z",
  created_at: "2026-10-01T09:00:00Z", duration_minutes: 62, total_volume_kg: 5400, total_sets: 3,
};
const seed = () => ({
  workout_sessions: [session],
  workout_session_exercises: [
    { id: "e1", workout_session_id: "s1", exercise_id: "x1", exercise_order: 1, display_name: "Bench Press", target_sets: 2, target_rep_min: 5, target_rep_max: 8, target_rir: null, rest_seconds: 120, tempo: null, is_skipped: false },
    { id: "e2", workout_session_id: "s1", exercise_id: "x2", exercise_order: 2, display_name: "Overhead Press", target_sets: 1, target_rep_min: 8, target_rep_max: 10, target_rir: null, rest_seconds: 90, tempo: null, is_skipped: false },
  ],
  exercise_sets: [
    { id: "t1", session_exercise_id: "e1", set_number: 1, weight_kg: 100, reps: 5, rir: 2, completed: true },
    { id: "t2", session_exercise_id: "e1", set_number: 2, weight_kg: 100, reps: 5, rir: 1, completed: true },
    { id: "t3", session_exercise_id: "e2", set_number: 1, weight_kg: 50, reps: 8, rir: 2, completed: true },
  ],
  workout_plans: [{ id: "p1", name: "PPL Plan" }],
  workout_days: [{ id: "d1", name: "Push Day" }],
});

const LEGACY: Record<string, string[]> = {
  exercise_sets: ["workout_session_id", "workout_session_exercise_id"],
  workout_sessions: ["duration_seconds", "total_volume"],
};

function expectNoLegacy(queries: Array<{ table: string; columns: string[] }>) {
  for (const q of queries) {
    for (const bad of LEGACY[q.table] ?? []) expect(q.columns).not.toContain(bad);
  }
}

async function renderHistory(db: ReturnType<typeof fakeSupabase>) {
  vi.mocked(createClient).mockResolvedValue(db as never);
  return renderToStaticMarkup(await HistoryPage());
}
async function renderSession(db: ReturnType<typeof fakeSupabase>) {
  vi.mocked(createClient).mockResolvedValue(db as never);
  const el = await SessionPage({ params: Promise.resolve({ sessionId: "s1" }) });
  return renderToStaticMarkup(createElement("div", null, el));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("WF-04 workout history", () => {
  it("loads completed sessions via session_exercise_id, shows canonical duration and volume", async () => {
    const db = fakeSupabase(seed());
    const html = await renderHistory(db);

    expect(html).toContain("Push Day");
    expect(html).toContain("1h 2m"); // duration_minutes 62
    expect(html).toContain("5,400 kg"); // total_volume_kg
    expect(html).toContain("Bench Press");

    const setQuery = db.queries.find((q) => q.table === "exercise_sets");
    expect(setQuery?.columns).toContain("session_exercise_id");
    expectNoLegacy(db.queries);
  });

  it("falls back to computed volume when total_volume_kg is 0", async () => {
    const data = seed();
    data.workout_sessions = [{ ...session, total_volume_kg: 0 }];
    const html = await renderHistory(fakeSupabase(data));
    expect(html).toContain("1,400 kg"); // 2*100*5 + 50*8 = 1400
  });

  it("shows a controlled error state, not an empty state or raw DB message, when sets fail", async () => {
    const html = await renderHistory(fakeSupabase(seed(), { failTable: "exercise_sets" }));
    expect(html).toContain("Workout history is unavailable");
    expect(html).not.toContain("secret_internal");
    expect(html).not.toContain("No completed");
  });

  it("does not fail the page when only the plan-name lookup fails", async () => {
    const html = await renderHistory(fakeSupabase(seed(), { failTable: "workout_plans" }));
    expect(html).toContain("Bench Press");
    expect(html).not.toContain("unavailable");
  });
});

describe("WF-05 session detail", () => {
  it("loads the canonical session, groups sets per exercise, uses duration_minutes", async () => {
    const db = fakeSupabase(seed());
    const html = await renderSession(db);

    expect(html).toContain("Bench Press");
    expect(html).toContain("Overhead Press");
    expect(html).toContain("2/2"); // Bench sets complete
    expect(html).toContain("1/1"); // OHP sets complete
    expect(html).toContain("3/3"); // completed / planned
    expect(html).toContain("1h 2m");
    expect(html).toContain("1,400 kg");
    expectNoLegacy(db.queries);
    expect(db.queries.find((q) => q.table === "exercise_sets")?.columns).toContain("session_exercise_id");
  });

  it("renders the empty state for a session with no exercises", async () => {
    const data = seed();
    data.workout_session_exercises = [];
    data.exercise_sets = [];
    const db = fakeSupabase(data);
    const html = await renderSession(db);
    expect(html).toContain("No session exercises");
    expect(db.queries.some((q) => q.table === "exercise_sets")).toBe(false);
  });

  it("surfaces a read failure safely without the raw DB message", async () => {
    const html = await renderSession(fakeSupabase(seed(), { failTable: "exercise_sets" }));
    expect(html).toContain("Workout session is unavailable");
    expect(html).not.toContain("secret_internal");
  });
});

describe("PF-01 active workout session", () => {
  const active = () => {
    const data = seed() as Record<string, Row[]>;
    data.workout_sessions = [{ ...session, session_state: "in_progress", completed_at: null }];
    data.exercise_sets = [
      { id: "t1", session_exercise_id: "e1", set_number: 1, set_type: "working", target_reps: 8, weight_kg: 100, reps: 5, rir: 2, rpe: null, completed: true },
      { id: "t2", session_exercise_id: "e1", set_number: 2, set_type: "working", target_reps: 8, weight_kg: null, reps: null, rir: null, rpe: null, completed: false },
      { id: "t3", session_exercise_id: "e2", set_number: 1, set_type: "working", target_reps: 10, weight_kg: null, reps: null, rir: null, rpe: null, completed: false },
    ];
    data.workout_plans = [{ id: "p1", name: "PPL Plan", allow_client_substitution: true }];
    data.exercise_library = [
      { id: "x1", name: "Bench Press", primary_muscle: "chest", equipment: "barbell", is_active: true },
      { id: "x2", name: "Overhead Press", primary_muscle: "shoulders", equipment: "barbell", is_active: true },
      { id: "x3", name: "Dumbbell Press", primary_muscle: "chest", equipment: "dumbbell", is_active: true },
    ];
    return data;
  };

  it("mounts the interactive player for an in-progress session, restoring saved sets", async () => {
    const html = await renderSession(fakeSupabase(active()));

    expect(html).toContain("Workout in progress");
    expect(html).toContain("Push A");
    expect(html).toContain("Complete workout");
    expect(html).toContain("Rest timer");
    expect(html).toContain(">1/3<"); // saved progress survives a reload
    expect(html).toContain('value="100"'); // logged weight is restored into the input
    expect(html).toContain("Dumbbell Press"); // same-muscle substitution option
    expect(html).not.toContain("Session exercises"); // not the read-only view
  });

  it("renders exactly one finish action", async () => {
    const html = await renderSession(fakeSupabase(active()));
    expect(html.split("Complete workout").length - 1).toBe(1);
  });

  it("still lets the user log when library/plan lookups fail", async () => {
    const html = await renderSession(fakeSupabase(active(), { failTable: "exercise_library" }));
    expect(html).toContain("Complete workout");
    expect(html).toContain("Bench Press");
  });

  it("keeps a completed session read-only", async () => {
    const html = await renderSession(fakeSupabase(seed()));
    expect(html).toContain("Session exercises");
    expect(html).not.toContain("Complete workout");
    expect(html).not.toContain("<input");
  });
});
