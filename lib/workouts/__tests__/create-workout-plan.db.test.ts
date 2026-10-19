// @vitest-environment node
/**
 * WF-03A / WF-03 integration tests: atomic + idempotent public.create_workout_plan.
 *
 * These exercise REAL Postgres transactions (atomicity/idempotency are DB properties),
 * against the local Supabase DB container only (never hosted). Each statement batch runs
 * as the `authenticated` role with a JWT `sub` claim, so RLS and auth.uid() apply.
 * Skipped (loudly) only when the container/migration is not available.
 */
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// File-local only: each case shells out to docker/psql several times.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"

function psqlArgs() {
  return ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"]
}

function run(sql: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("docker", psqlArgs(), { input: sql, encoding: "utf8" })
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" }
}

function runAsync(sql: string): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn("docker", psqlArgs())
    let out = ""
    let err = ""
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (err += d))
    p.on("close", (code) => resolve({ ok: code === 0, out, err }))
    p.stdin.end(sql)
  })
}

const dbReady = (() => {
  const r = run("select 1 from pg_proc where proname = 'create_workout_plan';")
  return r.ok && r.out.trim() === "1"
})()

const userA = randomUUID()
const userB = randomUUID()
const libId = randomUUID()
const slug = `wf03-test-${libId.slice(0, 8)}`

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

function asUser(user: string | null, body: string, extra = ""): string {
  const claims = user ? JSON.stringify({ sub: user, role: "authenticated" }) : "{}"
  return `begin;
set local role authenticated;
select set_config('request.jwt.claims', ${q(claims)}, true);
${body}
${extra}
commit;`
}

function ex(order: number, over: Record<string, unknown> = {}) {
  return {
    exercise_id: libId,
    exercise_name: `Test lift ${order}`,
    exercise_order: order,
    target_sets: 3,
    rep_min: 8,
    rep_max: 12,
    rest_seconds: 90,
    tempo: null,
    rir: 2,
    notes: null,
    ...over,
  }
}

function payload(over: { name?: string; clientId?: string | null; days?: unknown[] } = {}) {
  return {
    plan: {
      client_id: over.clientId ?? null,
      name: over.name ?? "WF03 plan",
      description: null,
      goal: null,
      weeks: 4,
      days_per_week: 2,
      session_duration_minutes: 60,
    },
    days: over.days ?? [
      { day_number: 1, name: "Push", focus: "chest", notes: null, rest_day: false, exercises: [ex(1), ex(2)] },
      { day_number: 2, name: "Pull", focus: "back", notes: null, rest_day: false, exercises: [ex(1)] },
    ],
  }
}

function call(user: string | null, p: unknown, key: string | null, extra = "") {
  const keyArg = key ? `, ${q(key)}::uuid` : ""
  return asUser(user, `select public.create_workout_plan(${q(JSON.stringify(p))}::jsonb${keyArg})::text;`, extra)
}

function parseResult(out: string): { plan_id: string; replayed: boolean } {
  const line = out.split("\n").find((l) => l.startsWith("{") && l.includes("plan_id"))
  if (!line) throw new Error(`no result in: ${out}`)
  return JSON.parse(line)
}

/** Counts as superuser (bypasses RLS) so a partial graph can never hide. */
function counts(owner: string): { plans: number; days: number; exercises: number } {
  const r = run(`
select (select count(*) from workout_plans where created_by = ${q(owner)}) || ',' ||
       (select count(*) from workout_days d join workout_plans p on p.id = d.workout_plan_id where p.created_by = ${q(owner)}) || ',' ||
       (select count(*) from workout_exercises e join workout_days d on d.id = e.workout_day_id join workout_plans p on p.id = d.workout_plan_id where p.created_by = ${q(owner)});`)
  const [plans, days, exercises] = r.out.trim().split(",").map(Number)
  return { plans, days, exercises }
}

function wipe(): void {
  run(`delete from workout_plans where created_by in (${q(userA)}, ${q(userB)});`)
}

