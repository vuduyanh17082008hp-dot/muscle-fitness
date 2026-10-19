// @vitest-environment node
/**
 * VER3-02 / VER3-03 integration tests against the LOCAL migrations-built DB
 * (never hosted): built-in exercise identity, start_workout status contract and
 * the start -> log -> finish lifecycle. Skipped only when the container/migration
 * is not available.
 */
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"

function run(sql: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", process.env.MF_TEST_DB_NAME ?? "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, encoding: "utf8" },
  )
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" }
}

const dbReady = (() => {
  const r = run(
    "select count(*) from exercise_library where id::text like '10000000-0000-4000-8000-%';",
  )
  return r.ok && Number(r.out.trim()) > 0
})()

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const user = randomUUID()
const libId = randomUUID()
const builtins = LOCAL_EXERCISE_LIBRARY.map((e) => e.id as string)

function asUser(body: string): string {
  const claims = JSON.stringify({ sub: user, role: "authenticated" })
  return `begin;
set local role authenticated;
select set_config('request.jwt.claims', ${q(claims)}, true);
${body}
commit;`
}

function ex(id: string, order: number) {
  return {
    exercise_id: id,
    exercise_name: `Lift ${order}`,
    exercise_order: order,
    target_sets: 2,
    rep_min: 8,
    rep_max: 10,
    rest_seconds: 60,
    tempo: null,
    rir: 2,
    notes: null,
  }
}

function createPlan(exerciseIds: string[]): { planId: string; dayId: string } {
  const payload = {
    plan: { client_id: null, name: "VER3 plan", description: null, goal: null, weeks: 4, days_per_week: 1, session_duration_minutes: 60 },
    days: [
      {
        day_number: 1,
        name: "Day",
        focus: null,
        notes: null,
        rest_day: false,
        exercises: exerciseIds.map((id, i) => ex(id, i + 1)),
      },
    ],
  }
  const r = run(asUser(`select public.create_workout_plan(${q(JSON.stringify(payload))}::jsonb)::text;`))
  expect(r.err).toBe("")
  const line = r.out.split("\n").find((l) => l.startsWith("{") && l.includes("plan_id"))!
  const planId = JSON.parse(line).plan_id as string
  // one active plan per client: retire earlier test plans before activating this one
  const d = run(`update workout_plans set status = 'archived' where created_by = ${q(user)} and status = 'active';
update workout_plans set status = 'active' where id = ${q(planId)};
select id from workout_days where workout_plan_id = ${q(planId)};`)
  expect(d.err).toBe("")
  return { planId, dayId: d.out.trim().split("\n").pop()! }
}

function startWorkout(dayId: string): string {
  const r = run(asUser(`select public.start_workout(${q(dayId)}::uuid)::text;`))
  expect(r.err).toBe("")
  return r.out.trim().split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l))!
}

describe.skipIf(!dbReady)("built-in exercise identity + workout lifecycle (real DB)", () => {
  beforeAll(() => {
    const r = run(`
insert into auth.users (id, aud, role, email) values (${q(user)}, 'authenticated', 'authenticated', 'ver3-${user}@example.test');
insert into exercise_library (id, slug, name, primary_muscle, equipment)
  values (${q(libId)}, ${q("ver3-" + libId.slice(0, 8))}, 'VER3 db lift', 'chest', 'barbell');`)
    expect(r.err).toBe("")
  })

  afterAll(() => {
    run(`delete from workout_sessions where user_id = ${q(user)};
delete from workout_plans where created_by = ${q(user)};
delete from exercise_library where id = ${q(libId)};
delete from auth.users where id = ${q(user)};`)
  })

  it("A/D: every app built-in id exists in exercise_library with its slug", () => {
    const r = run(`select id || '|' || slug from exercise_library where owner_id is null and id::text like '10000000-0000-4000-8000-%' order by id;`)
    const expected = LOCAL_EXERCISE_LIBRARY.map((e) => `${e.id}|${e.slug}`).sort()
    expect(r.out.trim().split("\n")).toEqual(expected)
  })

  it("E: re-running the migration creates no duplicates and changes no ids", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261011130000_builtin_exercise_identity.sql"), "utf8")
    const snapshot = () => run(`select count(*) || ',' || count(distinct slug) || ',' || md5(string_agg(id::text, ',' order by id)) from exercise_library where owner_id is null;`).out.trim()
    const before = snapshot()
    expect(run(sql).ok).toBe(true)
    expect(snapshot()).toBe(before)
  })

  it("B: an auto-build style plan using built-ins saves", () => {
    const { planId } = createPlan(builtins.slice(0, 20))
    const r = run(`select count(*) from workout_exercises e join workout_days d on d.id = e.workout_day_id where d.workout_plan_id = ${q(planId)};`)
    expect(r.out.trim()).toBe("20")
    expect(createPlan(builtins.slice(20)).planId).toBeTruthy()
  })

  it("C: a mixed DB-fetched + built-in plan saves and resolves", () => {
    const { dayId } = createPlan([libId, builtins[0]])
    const sessionId = startWorkout(dayId)
    const r = run(`select count(*) from workout_session_exercises where workout_session_id = ${q(sessionId)};`)
    expect(r.out.trim()).toBe("2")
  })

  it("VER3-03: start -> log -> finish uses canonical statuses", () => {
    const { dayId } = createPlan([builtins[0], builtins[3]])
    const sessionId = startWorkout(dayId)
    const state = () => run(`select status || '/' || session_state from workout_sessions where id = ${q(sessionId)};`).out.trim()

    expect(state()).toBe("in_progress/in_progress")
    // starting again resumes the same session
    expect(startWorkout(dayId)).toBe(sessionId)

    const log = run(asUser(`update exercise_sets set weight_kg = 60, reps = 8, completed = true, completed_at = now()
where session_exercise_id in (select id from workout_session_exercises where workout_session_id = ${q(sessionId)});`))
    expect(log.err).toBe("")

    const fin = run(asUser(`select public.finish_workout(${q(sessionId)}::uuid, null, 7)::text;`))
    expect(fin.err).toBe("")
    expect(state()).toBe("completed/completed")
  })

  it("F: skipped is allowed; 'planned' cannot enter the DB", () => {
    const base = (status: string) =>
      run(`insert into workout_sessions (user_id, title, scheduled_date, status) values (${q(user)}, 'x', current_date, ${q(status)});`)
    expect(base("skipped").ok).toBe(true)
    const bad = base("planned")
    expect(bad.ok).toBe(false)
    expect(bad.err).toContain("workout_sessions_status_check")
  })
})
