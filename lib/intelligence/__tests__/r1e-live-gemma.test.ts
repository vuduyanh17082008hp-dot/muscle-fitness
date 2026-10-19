// @vitest-environment node
/**
 * AI-R1E.2 LIVE HTTP gate for the Gemma read-only consumer. Skipped unless MF_LIVE_BASE is set (dev server on the LOCAL Docker stack).
 *   MF_LIVE_BASE=http://localhost:3010 npx vitest run lib/intelligence/__tests__/r1e-live-gemma.test.ts
 * The positive flow uses a real Dante request then a SEPARATE Gemma request. Read-side negatives (expired/withdrawn/foreign/privacy…)
 * are driven by direct fixture rows, since they cannot be produced by the real writer.
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

import { loadActiveCoachSignalsForDomain } from "../coach-signal-store"
import { BASE, dante, login, post, resetDanteState, session, sql, userClient } from "./r1e-live-helpers"

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 })

type GemmaReply = {
  reply: string
  route: string
  coordination: null | { signalLoaded: boolean; signalTypes: string[]; signalRefs: string[]; directives: string[]; reasoningLevel: string; noteApplied: boolean }
  mealDraft: null | { nutrition: Record<string, number>; constraints: Record<string, unknown>; sessionContextSnapshot: Record<string, number | string> }
}
const gemma = async (message: string): Promise<GemmaReply> => {
  const r = await post({ coachMode: "nutrition", message })
  expect(r.status).toBe(200)
  return JSON.parse(r.text) as GemmaReply
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const iso = (ms: number) => new Date(Date.now() + ms).toISOString()
const HOUR = 3_600_000
let seq = 0

type Fx = { user?: string; type?: string; source?: string; targets?: string[]; value?: string; privacy?: string; lifecycle?: string; from?: number; until?: number; supersededBy?: string; schema?: number }
function fixture(o: Fx = {}) {
  const n = ++seq
  const type = o.type ?? "LOW_RECOVERY"
  const targets = o.targets ?? ["NUTRITION"]
  const implications = JSON.stringify([{ targetDomain: targets[0], type: "RECOMMENDATION_CONTEXT", value: o.value ?? "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL", strength: "SOFT" }])
  sql(`insert into coach_signals (signal_id,user_id,schema_version,idempotency_key,producer,source_domain,target_domains,signal_type,status,lifecycle,uncertainty,identifiability,privacy_class,evidence_refs,provenance,implications,superseded_by,valid_from,valid_until)
    values (${q(`sig:fx:${type}:${n}`)},'${o.user ?? session.userId}',${o.schema ?? 1},${q(`fx:${type}:${n}`)},'DANTE',${q(o.source ?? "RECOVERY")},array[${targets.map(q).join(",")}],${q(type)},'CROSS_COACH_VERIFIED',${q(o.lifecycle ?? "ACTIVE")},'MODERATE_SUPPORT','PARTIALLY_IDENTIFIED',${q(o.privacy ?? "NORMAL")},array['ev:fx'],array['fx:provenance'],${q(implications)}::jsonb,${o.supersededBy ? q(o.supersededBy) : "null"},${q(iso(o.from ?? -HOUR))},${q(iso(o.until ?? 2 * HOUR))});`)
}
const clearSignals = () => sql("delete from coach_signals;")

describe.skipIf(!BASE)("R1E.2 live: Dante signal → separate Gemma request", () => {
  let foreignUser = ""
  let baseline: GemmaReply

  beforeAll(async () => {
    await login()
    foreignUser = sql("select id from auth.users where email='ver3.fresh@example.com';")
    clearSignals()
    baseline = await gemma("What should I eat tonight?")
  })

  it("baseline (no signal): nothing consumed, plain engine reply", () => {
    expect(baseline.route).toBe("build")
    expect(baseline.coordination).toBeNull()
    expect(baseline.mealDraft).toBeTruthy()
  })

  it("Dante request persists LOW_RECOVERY; a SEPARATE Gemma request (no recovery info) loads it; reasoning reflects it; macros identical", async () => {
    resetDanteState()
    expect((await dante("How should I handle recovery today?")).status).toBe(200)
    const before = sql(`select count(*) from food_logs where user_id='${session.userId}';`)
    const withSignal = await gemma("What should I eat tonight?")
    expect(withSignal.coordination).toMatchObject({ signalLoaded: true, signalTypes: ["LOW_RECOVERY"], directives: ["AVOID_AGGRESSIVE_DEFICIT"], noteApplied: true })
    expect(withSignal.coordination!.signalRefs[0]).toMatch(/^sig:dante:LOW_RECOVERY:\d{4}-\d{2}-\d{2}$/)
    expect(withSignal.coordination!.reasoningLevel).not.toBe("NONE")
    // meaningful contextual difference …
    expect(withSignal.reply).not.toBe(baseline.reply)
    expect(withSignal.reply).toMatch(/recovery looks low/i)
    expect(baseline.reply).not.toMatch(/recovery/i)
    // … while deterministic macro constraints are identical
    expect(withSignal.mealDraft!.constraints).toEqual(baseline.mealDraft!.constraints)
    expect(withSignal.mealDraft!.nutrition).toEqual(baseline.mealDraft!.nutrition)
    for (const k of ["caloriesTarget", "caloriesRemaining", "proteinTarget", "proteinRemaining"]) {
      expect(withSignal.mealDraft!.sessionContextSnapshot[k]).toBe(baseline.mealDraft!.sessionContextSnapshot[k])
    }
    // read does not consume or mutate: still ACTIVE, nothing logged
    expect(sql(`select lifecycle from coach_signals where user_id='${session.userId}' and signal_type='LOW_RECOVERY';`)).toBe("ACTIVE")
    expect(sql(`select count(*) from food_logs where user_id='${session.userId}';`)).toBe(before)
    // a second read still works (the signal was not CONSUMED)
    expect((await gemma("What should I eat tonight?")).coordination?.signalLoaded).toBe(true)
  })

  it.each<[string, Fx]>([
    ["expired", { from: -3 * HOUR, until: -HOUR }],
    ["withdrawn", { lifecycle: "WITHDRAWN" }],
    ["superseded", { lifecycle: "SUPERSEDED", supersededBy: "sig:newer" }],
    ["future-dated", { from: HOUR, until: 3 * HOUR }],
    ["unsupported-schema", { schema: 99 }],
    ["no-NUTRITION-target", { targets: ["TRAINING"] }],
  ])("ignores a %s signal", async (_name, o) => {
    clearSignals()
    fixture(o)
    const r = await gemma("What should I eat tonight?")
    expect(r.coordination).toBeNull()
    expect(r.reply).toBe(baseline.reply)
  })

  it("ignores another user's signal", async () => {
    clearSignals()
    fixture({ user: foreignUser })
    const r = await gemma("What should I eat tonight?")
    expect(r.coordination).toBeNull()
    expect(r.reply).toBe(baseline.reply)
  })

  it("GLOBAL-sourced signal that targets NUTRITION is consumed (HIGH_TRAINING_LOAD)", async () => {
    clearSignals()
    fixture({ source: "GLOBAL", type: "HIGH_TRAINING_LOAD", value: "SUPPORT_RECOVERY_NUTRITION" })
    const r = await gemma("What should I eat tonight?")
    expect(r.coordination).toMatchObject({ signalLoaded: true, signalTypes: ["HIGH_TRAINING_LOAD"], directives: ["SUPPORT_RECOVERY_NUTRITION"] })
    expect(r.reply).toMatch(/training load is high/i)
  })

  it("UPCOMING_HEAVY_SESSION is consumed as pre-training fuel context", async () => {
    clearSignals()
    fixture({ source: "TRAINING", type: "UPCOMING_HEAVY_SESSION", value: "REVIEW_PRE_TRAINING_FUEL" })
    const r = await gemma("What should I eat tonight?")
    expect(r.coordination).toMatchObject({ signalLoaded: true, signalTypes: ["UPCOMING_HEAVY_SESSION"], directives: ["REVIEW_PRE_TRAINING_FUEL"] })
    expect(r.reply).toMatch(/heavy session/i)
  })

  it("privacy: Gemma reads NORMAL + SENSITIVE and never MEDICAL", async () => {
    clearSignals()
    fixture({ type: "MEDICAL_CTX", privacy: "MEDICAL" })
    expect((await gemma("What should I eat tonight?")).coordination).toBeNull()
    clearSignals()
    fixture({ privacy: "SENSITIVE" })
    expect((await gemma("What should I eat tonight?")).coordination?.signalLoaded).toBe(true)
  })

  it("loader clearance ranks (user-JWT reads): NORMAL → NORMAL; SENSITIVE → +SENSITIVE; MEDICAL → all", async () => {
    clearSignals()
    fixture({ type: "SIG_N", privacy: "NORMAL" })
    fixture({ type: "SIG_S", privacy: "SENSITIVE" })
    fixture({ type: "SIG_M", privacy: "MEDICAL" })
    const read = async (clearance: "NORMAL" | "SENSITIVE" | "MEDICAL") =>
      ((await loadActiveCoachSignalsForDomain(userClient(), { userId: session.userId, targetDomain: "NUTRITION", clearance, now: new Date() })) ?? []).map((s) => s.signalType).sort()
    expect(await read("NORMAL")).toEqual(["SIG_N"])
    expect(await read("SENSITIVE")).toEqual(["SIG_N", "SIG_S"])
    expect(await read("MEDICAL")).toEqual(["SIG_M", "SIG_N", "SIG_S"])
  })

  it("authority: only 250 kcal remain → the signal never blows through the target; the user decides", async () => {
    clearSignals()
    fixture()
    const target = Number(baseline.mealDraft!.sessionContextSnapshot.caloriesTarget)
    sql(`insert into food_logs (user_id,log_date,meal_type,food_name,source,quantity_grams,calories,protein_g,carbs_g,fat_g,notes) values ('${session.userId}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'lunch','R1E2 TEST FOOD','user_provided',100,${target - 250},10,10,10,'R1E2TEST');`)
    try {
      const r = await gemma("What should I eat tonight?")
      expect(r.coordination?.signalLoaded).toBe(true)
      if (r.mealDraft) expect(r.mealDraft.nutrition.calories).toBeLessThanOrEqual(251)
      expect(r.reply).toMatch(/only about 250 kcal remain/i)
      expect(r.reply).toMatch(/your decision/i)
    } finally {
      sql("delete from food_logs where notes='R1E2TEST';")
    }
  })

  it("failure degrades safely: an unreadable signal table behaves exactly like the baseline", async () => {
    clearSignals()
    fixture()
    sql("alter table coach_signals rename to coach_signals_off;")
    try {
      const r = await gemma("What should I eat tonight?")
      expect(r.coordination).toBeNull()
      expect(r.reply).toBe(baseline.reply)
    } finally {
      sql("alter table coach_signals_off rename to coach_signals;")
    }
  })

  it("safety unchanged: a safety message is handled by safety with no coordination", async () => {
    clearSignals()
    fixture()
    const r = await gemma("I have chest pain and feel dizzy, what should I eat?")
    expect(r.coordination).toBeNull()
    expect(r.route).toMatch(/safety/)
  })
})
