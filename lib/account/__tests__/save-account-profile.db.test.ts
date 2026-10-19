// @vitest-environment node
/**
 * DB-02-01 integration: public.save_account_profile against the REAL local migrations-built Postgres
 * (never hosted). Runs as role `authenticated` with a JWT sub so RLS + auth.uid() apply.
 * Skipped only when the container/function is unavailable.
 */
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"

function run(sql: string) {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql, encoding: "utf8" })
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" }
}

const dbReady = (() => {
  const r = run("select 1 from pg_proc where proname = 'save_account_profile';")
  return r.ok && r.out.trim() === "1"
})()

const A = randomUUID()
const B = randomUUID()
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

function save(user: string | null, payload: Record<string, unknown>) {
  const claims = user ? JSON.stringify({ sub: user, role: "authenticated", email: "a@example.test" }) : "{}"
  return run(`begin;
set local role authenticated;
select set_config('request.jwt.claims', ${q(claims)}, true);
select public.save_account_profile(${q(JSON.stringify(payload))}::jsonb)::text;
commit;`)
}

const payload = (over: Record<string, unknown> = {}) => ({
  full_name: "Ann Lee", username: "ann", phone: null, date_of_birth: "1995-04-02", gender: "non_binary",
  timezone: "Asia/Tokyo", height_cm: 170, weight_kg: 65, goal: "muscle_gain", ...over,
})

const state = (u: string) =>
  run(`select coalesce((select row_to_json(p)::text from (select full_name, gender, date_of_birth, timezone from profiles where user_id=${q(u)}) p),'-') || '|' ||
       coalesce((select row_to_json(f)::text from (select height_cm, weight_kg, goal from fitness_profiles where user_id=${q(u)}) f),'-');`).out.trim()

describe.skipIf(!dbReady)("save_account_profile (atomic, real DB)", () => {
  beforeAll(() => {
    const r = run(`insert into auth.users (id, aud, role, email) values
      (${q(A)}, 'authenticated','authenticated','acct-a-${A}@example.test'),
      (${q(B)}, 'authenticated','authenticated','acct-b-${B}@example.test');
      delete from fitness_profiles where user_id in (${q(A)}, ${q(B)});
      delete from profiles where user_id in (${q(A)}, ${q(B)});`)
    expect(r.err).toBe("")
  })
  afterAll(() => {
    run(`delete from auth.users where id in (${q(A)}, ${q(B)});`)
  })

  it("success: writes profiles and fitness_profiles with canonical columns/enum", () => {
    const r = save(A, payload())
    expect(r.err).toBe("")
    const [p, f] = state(A).split("|").map((x) => JSON.parse(x))
    expect(p).toMatchObject({ full_name: "Ann Lee", gender: "non_binary", date_of_birth: "1995-04-02", timezone: "Asia/Tokyo" })
    expect(f).toMatchObject({ height_cm: 170, weight_kg: 65, goal: "muscle_gain" })
  })

  it('enum: legacy "other" is rejected by the DB and nothing changes', () => {
    const before = state(A)
    const r = save(A, payload({ full_name: "Changed", gender: "other" }))
    expect(r.ok).toBe(false)
    expect(state(A)).toBe(before)
  })

  it("forced second-write failure rolls back the first write (no partial save)", () => {
    const before = state(A)
    // height 10 violates fitness_profiles_height_range AFTER profiles was already upserted in the same call
    const r = save(A, payload({ full_name: "Partial?", height_cm: 10 }))
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/fitness_profiles_height_range/)
    expect(state(A)).toBe(before)
    expect(state(A)).not.toMatch(/Partial\?/)
  })

  it("does not fabricate a fitness_profiles row when no fitness value is supplied", () => {
    const r = save(B, payload({ height_cm: null, weight_kg: null, goal: null }))
    expect(r.err).toBe("")
    expect(state(B).endsWith("|-")).toBe(true)
  })

  it("authorization: no session is forbidden; actor is auth.uid() only", () => {
    expect(save(null, payload()).err).toMatch(/ACTION_FORBIDDEN/)
    const before = state(B)
    // a client-supplied user_id in the payload is ignored: it cannot redirect the write to another user
    save(A, { ...payload({ full_name: "Mallory" }), user_id: B })
    expect(state(B)).toBe(before)
  })
})
