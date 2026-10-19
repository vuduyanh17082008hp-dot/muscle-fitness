// @vitest-environment node
/**
 * AI-R1E.1a LIVE HTTP gate. Skipped unless MF_LIVE_BASE is set (a dev server wired to the LOCAL Docker Supabase).
 *   MF_LIVE_BASE=http://localhost:3010 npx vitest run lib/intelligence/__tests__/r1e-live-http.test.ts
 * User: ver3.main@example.com with a "Recovery Priority" check-in for today (see memory: stabilization-batch3-verification).
 * Real Dante chatbot route → coach_signals → a SEPARATE user-JWT read. The persistence adapter is never called directly here.
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

import { loadActiveCoachSignalsForDomain } from "../coach-signal-store"
import { BASE, dante, env, login, resetDanteState, session, sql, userClient } from "./r1e-live-helpers"

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 })

describe.skipIf(!BASE)("R1E.1a live: real Dante HTTP request → coach_signals → separate user-JWT read", () => {
  beforeAll(async () => {
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^http:\/\/(26\.169\.20\.28|127\.0\.0\.1|localhost):/)
    await login()
    sql(`delete from coach_signals where user_id='${session.userId}';`)
  })

  it("persists LOW_RECOVERY through the actual chatbot route and a separate request recovers it", async () => {
    const userId = session.userId
    resetDanteState()
    const res = await dante("How should I handle recovery today?")
    expect(res.status).toBe(200)
    expect(res.text).toContain('"type":"done"')
    expect(res.text).not.toContain('"safetyTriggered":true')

    // separate authenticated read (fresh client, user JWT, RLS applies)
    const signals = (await loadActiveCoachSignalsForDomain(userClient(), { userId, targetDomain: "NUTRITION", clearance: "NORMAL", now: new Date() })) ?? []
    const low = signals.find((s) => s.signalType === "LOW_RECOVERY")
    expect(low).toBeTruthy()
    expect(low!.lifecycle).toBe("ACTIVE")
    expect(Date.parse(low!.validUntil)).toBeGreaterThan(Date.now())
    expect(low!.idempotencyKey).toMatch(/^dante:LOW_RECOVERY:\d{4}-\d{2}-\d{2}$/)
    expect(low!.sourceCoach).toBe("DANTE")
    expect(low!.privacyClass).toBe("NORMAL") // regression: pain_illness "no" must not make the signal SENSITIVE
    expect(low!.implications[0]).toMatchObject({ targetDomain: "NUTRITION", value: "AVOID_AGGRESSIVE_DEFICIT", relevance: "MATERIAL" })

    // user scope: the DB row belongs to this user and nobody else's rows were written
    expect(sql(`select count(*) from coach_signals where user_id='${userId}' and signal_type='LOW_RECOVERY';`)).toBe("1")
    expect(sql(`select count(*) from coach_signals where user_id<>'${userId}';`)).toBe("0")

    // no raw chat / chain-of-thought anywhere in the row
    const row = sql(`select row_to_json(c)::text from coach_signals c where user_id='${userId}' and signal_type='LOW_RECOVERY';`)
    for (const forbidden of ["How should I handle", "recovery today", "reasoning", "chain", "thought", "message"]) expect(row.toLowerCase()).not.toContain(forbidden.toLowerCase())

    // an unauthenticated client cannot read it (RLS)
    const { createClient } = await import("@supabase/supabase-js")
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
    expect(await loadActiveCoachSignalsForDomain(anon, { userId, targetDomain: "NUTRITION", clearance: "MEDICAL", now: new Date() })).toEqual([])
  })

  it("repeating the same logical publication does not create a duplicate active meaning", async () => {
    const userId = session.userId
    resetDanteState()
    expect((await dante("How should I handle recovery today?")).status).toBe(200)
    expect(sql(`select count(*) from coach_signals where user_id='${userId}' and signal_type='LOW_RECOVERY';`)).toBe("1")
    expect(sql(`select count(*) from coach_signals where user_id='${userId}' and signal_type='LOW_RECOVERY' and lifecycle='ACTIVE';`)).toBe("1")
  })

  it("safety unchanged: a safety message is handled by safety and publishes nothing", async () => {
    const userId = session.userId
    sql(`delete from coach_signals where user_id='${userId}';`)
    resetDanteState()
    try {
      const res = await dante("I have chest pain and my left arm feels numb")
      expect(res.status).toBe(200)
      expect(res.text).toContain('"safetyTriggered":true')
      expect(sql(`select count(*) from coach_signals where user_id='${userId}';`)).toBe("0")
    } finally {
      resetDanteState()
    }
  })
})
