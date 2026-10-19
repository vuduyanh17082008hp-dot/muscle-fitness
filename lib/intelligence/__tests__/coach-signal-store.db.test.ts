// @vitest-environment node
/**
 * AI-R1E.1 coach_signals tests against the LOCAL Docker Supabase only (never hosted).
 * Part 1: SQL-level (psql in the db container): RLS, privileges, constraints, idempotency, supersession, privacy trigger.
 * Part 2: adapter + Dante runtime through real PostgREST with locally-minted JWTs (service role for writes, user JWT for reads).
 * Skipped when the container / migration is unavailable.
 */
import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { CoachSignal } from "../coordination"
import { loadActiveCoachSignalsForDomain, persistCoachSignal } from "../coach-signal-store"
import { persistDanteSignals } from "../dante-signal-persistence"
import { buildDanteIntelligence, toUserScopeRef, type DanteTurnInput } from "../dante-runtime"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"
const AUTH_CONTAINER = process.env.MF_TEST_AUTH_CONTAINER ?? "supabase_auth_muscle-fitness-claude"

function run(sql: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", process.env.MF_TEST_DB_NAME ?? "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    encoding: "utf8",
  })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" }
}

const dbReady = (() => {
  const r = run("select count(*) from information_schema.tables where table_schema='public' and table_name='coach_signals';")
  return r.ok && r.out === "1"
})()

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const userA = randomUUID()
const userB = randomUUID()
const tag = randomUUID().slice(0, 8)
const now = new Date()
const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString()
const HOUR = 3_600_000