describe.skipIf(!dbReady)("create_workout_plan (atomic + idempotent, real DB)", () => {
  beforeAll(() => {
    const r = run(`
insert into auth.users (id, aud, role, email) values
  (${q(userA)}, 'authenticated', 'authenticated', 'wf03-a-${userA}@example.test'),
  (${q(userB)}, 'authenticated', 'authenticated', 'wf03-b-${userB}@example.test');
insert into exercise_library (id, slug, name, primary_muscle, equipment)
  values (${q(libId)}, ${q(slug)}, 'WF03 test lift', 'chest', 'barbell');`)
    expect(r.err).toBe("")
  })

  afterAll(() => {
    wipe()
    run(`delete from exercise_library where id = ${q(libId)};
delete from auth.users where id in (${q(userA)}, ${q(userB)});`)
  })

  it("success: persists exactly one plan, its days and exercises with correct FKs", () => {
    wipe()
    const r = run(call(userA, payload(), null))
    expect(r.err).toBe("")
    const res = parseResult(r.out)
    expect(res.replayed).toBe(false)
    expect(counts(userA)).toEqual({ plans: 1, days: 2, exercises: 3 })

    const check = run(`
select (p.id = ${q(res.plan_id)}::uuid and p.client_id = ${q(userA)}::uuid and p.created_by = ${q(userA)}::uuid and p.status = 'draft')::text
from workout_plans p where p.created_by = ${q(userA)};
select count(*) from workout_days d where d.workout_plan_id = ${q(res.plan_id)} and d.day_number = d.day_order;
select count(*) from workout_exercises e join workout_days d on d.id = e.workout_day_id
  where d.workout_plan_id = ${q(res.plan_id)} and e.exercise_id = ${q(libId)} and e.exercise_name like 'Test lift%';`)
    const lines = check.out.trim().split("\n")
    expect(lines[0]).toBe("true")
    expect(lines[1]).toBe("2")
    expect(lines[2]).toBe("3")
  })

  it("A: child failure on the LAST exercise rolls back plan, days and exercises", () => {
    wipe()
    const days = [
      { day_number: 1, name: "Push", focus: null, notes: null, rest_day: false, exercises: [ex(1), ex(2)] },
      // rep_min > rep_max violates workout_exercises_rep_range_check AFTER parent+day+3 rows were inserted
      { day_number: 2, name: "Pull", focus: null, notes: null, rest_day: false, exercises: [ex(1), ex(2, { rep_min: 20, rep_max: 5 })] },
    ]
    const r = run(call(userA, payload({ days }), null))
    expect(r.ok).toBe(false)
    expect(r.err).toContain("workout_exercises_rep_range_check")
    expect(counts(userA)).toEqual({ plans: 0, days: 0, exercises: 0 })
  })

  it("F: invalid child payloads (bad uuid, duplicate order, bad day) persist nothing", () => {
    wipe()
    const cases: Record<string, unknown[]> = {
      "malformed exercise_id": [{ day_number: 1, name: "Push", exercises: [ex(1), ex(2, { exercise_id: "not-a-uuid" })] }],
      "duplicate exercise_order": [{ day_number: 1, name: "Push", exercises: [ex(1), ex(1)] }],
      "duplicate day_number": [
        { day_number: 1, name: "Push", exercises: [ex(1)] },
        { day_number: 1, name: "Again", exercises: [ex(1)] },
      ],
      "unknown library exercise (FK)": [{ day_number: 1, name: "Push", exercises: [ex(1, { exercise_id: randomUUID() })] }],
    }
    for (const [label, days] of Object.entries(cases)) {
      const r = run(call(userA, payload({ days }), null))
      expect(r.ok, label).toBe(false)
      expect(counts(userA), label).toEqual({ plans: 0, days: 0, exercises: 0 })
    }
  })

  it("B: replay with the same key and request returns the original result, no duplicates", () => {
    wipe()
    const key = randomUUID()
    const first = parseResult(run(call(userA, payload(), key)).out)
    const second = parseResult(run(call(userA, payload(), key)).out)
    expect(second.plan_id).toBe(first.plan_id)
    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(counts(userA)).toEqual({ plans: 1, days: 2, exercises: 3 })
  })

  it("C: same key with a different payload is rejected and mutates nothing", () => {
    wipe()
    const key = randomUUID()
    const first = parseResult(run(call(userA, payload({ name: "Original" }), key)).out)
    const r = run(call(userA, payload({ name: "Changed" }), key))
    expect(r.ok).toBe(false)
    expect(r.err).toContain("IDEMPOTENCY_CONFLICT")
    expect(counts(userA)).toEqual({ plans: 1, days: 2, exercises: 3 })
    const name = run(`select name from workout_plans where id = ${q(first.plan_id)};`).out.trim()
    expect(name).toBe("Original")
  })

  it("D: another user using the same key neither replays nor touches the first user's plan", () => {
    wipe()
    const key = randomUUID()
    const a = parseResult(run(call(userA, payload({ name: "A plan" }), key)).out)
    const b = parseResult(run(call(userB, payload({ name: "A plan" }), key)).out)
    expect(b.plan_id).not.toBe(a.plan_id)
    expect(b.replayed).toBe(false)
    expect(counts(userA)).toEqual({ plans: 1, days: 2, exercises: 3 })
    expect(counts(userB)).toEqual({ plans: 1, days: 2, exercises: 3 })

    // B cannot read A's plan through RLS either.
    const seen = run(asUser(userB, `select count(*) from workout_plans where id = ${q(a.plan_id)};`)).out
    expect(seen.split("\n").filter((l) => /^\d+$/.test(l.trim()))).toEqual(["0"])
  })

  it("D2: a user cannot create a plan for someone else's client_id (no cross-user write)", () => {
    wipe()
    const r = run(call(userB, payload({ clientId: userA }), randomUUID()))
    expect(r.ok).toBe(false)
    expect(r.err).toContain("ACTION_FORBIDDEN")
    expect(counts(userA).plans + counts(userB).plans).toBe(0)
  })

  it("unauthenticated callers are rejected", () => {
    wipe()
    const r = run(call(null, payload(), null))
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/ACTION_FORBIDDEN|permission denied|auth/i)
    expect(counts(userA).plans).toBe(0)
  })

  it("E: two overlapping transactions with the same key yield exactly one logical result", async () => {
    wipe()
    const key = randomUUID()
    // First txn holds its (uncommitted) insert for 3s; the second starts while it is open and
    // must block on the unique index, then resolve to the first's plan instead of inserting.
    const slow = runAsync(call(userA, payload(), key, "select pg_sleep(3);"))
    await new Promise((r) => setTimeout(r, 1200))
    const fast = runAsync(call(userA, payload(), key))
    const [x, y] = await Promise.all([slow, fast])
    expect(x.ok && y.ok, `${x.err}${y.err}`).toBe(true)
    const rx = parseResult(x.out)
    const ry = parseResult(y.out)
    expect(ry.plan_id).toBe(rx.plan_id)
    expect([rx.replayed, ry.replayed].sort()).toEqual([false, true])
    expect(counts(userA)).toEqual({ plans: 1, days: 2, exercises: 3 })
  }, 30_000)

  it("no key: still atomic, but makes no replay-protection claim (two calls -> two plans)", () => {
    wipe()
    run(call(userA, payload(), null))
    run(call(userA, payload(), null))
    expect(counts(userA)).toEqual({ plans: 2, days: 4, exercises: 6 })
  })
})
