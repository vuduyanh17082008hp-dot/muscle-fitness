// @vitest-environment node
/**
 * SetVision save → reload against a LOCAL migrations-built Supabase only (never hosted): the route handlers run
 * as the signed-in user through real PostgREST + RLS. Proves the rep timeline survives the round trip, another
 * user can't read or link to it, historical rows still restore, and saving touches no workout history.
 * MF_TEST_DB_CONTAINER / MF_TEST_API_URL pick the stack; skipped when it is unavailable.
 */
import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { analyzeFrameSequence } from "@/lib/setvision/analyze"
import { buildRepSequence, squatFrame } from "@/lib/setvision/__tests__/fixtures"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const app = vi.hoisted(() => ({ uid: "" }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient(app.uid) }))
// Event fan-out (app_events + daily intelligence) is not under test and needs a Next request scope.
vi.mock("@/lib/events/emit", () => ({ emitEvent: async () => {} }))

const API_URL = process.env.MF_TEST_API_URL ?? "http://127.0.0.1:54331"
const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long" // well-known local demo secret
function localJwt(claims: Record<string, unknown>) {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url")
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iss: "supabase-demo", exp: 1983812996, ...claims })}`
  return `${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(body).digest("base64url")}`
}
function userClient(uid: string) {
  const token = uid ? localJwt({ sub: uid, role: "authenticated", aud: "authenticated" }) : localJwt({ role: "anon" })
  const client = createSupabaseClient(API_URL, localJwt({ role: "anon" }), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  client.auth.getUser = (async () => ({ data: { user: uid ? { id: uid } : null }, error: null })) as unknown as typeof client.auth.getUser
  return client
}

const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"
function run(sql: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", process.env.MF_TEST_DB_NAME ?? "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    encoding: "utf8",
  })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" }
}

const dbReady = (() => {
  const r = run("select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'setvision_analyses';")
  if (!(r.ok && r.out === "1")) return false
  // The PostgREST endpoint must be the same stack as the container.
  const probe = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", `${API_URL}/rest/v1/`], { encoding: "utf8" })
  return probe.status === 0 && probe.stdout !== "000"
})()

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const owner = randomUUID()
const intruder = randomUUID()
const ownerSession = randomUUID()
const intruderSession = randomUUID()
const legacyId = randomUUID()

const frames = buildRepSequence(squatFrame, 3, { frameIntervalMs: 100 })
const videoDurationMs = frames.at(-1)!.timestampMs + 100
const analysis = analyzeFrameSequence(frames, { exercise: "squat" })

async function call(uid: string, method: "GET" | "POST", query = "", body?: unknown) {
  app.uid = uid
  const { GET, POST } = await import("../route")
  const req = new Request(`http://localhost/api/setvision/results${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = method === "GET" ? await GET(req) : await POST(req)
  return { status: res.status, json: await res.json() }
}

const save = (uid: string, extra: Record<string, unknown> = {}) =>
  call(uid, "POST", "", { analysis, videoDurationMs, exerciseKey: "catalogue:barbell-back-squat", exerciseSource: "catalogue", ...extra })

const workoutHistory = (uid: string) =>
  run(`select (select count(*) from workout_sessions where user_id = ${q(uid)}) || ',' ||
  (select count(*) from workout_session_exercises e join workout_sessions w on w.id = e.workout_session_id where w.user_id = ${q(uid)}) || ',' ||
  (select count(*) from exercise_sets s join workout_session_exercises e on e.id = s.session_exercise_id join workout_sessions w on w.id = e.workout_session_id where w.user_id = ${q(uid)});`).out

