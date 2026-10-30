// @vitest-environment node
/**
 * QA-01 residual: the training hold is enforced by the DATABASE, not only by Next.js — a direct authenticated
 * PostgREST call to start_workout, or a direct insert/update of workout_sessions, cannot activate a session while
 * today's check-in flags pain/illness. LOCAL migrations-built DB only (never hosted); skipped when unavailable.
 * MF_TEST_DB_CONTAINER picks the stack.
 */
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

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
  const r = run("select count(*) from pg_trigger where tgname = 'workout_sessions_training_hold';")
  return r.ok && Number(r.out.trim()) > 0
})()

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const athlete = randomUUID()
const other = randomUUID()
const builtin = LOCAL_EXERCISE_LIBRARY[0].id as string

function as(uid: string | null, body: string): string {
  const role = uid ? "authenticated" : "anon"
  const claims = JSON.stringify(uid ? { sub: uid, role } : { role })
  return `begin;
set local role ${role};
select set_config('request.jwt.claims', ${q(claims)}, true);
${body}
commit;`
}

const utcToday = "(now() at time zone 'UTC')::date"
const setCheckin = (pain: "yes" | "no" | "minor", date = utcToday) =>
  run(`delete from recovery_checkins where user_id = ${q(athlete)};
insert into recovery_checkins (user_id, checkin_date, pain_illness) values (${q(athlete)}, ${date}, ${q(pain)});`)
const sessions = (uid = athlete) =>
  run(`select coalesce(string_agg(session_state, ',' order by created_at), '') from workout_sessions where user_id = ${q(uid)};`).out.trim()
const setCount = () =>
  run(`select count(*) from exercise_sets s join workout_session_exercises e on e.id = s.session_exercise_id
join workout_sessions w on w.id = e.workout_session_id where w.user_id = ${q(athlete)};`).out.trim()
const start = (uid: string | null = athlete) => run(as(uid, `select public.start_workout(${q(dayId)}::uuid)::text;`))
const isHold = (r: { ok: boolean; err: string }) => !r.ok && r.err.includes("Training is on hold today")
const sid = (r: { out: string }) => r.out.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l.trim()))?.trim()

let dayId = ""

describe.skipIf(!dbReady)("training hold blocks session activation (real DB)", () => {
  beforeAll(() => {
    const users = run(`insert into auth.users (id, aud, role, email) values
  (${q(athlete)}, 'authenticated', 'authenticated', 'hold-${athlete}@example.test'),
  (${q(other)}, 'authenticated', 'authenticated', 'hold-${other}@example.test');`)
    expect(users.err).toBe("")
    const payload = {
      plan: { client_id: null, name: "Hold plan", description: null, goal: null, weeks: 4, days_per_week: 1, session_duration_minutes: 60 },
      days: [{ day_number: 1, name: "Day", focus: null, notes: null, rest_day: false, exercises: [
        { exercise_id: builtin, exercise_name: "Lift", exercise_order: 1, target_sets: 2, rep_min: 8, rep_max: 10, rest_seconds: 60, tempo: null, rir: 2, notes: null },
      ] }],
    }
    const p = run(as(athlete, `select public.create_workout_plan(${q(JSON.stringify(payload))}::jsonb)::text;`))
    expect(p.err).toBe("")
    const planId = JSON.parse(p.out.split("\n").find((l) => l.includes("plan_id"))!).plan_id as string
    const d = run(`update workout_plans set status = 'active' where id = ${q(planId)};
select id from workout_days where workout_plan_id = ${q(planId)};`)
    dayId = d.out.trim().split("\n").pop()!
  })

  beforeEach(() => {
    run(`delete from workout_sessions where user_id in (${q(athlete)}, ${q(other)});
delete from recovery_checkins where user_id = ${q(athlete)};`)
  })

  afterAll(() => {
    run(`delete from workout_sessions where user_id in (${q(athlete)}, ${q(other)});
delete from recovery_checkins where user_id = ${q(athlete)};
delete from workout_plans where created_by = ${q(athlete)};
delete from auth.users where id in (${q(athlete)}, ${q(other)});`)
  })

  it("no pain: start_workout activates; a second call returns the same session (no duplicate)", () => {
    setCheckin("no")
    const a = start()
    expect(a.err).toBe("")
    expect(sid(a)).toBeTruthy()
    expect(sid(start())).toBe(sid(a))
    expect(sessions()).toBe("in_progress")
  })

  it("pain today: a direct authenticated RPC call is refused and creates nothing", () => {
    setCheckin("yes")
    expect(isHold(start())).toBe(true)
    expect(sessions()).toBe("")
    expect(setCount()).toBe("0")
  })

  it("pain today: a planned not_started row is not begun and gets no sets", () => {
    run(`insert into workout_sessions (user_id, workout_day_id, title, scheduled_date, status, session_state)
values (${q(athlete)}, ${q(dayId)}, 'Planned', ${utcToday}, 'scheduled', 'not_started');`)
    setCheckin("yes")
    expect(isHold(start())).toBe(true)
    expect(sessions()).toBe("not_started")
    expect(setCount()).toBe("0")
  })

  it("pain today: direct REST-style insert/update into in_progress is refused", () => {
    setCheckin("yes")
    const ins = run(as(athlete, `insert into workout_sessions (user_id, title, scheduled_date, status, session_state)
values (${q(athlete)}, 'x', current_date, 'in_progress', 'in_progress');`))
    expect(isHold(ins)).toBe(true)
    run(`insert into workout_sessions (user_id, title, scheduled_date, status, session_state)
values (${q(athlete)}, 'Planned', current_date, 'scheduled', 'not_started');`)
    const upd = run(as(athlete, `update workout_sessions set session_state = 'in_progress' where user_id = ${q(athlete)};`))
    expect(isHold(upd)).toBe(true)
    const upd2 = run(as(athlete, `update workout_sessions set status = 'in_progress' where user_id = ${q(athlete)};`))
    expect(isHold(upd2)).toBe(true)
    expect(sessions()).toBe("not_started")
  })

  it("an in-progress session started before the hold is kept, resumable and finishable", () => {
    setCheckin("no")
    const id = sid(start())!
    setCheckin("yes")
    expect(sid(start())).toBe(id)
    const log = run(as(athlete, `update exercise_sets set weight_kg = 60, reps = 8, completed = true, completed_at = now()
where session_exercise_id in (select id from workout_session_exercises where workout_session_id = ${q(id)});`))
    expect(log.err).toBe("")
    const fin = run(as(athlete, `select public.finish_workout(${q(id)}::uuid, null, 7)::text;`))
    expect(fin.err).toBe("")
    expect(sessions()).toBe("completed")
  })

  it("only today's 'yes' holds: yesterday's pain and 'minor' do not (same rule as athleteState.painFlag)", () => {
    setCheckin("yes", `${utcToday} - 1`)
    expect(start().err).toBe("")
    run(`delete from workout_sessions where user_id = ${q(athlete)};`)
    setCheckin("minor")
    expect(start().err).toBe("")
  })

  it("anon cannot execute start_workout; another tenant cannot start or insert for the athlete", () => {
    expect(start(null).err).toMatch(/permission denied/)
    expect(start(other).err).toContain("Active workout day not found")
    const cross = run(as(other, `insert into workout_sessions (user_id, title, scheduled_date, status, session_state)
values (${q(athlete)}, 'x', current_date, 'scheduled', 'not_started');`))
    expect(cross.ok).toBe(false)
    expect(sessions()).toBe("")
  })
})
