// @vitest-environment node
/**
 * AI-R1E.2a LIVE gate: early-exit (risk accumulator / current-state) Dante turns publish CoachSignals. Skipped unless MF_LIVE_BASE is set.
 *   MF_LIVE_BASE=http://localhost:3010 npx vitest run lib/intelligence/__tests__/r1e-live-earlyexit.test.ts --no-file-parallelism
 * LOCAL Docker only. The user's real "Recovery Priority" check-in for today is moved out of the way for the unverified case and always restored.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { loadActiveCoachSignalsForDomain } from "../coach-signal-store"
import { interpretSignalsForGemma } from "../gemma-consumer"
import { BASE, dante, env, login, resetDanteState, session, sql, userClient } from "./r1e-live-helpers"

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 })

const MSG = "I slept badly and recovery feels low. How should I handle today?"
const rows = (extra = "") => sql(`select signal_type||'|'||status||'|'||lifecycle||'|'||idempotency_key from coach_signals where user_id='${session.userId}' ${extra} order by created_at;`)
const moveCheckin = (days: number) => sql(`update recovery_checkins set checkin_date = checkin_date + (${days}) where user_id='${session.userId}' and checkin_date between current_date - 40 and current_date + 40;`)

describe.skipIf(!BASE)("R1E.2a live: early-exit LOW_RECOVERY", () => {
  let shifted = false
  beforeAll(async () => {
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^http:\/\/(26\.169\.20\.28|127\.0\.0\.1|localhost):/)
    await login()
  })
  afterAll(() => {
    if (shifted) moveCheckin(30)
  })

  it("without a verified check-in: reply is valid, signal is INFERENCE only, never CROSS_COACH_VERIFIED", async () => {
    sql(`delete from coach_signals where user_id='${session.userId}';`)
    moveCheckin(-30)
    shifted = true
    resetDanteState()
    const res = await dante(MSG)
    expect(res.status).toBe(200)
    expect(res.text).toContain('"type":"done"')
    expect(res.text).not.toContain('"safetyTriggered":true')
    const out = rows()
    expect(out).toMatch(/^LOW_RECOVERY\|INFERENCE\|ACTIVE\|dante:LOW_RECOVERY:USER_EXPLICIT:\d{4}-\d{2}-\d{2}$/)
    expect(out).not.toContain("CROSS_COACH_VERIFIED")
    const prov = sql(`select provenance::text from coach_signals where user_id='${session.userId}';`)
    expect(prov).toContain("dante:user_explicit:current_turn")
    expect(prov).not.toContain("dante:athlete_state")
  })

  it("with the verified check-in: LOW_RECOVERY is CROSS_COACH_VERIFIED, supersedes the explicit one, Gemma loads it", async () => {
    moveCheckin(30)
    shifted = false
    resetDanteState()
    const res = await dante(MSG)
    expect(res.status).toBe(200)
    expect(res.text).toContain('"type":"done"')
    expect(rows(`and lifecycle='ACTIVE'`)).toMatch(/^LOW_RECOVERY\|CROSS_COACH_VERIFIED\|ACTIVE\|dante:LOW_RECOVERY:\d{4}-\d{2}-\d{2}$/)
    expect(rows(`and status='INFERENCE'`)).toContain("SUPERSEDED")

    // idempotency: the same turn again adds nothing
    resetDanteState()
    expect((await dante(MSG)).status).toBe(200)
    expect(sql(`select count(*) from coach_signals where user_id='${session.userId}';`)).toBe("2")

    const signals = (await loadActiveCoachSignalsForDomain(userClient(), { userId: session.userId, targetDomain: "NUTRITION", clearance: "SENSITIVE", now: new Date() })) ?? []
    const c = interpretSignalsForGemma(signals, session.userId, new Date())
    expect(c.directives).toEqual(["AVOID_AGGRESSIVE_DEFICIT"])
    expect(sql("select count(*) from coach_signals c join auth.users u on u.id=c.user_id where u.email='ver3.fresh@example.com';")).toBe("0") // scope: the other seeded test user is untouched
  })

  it("hard safety and casual turns publish nothing", async () => {
    sql(`delete from coach_signals where user_id='${session.userId}';`)
    for (const m of ["I have chest pain and my recovery feels low", "I'm dying laughing at this gym meme lol"]) {
      resetDanteState()
      expect((await dante(m)).status).toBe(200)
      expect(sql(`select count(*) from coach_signals where user_id='${session.userId}';`)).toBe("0")
    }
    resetDanteState()
  })
})