describe.skipIf(!dbReady)("SetVision results save → reload (real DB)", () => {
  beforeAll(() => {
    const r = run(`insert into auth.users (id, aud, role, email) values
  (${q(owner)}, 'authenticated', 'authenticated', 'sv-owner-${owner}@example.test'),
  (${q(intruder)}, 'authenticated', 'authenticated', 'sv-intruder-${intruder}@example.test');
insert into workout_sessions (id, user_id, title, scheduled_date) values (${q(ownerSession)}, ${q(owner)}, 'Own', current_date), (${q(intruderSession)}, ${q(intruder)}, 'Theirs', current_date);
insert into setvision_analyses (id, user_id, exercise, reps, confidence, per_rep, limitations) values (${q(legacyId)}, ${q(owner)}, 'squat', 1, 0.77,
  '{"rom":[{"repNumber":1,"romPercent":182}],"tempo":[{"repNumber":1,"eccentricSec":1.2,"pauseSec":0.3,"concentricSec":1.1}]}', '[]');`)
    expect(r.err).toBe("")
  })

  afterAll(() => {
    if (!dbReady) return
    run(`delete from setvision_analyses where user_id in (${q(owner)}, ${q(intruder)});
delete from workout_sessions where user_id in (${q(owner)}, ${q(intruder)});
delete from auth.users where id in (${q(owner)}, ${q(intruder)});`)
  })

  it("an anonymous caller can neither save nor read", async () => {
    expect((await save("")).status).toBe(401)
    expect((await call("", "GET", `?id=${legacyId}`)).status).toBe(401)
  })

  it("saves, and the stored row and the reload both keep every rep timestamp", async () => {
    expect(analysis.reps).toBe(3)
    const before = workoutHistory(owner)
    const saved = await save(owner)
    expect(saved.status).toBe(200)
    expect(saved.json.ok).toBe(true)

    // Straight from Postgres: jsonb holds the boundaries, the duration and the server-resolved identity.
    const stored = JSON.parse(run(`select per_rep::text from setvision_analyses where id = ${q(saved.json.id)};`).out)
    expect(stored.tempo).toEqual(analysis.perRep.tempo)
    expect(stored.videoDurationMs).toBe(videoDurationMs)
    expect(stored.identity).toEqual({ key: "catalogue:barbell-back-squat", label: "Barbell Back Squat", source: "catalogue", catalogueId: "10000000-0000-4000-8000-000000000011" })
    expect(run(`select exercise_classification_confidence is null from setvision_analyses where id = ${q(saved.json.id)};`).out).toBe("t")

    const reloaded = await call(owner, "GET", `?id=${saved.json.id}`)
    expect(reloaded.status).toBe(200)
    expect(reloaded.json.result.timelineRecorded).toBe(true)
    expect(reloaded.json.result.analysis.perRep.tempo).toEqual(analysis.perRep.tempo)
    expect(reloaded.json.result.analysis.perRep.rom).toEqual(analysis.perRep.rom)
    expect(reloaded.json.result.analysis.reps).toBe(3)
    expect(reloaded.json.result.identity.label).toBe("Barbell Back Squat")

    // Saving an analysis creates no workout session, exercise or set.
    expect(workoutHistory(owner)).toBe(before)
  })

  it("another user cannot read the analysis (404), list it, or see it through PostgREST", async () => {
    const saved = await save(owner)
    expect((await call(intruder, "GET", `?id=${saved.json.id}`)).status).toBe(404)
    const list = await call(intruder, "GET")
    expect(list.json.results.map((r: { id: string }) => r.id)).not.toContain(saved.json.id)
    const direct = await userClient(intruder).from("setvision_analyses").select("id").eq("id", saved.json.id)
    expect(direct.data).toEqual([])
  })

  it("refuses to link an analysis to someone else's workout, or to a video outside the caller's folder", async () => {
    expect((await save(owner, { workoutSessionId: intruderSession })).status).toBe(404)
    expect((await save(owner, { videoStoragePath: `${intruder}/1.mp4` })).status).toBe(400)
    const own = await save(owner, { workoutSessionId: ownerSession, videoStoragePath: `${owner}/1.mp4` })
    expect(own.status).toBe(200)
    expect(run(`select workout_session_id from setvision_analyses where id = ${q(own.json.id)};`).out).toBe(ownerSession)
  })

  it("rejects an inconsistent timeline instead of storing it", async () => {
    const broken = structuredClone(analysis)
    broken.perRep.tempo[0].repEndMs = videoDurationMs + 10_000
    const count = run(`select count(*) from setvision_analyses where user_id = ${q(owner)};`).out
    expect((await call(owner, "POST", "", { analysis: broken, videoDurationMs, exerciseKey: "setvision:squat", exerciseSource: "setvision" })).status).toBe(400)
    expect(run(`select count(*) from setvision_analyses where user_id = ${q(owner)};`).out).toBe(count)
  })

  it("saves a custom exercise as a manual review: NULL metrics (not 0), the user's reps and notes, nothing added to the catalogue", async () => {
    // Scoped to the name: other DB suites insert catalogue rows in parallel.
    const catalogueRows = () => run("select count(*) from public.workout_exercises where name ilike '%landmine row%';").out
    const catalogueBefore = catalogueRows()
    const before = workoutHistory(owner)
    const review = { rejectedReps: [], manualReps: [{ startMs: 1000, endMs: 2500 }, { startMs: 3000, endMs: 4200 }], notes: "Tempo 3-1-1, 20 kg", unsure: true }
    const saved = await call(owner, "POST", "", { analysis: null, videoDurationMs: 30_000, exerciseKey: null, exerciseSource: "custom", customLabel: "  Landmine  Row ", review, videoStoragePath: `${owner}/2.mp4` })
    expect(saved.status).toBe(200)

    const stored = run(`select exercise || '|' || coalesce(reps::text, 'NULL') || '|' || coalesce(confidence::text, 'NULL') || '|' || (per_rep->'identity')::text from setvision_analyses where id = ${q(saved.json.id)};`).out
    expect(stored).toBe('manual_review|NULL|NULL|{"key": null, "label": "Landmine Row", "source": "custom", "catalogueId": null}')
    expect(catalogueRows()).toBe(catalogueBefore)
    expect(workoutHistory(owner)).toBe(before)

    const reloaded = await call(owner, "GET", `?id=${saved.json.id}`)
    expect(reloaded.status).toBe(200)
    expect(reloaded.json.result.analysis).toBeNull()
    expect(reloaded.json.result.identity).toEqual({ key: null, label: "Landmine Row", source: "custom", catalogueId: null })
    expect(reloaded.json.result.review).toEqual(review)

    const listed = (await call(owner, "GET")).json.results.find((r: { id: string }) => r.id === saved.json.id)
    expect(listed).toMatchObject({ exercise: "manual_review", reps: null, identity: { label: "Landmine Row" }, review: { manualReps: review.manualReps } })

    // Tenant isolation holds for reviews too.
    expect((await call(intruder, "GET", `?id=${saved.json.id}`)).status).toBe(404)
  })

  it("refuses a custom name that fails validation, and a custom save that smuggles in an engine analysis", async () => {
    const count = run(`select count(*) from setvision_analyses where user_id = ${q(owner)};`).out
    expect((await call(owner, "POST", "", { analysis: null, videoDurationMs: 30_000, exerciseKey: null, exerciseSource: "custom", customLabel: "\u0000" })).status).toBe(400)
    expect((await call(owner, "POST", "", { analysis, videoDurationMs, exerciseKey: null, exerciseSource: "custom", customLabel: "My squat" })).status).toBe(400)
    expect(run(`select count(*) from setvision_analyses where user_id = ${q(owner)};`).out).toBe(count)
  })

  it("saves a new movement-family engine (pulldown) with the user's rejected rep kept apart from the engine's count", async () => {
    const pull = structuredClone(analysis)
    pull.exercise = "vertical_pull"
    pull.perRep.tempo = pull.perRep.tempo.map((t) => ({ ...t, eccentricSec: t.concentricSec, concentricSec: t.eccentricSec }))
    const saved = await call(owner, "POST", "", {
      analysis: pull, videoDurationMs, exerciseKey: "catalogue:lat-pulldown", exerciseSource: "catalogue",
      review: { rejectedReps: [3], manualReps: [], notes: "", unsure: false },
    })
    expect(saved.status).toBe(200)
    expect(run(`select exercise || '|' || reps from setvision_analyses where id = ${q(saved.json.id)};`).out).toBe("vertical_pull|3")
    const reloaded = (await call(owner, "GET", `?id=${saved.json.id}`)).json.result
    expect(reloaded.analysis.reps).toBe(3)
    expect(reloaded.review.rejectedReps).toEqual([3])
    expect(reloaded.identity.label).toBe("Lat Pulldown")
  })

  it("restores a historical row saved before timestamps were kept, without inventing them", async () => {
    const legacy = await call(owner, "GET", `?id=${legacyId}`)
    expect(legacy.status).toBe(200)
    expect(legacy.json.result.timelineRecorded).toBe(false)
    expect(legacy.json.result.analysis.perRep.tempo[0].ascentStartMs).toBeNull()
    expect(legacy.json.result.analysis.perRep.rom).toEqual([])
    expect(legacy.json.result.identity).toBeNull()
  })
})