function payload(over: Record<string, unknown> = {}) {
  return {
    signal_id: `sig:${tag}:${randomUUID().slice(0, 8)}`,
    idempotency_key: `idem:${tag}:${randomUUID().slice(0, 8)}`,
    producer: "DANTE",
    source_domain: "RECOVERY",
    target_domains: ["NUTRITION"],
    signal_type: "LOW_RECOVERY",
    status: "CROSS_COACH_VERIFIED",
    uncertainty: "MODERATE_SUPPORT",
    identifiability: "PARTIALLY_IDENTIFIED",
    privacy_class: "NORMAL",
    evidence_refs: ["ev:recovery_status"],
    provenance: ["dante:athlete_state"],
    implications: [{ targetDomain: "NUTRITION", type: "RECOMMENDATION_CONTEXT", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL" }],
    supersedes: [],
    valid_from: iso(-HOUR),
    valid_until: iso(HOUR),
    ...over,
  }
}

const asService = (uid: string, body: unknown) => run(`begin; set local role service_role; select public.persist_coach_signal(${q(uid)}::uuid, ${q(JSON.stringify(body))}::jsonb)::text; commit;`)
const publish = (uid: string, body: unknown) => {
  const r = asService(uid, body)
  expect(r.err).toBe("")
  return JSON.parse(r.out.split("\n").find((l) => l.startsWith("{"))!) as { status: string; superseded: number }
}
function asUser(uid: string, body: string) {
  const claims = JSON.stringify({ sub: uid, role: "authenticated" })
  return run(`begin; set local role authenticated; select set_config('request.jwt.claims', ${q(claims)}, true); ${body} commit;`)
}
const count = (where: string) => Number(run(`select count(*) from public.coach_signals where user_id in (${q(userA)}, ${q(userB)}) and ${where};`).out)

beforeAll(() => {
  if (!dbReady) return
  const r = run(`insert into auth.users (id, email, aud, role) values (${q(userA)}, ${q(`r1e1a.${tag}@example.com`)}, 'authenticated', 'authenticated'), (${q(userB)}, ${q(`r1e1b.${tag}@example.com`)}, 'authenticated', 'authenticated');`)
  expect(r.err).toBe("")
})
afterAll(() => {
  if (dbReady) run(`delete from auth.users where id in (${q(userA)}, ${q(userB)});`)
})

describe.skipIf(!dbReady)("coach_signals — SQL level", () => {
  const sigA = payload({ privacy_class: "SENSITIVE" })

  it("6. service-role insert succeeds", () => {
    expect(publish(userA, sigA)).toEqual({ status: "INSERTED", superseded: 0 })
  })

  it("1. owner SELECT succeeds / 2. cross-user SELECT blocked", () => {
    const own = asUser(userA, "select count(*) from public.coach_signals;")
    expect(own.err).toBe("")
    expect(own.out.split("\n").find((l) => /^\d+$/.test(l))).toBe("1")
    const other = asUser(userB, "select count(*) from public.coach_signals;")
    expect(other.out.split("\n").find((l) => /^\d+$/.test(l))).toBe("0")
  })

  it("3/4/5. authenticated INSERT, UPDATE, DELETE (and TRUNCATE) are blocked", () => {
    const row = payload()
    const ins = asUser(userA, `insert into public.coach_signals (signal_id,user_id,idempotency_key,producer,source_domain,target_domains,signal_type,status,uncertainty,identifiability,privacy_class,evidence_refs,provenance,valid_from,valid_until) values (${q(row.signal_id)},${q(userA)},${q(row.idempotency_key)},'DANTE','RECOVERY','{NUTRITION}','X','INFERENCE','UNRESOLVED','NONE','NORMAL','{e}','{p}',now(),now()+interval '1 hour');`)
    expect(ins.ok).toBe(false)
    expect(ins.err).toMatch(/permission denied/)
    for (const stmt of ["update public.coach_signals set lifecycle='WITHDRAWN';", "delete from public.coach_signals;", "truncate public.coach_signals;"]) {
      const r = asUser(userA, stmt)
      expect(r.ok, stmt).toBe(false)
      expect(r.err, stmt).toMatch(/permission denied/)
    }
    expect(asUser(userA, `select public.persist_coach_signal(${q(userA)}::uuid, '{}'::jsonb);`).err).toMatch(/permission denied/)
  })

  it("7. duplicate idempotency key does not create another row (first publication wins)", () => {
    const first = payload({ privacy_class: "NORMAL", signal_type: "FIRST" })
    expect(publish(userA, first).status).toBe("INSERTED")
    const dup = publish(userA, { ...payload({ signal_type: "SECOND" }), idempotency_key: first.idempotency_key })
    expect(dup).toEqual({ status: "DUPLICATE", superseded: 0 })
    expect(count(`idempotency_key = ${q(first.idempotency_key)}`)).toBe(1)
    expect(run(`select signal_type from public.coach_signals where idempotency_key = ${q(first.idempotency_key)};`).out).toBe("FIRST")
  })

  it("8. duplicate signal_id is scoped per user: rejected for the same user, allowed for another", () => {
    const base = payload()
    publish(userA, base)
    const clash = asService(userA, { ...payload(), signal_id: base.signal_id })
    expect(clash.ok).toBe(false)
    expect(clash.err).toMatch(/duplicate key|23505/)
    expect(asService(userB, { ...payload(), signal_id: base.signal_id }).err).toBe("")
  })

  it("9/10. supersession marks old ACTIVE signals atomically and keeps them (with evidence + provenance)", () => {
    const oldSig = payload({ signal_type: "OLD" })
    publish(userA, oldSig)
    const newSig = payload({ signal_type: "NEW", supersedes: [oldSig.signal_id] })
    expect(publish(userA, newSig)).toEqual({ status: "INSERTED", superseded: 1 })
    const row = run(`select lifecycle || '|' || superseded_by || '|' || evidence_refs[1] || '|' || provenance[1] from public.coach_signals where signal_id = ${q(oldSig.signal_id)};`).out
    expect(row).toBe(`SUPERSEDED|${newSig.signal_id}|ev:recovery_status|dante:athlete_state`)
    expect(count(`signal_id = ${q(newSig.signal_id)} and lifecycle = 'ACTIVE'`)).toBe(1)
  })

  it("9b. a failed publication supersedes nothing (single transaction)", () => {
    const keep = payload()
    publish(userA, keep)
    const bad = asService(userA, { ...payload({ supersedes: [keep.signal_id] }), evidence_refs: [] })
    expect(bad.ok).toBe(false)
    expect(count(`signal_id = ${q(keep.signal_id)} and lifecycle = 'ACTIVE'`)).toBe(1)
  })

  it("9c. supersession never touches another user's signal", () => {
    const victim = payload()
    publish(userB, victim)
    publish(userA, payload({ supersedes: [victim.signal_id] }))
    expect(count(`signal_id = ${q(victim.signal_id)} and lifecycle = 'ACTIVE'`)).toBe(1)
  })

  it("17. MEDICAL privacy never downgrades; signal meaning is immutable; terminal lifecycle stays terminal", () => {
    const med = payload({ privacy_class: "MEDICAL" })
    publish(userA, med)
    const svc = (stmt: string) => run(`begin; set local role service_role; ${stmt} commit;`)
    expect(svc(`update public.coach_signals set privacy_class='NORMAL' where signal_id=${q(med.signal_id)} and user_id=${q(userA)};`).err).toMatch(/may not be downgraded/)
    expect(svc(`update public.coach_signals set privacy_class='SENSITIVE' where signal_id=${q(med.signal_id)} and user_id=${q(userA)};`).err).toMatch(/may not be downgraded/)
    expect(svc(`update public.coach_signals set signal_type='OTHER' where signal_id=${q(med.signal_id)} and user_id=${q(userA)};`).err).toMatch(/immutable/)
    expect(svc(`update public.coach_signals set lifecycle='WITHDRAWN' where signal_id=${q(med.signal_id)} and user_id=${q(userA)};`).err).toBe("")
    expect(svc(`update public.coach_signals set lifecycle='ACTIVE' where signal_id=${q(med.signal_id)} and user_id=${q(userA)};`).err).toMatch(/terminal/)
    expect(svc(`delete from public.coach_signals where signal_id=${q(med.signal_id)};`).err).toMatch(/permission denied/)
  })

  it("18/19. PERFORMANCE and GLOBAL persist as source_domain and target_domains", () => {
    const p = payload({ source_domain: "PERFORMANCE", target_domains: ["PERFORMANCE", "GLOBAL"] })
    const g = payload({ source_domain: "GLOBAL", target_domains: ["GLOBAL", "TRAINING", "RECOVERY", "NUTRITION", "PERFORMANCE"] })
    publish(userA, p)
    publish(userA, g)
    expect(count(`signal_id = ${q(p.signal_id)} and source_domain = 'PERFORMANCE' and target_domains @> '{GLOBAL}'`)).toBe(1)
    expect(count(`signal_id = ${q(g.signal_id)} and source_domain = 'GLOBAL' and cardinality(target_domains) = 5`)).toBe(1)
  })

  it("21. malformed validity window rejected", () => {
    expect(asService(userA, payload({ valid_from: iso(HOUR), valid_until: iso(-HOUR) })).err).toMatch(/coach_signals_validity_window/)
    expect(asService(userA, payload({ valid_from: iso(0), valid_until: iso(0) })).err).toMatch(/coach_signals_validity_window/)
  })

  it("22/23/24. empty evidence_refs, provenance and target_domains are rejected (and unknown domains / privacy)", () => {
    expect(asService(userA, payload({ evidence_refs: [] })).err).toMatch(/evidence_refs/)
    expect(asService(userA, payload({ provenance: [] })).err).toMatch(/provenance/)
    expect(asService(userA, payload({ target_domains: [] })).err).toMatch(/target_domains/)
    expect(asService(userA, payload({ target_domains: ["COOKING"] })).err).toMatch(/target_domains/)
    expect(asService(userA, payload({ privacy_class: "PUBLIC" })).err).toMatch(/privacy_class/)
  })
})

// ───────────────────────── Part 2: adapter + Dante through real PostgREST ─────────────────────────

function mintJwt(secret: string, claims: Record<string, unknown>): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url")
  const head = enc({ alg: "HS256", typ: "JWT" })
  const body = enc({ iss: "supabase-demo", exp: Math.floor(Date.now() / 1000) + 3600, ...claims })
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`
}

async function reachableUrl(): Promise<string | null> {
  for (const u of [process.env.MF_TEST_SUPABASE_URL, "http://127.0.0.1:54331", "http://26.169.20.28:54331"]) {
    if (!u) continue
    try {
      const res = await fetch(`${u}/rest/v1/`, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return u
    } catch {
      /* try next */
    }
  }
  return null
}

const jwtSecret = (() => {
  const r = spawnSync("docker", ["exec", AUTH_CONTAINER, "printenv", "GOTRUE_JWT_SECRET"], { encoding: "utf8" })
  return r.status === 0 ? r.stdout.trim() : ""
})()

describe.skipIf(!dbReady || !jwtSecret)("coach signal adapter + Dante runtime (live local PostgREST)", () => {
  let service: SupabaseClient
  let asA: SupabaseClient
  let asB: SupabaseClient
  let live = false

  const mk = (id: string, over: Partial<CoachSignal> = {}, uid = userA): CoachSignal => ({
    id: `sig:${tag}:${id}`,
    schemaVersion: 1,
    idempotencyKey: `idem:${tag}:${id}`,
    userScope: toUserScopeRef(uid),
    privacyClass: "NORMAL",
    lifecycle: "ACTIVE",
    sourceCoach: "DANTE",
    sourceDomain: "RECOVERY",
    signalType: "LOW_RECOVERY",
    status: "CROSS_COACH_VERIFIED",
    evidenceRefs: ["ev:recovery_status"],
    uncertainty: "MODERATE_SUPPORT",
    identifiability: "PARTIALLY_IDENTIFIED",
    implications: [{ targetDomain: "NUTRITION", type: "RECOMMENDATION_CONTEXT", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL", strength: "SOFT" }],
    provenance: ["dante:athlete_state"],
    validFrom: iso(-HOUR),
    validUntil: iso(HOUR),
    ...over,
  })
  const load = (c: SupabaseClient, uid: string, clearance: "NORMAL" | "SENSITIVE" | "MEDICAL" = "MEDICAL", domain: "NUTRITION" | "TRAINING" = "NUTRITION") =>
    loadActiveCoachSignalsForDomain(c, { userId: uid, targetDomain: domain, clearance, now }).then((rows) => rows ?? [])
  const ids = async (c: SupabaseClient, uid: string, clearance?: "NORMAL" | "SENSITIVE" | "MEDICAL") => (await load(c, uid, clearance)).map((s) => s.id)
  const lifecycleOf = (id: string) => run(`select lifecycle from public.coach_signals where signal_id = ${q(`sig:${tag}:${id}`)} and user_id = ${q(userA)};`).out

  beforeAll(async () => {
    const url = await reachableUrl()
    if (!url) return
    live = true
    const opts = { auth: { persistSession: false, autoRefreshToken: false } }
    const key = (role: string, sub?: string) => mintJwt(jwtSecret, { role, ...(sub && { sub }) })
    service = createClient(url, key("service_role"), opts)
    asA = createClient(url, key("anon"), { ...opts, global: { headers: { Authorization: `Bearer ${key("authenticated", userA)}` } } })
    asB = createClient(url, key("anon"), { ...opts, global: { headers: { Authorization: `Bearer ${key("authenticated", userB)}` } } })
  })

  it("PostgREST reachable", () => {
    expect(live, "local PostgREST not reachable").toBe(true)
  })

  it("adapter rejects a mismatched user scope / non-structured tokens / empty targets before the DB", async () => {
    expect(await persistCoachSignal(service, userB, mk("scope"))).toMatchObject({ ok: false, reason: "USER_SCOPE_MISMATCH" })
    expect(await persistCoachSignal(service, userA, mk("free", { provenance: ["the user said they felt dizzy"] }))).toMatchObject({ ok: false, reason: "NON_STRUCTURED_TOKEN" })
    expect(await persistCoachSignal(service, userA, mk("noimpl", { implications: [] }))).toMatchObject({ ok: false, reason: "EMPTY_TARGET_DOMAINS" })
    expect(await persistCoachSignal(service, userA, mk("inactive", { lifecycle: "WITHDRAWN" }))).toMatchObject({ ok: false, reason: "NOT_ACTIVE" })
  })

  it("20/15. NORMAL signal persists and is read by NUTRITION target-domain query (and not by TRAINING)", async () => {
    expect(await persistCoachSignal(service, userA, mk("normal"))).toMatchObject({ ok: true, result: "INSERTED" })
    expect(await ids(asA, userA)).toContain(`sig:${tag}:normal`)
    expect(await ids(service, userA)).toContain(`sig:${tag}:normal`)
    expect((await load(asA, userA, "MEDICAL", "TRAINING")).map((s) => s.id)).not.toContain(`sig:${tag}:normal`)
  })

  it("same-user only: the other user's session and query see nothing", async () => {
    expect(await ids(asB, userA)).toEqual([])
    expect(await ids(asB, userB)).not.toContain(`sig:${tag}:normal`)
  })

  it("11. expired signal excluded from the active read", async () => {
    await persistCoachSignal(service, userA, mk("expired", { validFrom: iso(-3 * HOUR), validUntil: iso(-HOUR) }))
    expect(await ids(asA, userA)).not.toContain(`sig:${tag}:expired`)
    expect(lifecycleOf("expired")).toBe("ACTIVE") // expiry is read-time only
  })

  it("12/13. withdrawn and superseded signals are excluded", async () => {
    await persistCoachSignal(service, userA, mk("wd"))
    await persistCoachSignal(service, userA, mk("old"))
    expect(await ids(asA, userA)).toEqual(expect.arrayContaining([`sig:${tag}:wd`, `sig:${tag}:old`]))
    run(`begin; set local role service_role; update public.coach_signals set lifecycle='WITHDRAWN' where signal_id = ${q(`sig:${tag}:wd`)}; commit;`)
    const r = await persistCoachSignal(service, userA, mk("new", { supersedes: [`sig:${tag}:old`] }))
    expect(r).toMatchObject({ ok: true, result: "INSERTED", superseded: 1 })
    const active = await ids(asA, userA)
    expect(active).not.toContain(`sig:${tag}:wd`)
    expect(active).not.toContain(`sig:${tag}:old`)
    expect(active).toContain(`sig:${tag}:new`)
  })

  it("7b. republishing the same idempotency key through the adapter is a DUPLICATE and changes nothing", async () => {
    const again = await persistCoachSignal(service, userA, mk("normal", { signalType: "CHANGED_MEANING" }))
    expect(again).toMatchObject({ ok: true, result: "DUPLICATE" })
    expect(run(`select signal_type from public.coach_signals where signal_id = ${q(`sig:${tag}:normal`)};`).out).toBe("LOW_RECOVERY")
  })

  it("14. reads do not mutate lifecycle or updated_at", async () => {
    const snap = () => run(`select string_agg(signal_id || lifecycle || updated_at::text, ',' order by signal_id) from public.coach_signals where user_id = ${q(userA)};`).out
    const before = snap()
    await load(asA, userA)
    await load(service, userA)
    expect(snap()).toBe(before)
    expect(lifecycleOf("normal")).toBe("ACTIVE")
  })

  it("16/17. SENSITIVE clearance filtering and MEDICAL never downgraded on write or read", async () => {
    await persistCoachSignal(service, userA, mk("sens", { privacyClass: "SENSITIVE" }))
    await persistCoachSignal(service, userA, mk("med", { privacyClass: "MEDICAL" }))
    await persistCoachSignal(service, userA, mk("medrisk", { privacyClass: "NORMAL", riskFlag: "MEDICAL_RISK" }))
    const normal = await ids(asA, userA, "NORMAL")
    expect(normal).toContain(`sig:${tag}:normal`)
    expect(normal).not.toEqual(expect.arrayContaining([`sig:${tag}:sens`]))
    expect(normal).not.toContain(`sig:${tag}:med`)
    const sens = await ids(asA, userA, "SENSITIVE")
    expect(sens).toContain(`sig:${tag}:sens`)
    expect(sens).not.toContain(`sig:${tag}:med`)
    expect(sens).not.toContain(`sig:${tag}:medrisk`)
    const med = await ids(asA, userA, "MEDICAL")
    expect(med).toEqual(expect.arrayContaining([`sig:${tag}:sens`, `sig:${tag}:med`, `sig:${tag}:medrisk`]))
    // a MEDICAL_RISK flag floors the stored class at MEDICAL even if the caller said NORMAL
    expect(run(`select privacy_class from public.coach_signals where signal_id = ${q(`sig:${tag}:medrisk`)};`).out).toBe("MEDICAL")
  })

  it("18/19. PERFORMANCE and GLOBAL round-trip through the adapter", async () => {
    const impl = (d: "PERFORMANCE" | "GLOBAL") => [{ targetDomain: d, type: "CAUTION" as const, value: "CONTEXT", relevance: "MATERIAL" as const }]
    await persistCoachSignal(service, userA, mk("perf", { sourceDomain: "PERFORMANCE", implications: impl("PERFORMANCE") }))
    await persistCoachSignal(service, userA, mk("glob", { sourceDomain: "GLOBAL", implications: impl("GLOBAL") }))
    const perf = (await loadActiveCoachSignalsForDomain(asA, { userId: userA, targetDomain: "PERFORMANCE", clearance: "NORMAL", now })) ?? []
    const glob = (await loadActiveCoachSignalsForDomain(asA, { userId: userA, targetDomain: "GLOBAL", clearance: "NORMAL", now })) ?? []
    expect(perf.map((s) => [s.id, s.sourceDomain])).toContainEqual([`sig:${tag}:perf`, "PERFORMANCE"])
    expect(glob.map((s) => [s.id, s.sourceDomain])).toContainEqual([`sig:${tag}:glob`, "GLOBAL"])
  })

  // ── Dante runtime ──
  const turn = (over: Partial<DanteTurnInput> = {}): DanteTurnInput => ({
    runId: "run:test",
    userScope: toUserScopeRef(userB),
    intent: { training: true, nutrition: false, recovery: true, health: false, supplement: false },
    causal: false,
    explanation: false,
    agentToolIntent: false,
    safetyActive: false,
    timezone: "UTC",
    state: {
      recovery: { hasCheckin: true, statusLabel: "Recovery Priority", painIllness: false },
      trainingLoad: { state: "red", sessionsLast7Days: 5 },
    },
    ...over,
  })
  const persistTurn = async (t: DanteTurnInput, getClient = () => service) => {
    const res = buildDanteIntelligence(t, now)
    const signals = res.status === "FAILED" ? [] : res.signals
    await persistDanteSignals({ userId: userB, signals, getClient })
    return signals
  }
  const countB = () => Number(run(`select count(*) from public.coach_signals where user_id = ${q(userB)} and idempotency_key like 'dante:%' and signal_id like 'sig:dante:%';`).out)

  it("Dante LOW_RECOVERY and HIGH_TRAINING_LOAD signals are persisted and survive the request", async () => {
    run(`delete from public.coach_signals where user_id = ${q(userB)} and signal_id like 'sig:dante:%';`)
    const emitted = await persistTurn(turn())
    expect(emitted.map((s) => s.signalType).sort()).toEqual(["HIGH_TRAINING_LOAD", "LOW_RECOVERY"])
    const back = ((await loadActiveCoachSignalsForDomain(asB, { userId: userB, targetDomain: "NUTRITION", clearance: "NORMAL", now })) ?? []).filter((s) => s.id.startsWith("sig:dante:"))
    expect(back.map((s) => s.signalType).sort()).toEqual(["HIGH_TRAINING_LOAD", "LOW_RECOVERY"])
    expect(back.every((s) => s.lifecycle === "ACTIVE" && s.sourceCoach === "DANTE")).toBe(true)
  })

  it("a duplicate request does not create another active row", async () => {
    const before = countB()
    await persistTurn(turn())
    expect(countB()).toBe(before)
  })

  it("hard safety turn persists nothing", async () => {
    run(`delete from public.coach_signals where user_id = ${q(userB)} and signal_id like 'sig:dante:%';`)
    const emitted = await persistTurn(turn({ safetyActive: true }))
    expect(emitted).toEqual([])
    expect(countB()).toBe(0)
  })

  it("persistence failure never throws (DB error, throwing client, hang) and logs a safe category", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const signals = (buildDanteIntelligence(turn(), now) as { signals: CoachSignal[] }).signals
    const failing = { rpc: async () => ({ data: null, error: { code: "XX000", message: "secret prompt text SHOULD NOT LEAK" } }) } as unknown as SupabaseClient
    const hanging = { rpc: () => new Promise(() => {}) } as unknown as SupabaseClient
    await expect(persistDanteSignals({ userId: userB, signals, getClient: () => failing })).resolves.toBeUndefined()
    await expect(persistDanteSignals({ userId: userB, signals, getClient: () => { throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.") } })).resolves.toBeUndefined()
    await expect(persistDanteSignals({ userId: userB, signals, getClient: () => hanging, timeoutMs: 50 })).resolves.toBeUndefined()
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain("signal persistence failed")
    expect(logged).not.toContain("SHOULD NOT LEAK")
    expect(logged).not.toContain("SERVICE_ROLE")
    log.mockRestore()
  })
})
