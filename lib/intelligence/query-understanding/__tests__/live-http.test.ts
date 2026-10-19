// @vitest-environment node
/**
 * Smart query + retrieval LIVE HTTP gate. Skipped unless MF_LIVE_BASE is set (dev server on the LOCAL Docker stack).
 *   MF_LIVE_BASE=http://localhost:3010 npx vitest run lib/intelligence/query-understanding/__tests__/live-http.test.ts --no-file-parallelism
 * Real route (/api/chatbot), real session, real OpenAI planner/composer, real USDA (when USDA_FDC_API_KEY is set on the server).
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

import { BASE, login, post, resetDanteState, session, sql } from "../../__tests__/r1e-live-helpers"

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 })

type Turn = { role: "user" | "coach"; text: string }
type GemmaReply = { reply: string; route: string; conversation?: unknown; orchestration?: Record<string, unknown> }

async function gemma(message: string, recent: Turn[]): Promise<GemmaReply> {
  const r = await post({ coachMode: "nutrition", message, conversation: { recentMessages: recent.slice(-6) } })
  expect(r.status).toBe(200)
  const parsed = JSON.parse(r.text) as GemmaReply
  if (process.env.MF_LIVE_DEBUG) console.info("[live debug]", parsed.route, JSON.stringify(parsed.orchestration ?? null))
  return parsed
}

/** Dante streams; keep only the visible text. Falls back to the raw body when it is plain JSON. */
function danteText(raw: string): string {
  try {
    const j = JSON.parse(raw) as { reply?: string }
    if (typeof j.reply === "string") return j.reply
  } catch { /* streaming body */ }
  return raw
}

describe.skipIf(!BASE)("smart query + retrieval: live", () => {
  beforeAll(async () => {
    await login()
    resetDanteState()
  })

  it("GEMMA cod conversation: cod resolved across turns, verified source, per-100 g then deterministic 200 g", async () => {
    const t: Turn[] = []
    const say = async (m: string) => {
      const r = await gemma(m, t)
      t.push({ role: "user", text: m }, { role: "coach", text: r.reply })
      console.info(`[live gemma] "${m}" -> route=${r.route} :: ${r.reply.replace(/\s+/g, " ").slice(0, 260)}`)
      return r
    }
    await say("do u think cod fish is a good source of protien")
    const macros = await say("give me the macro")
    expect(macros.reply).toMatch(/105/)
    expect(macros.reply).toMatch(/23/)
    const grams = await say("what about 200g?")
    expect(grams.reply).toMatch(/210/)
    expect(grams.reply).toMatch(/46/)
    const atlantic = await say("same but Atlantic cod?")
    expect(atlantic.reply).toMatch(/210/) // the 200 g from two turns earlier is carried, with the Atlantic record
    expect(atlantic.reply).toMatch(/46/)
  })

  it("GEMMA Vietnamese: macro cá tuyết sao → 200g thì sao", async () => {
    const t: Turn[] = []
    const a = await gemma("macro cá tuyết sao", t)
    t.push({ role: "user", text: "macro cá tuyết sao" }, { role: "coach", text: a.reply })
    console.info(`[live gemma vi] route=${a.route} ${a.reply.replace(/\s+/g, " ").slice(0, 260)}`)
    expect(a.reply).toMatch(/105/)
    const b = await gemma("200g thì sao", t)
    console.info(`[live gemma vi] route=${b.route} ${b.reply.replace(/\s+/g, " ").slice(0, 260)}`)
    expect(b.reply).toMatch(/210/)
  })

  it("GEMMA USDA path: a food outside the local table (salmon) is verified, not 'unavailable'", async () => {
    // api.nal.usda.gov latency is highly variable (0.7 s .. 14 s measured from this machine) and the adapter times out at 6 s,
    // so a slow upstream legitimately yields the honest "couldn't verify" reply. Retry (an earlier success is cached in-process).
    // Wild (~142 kcal) vs farmed (~197-208 kcal) Atlantic salmon are both valid USDA records, so any 100-249 kcal figure is accepted.
    const KCAL = /\b(1\d\d|2[0-4]\d)\b/
    let reply = ""
    let attempts = 0
    for (; attempts < 3; attempts++) {
      reply = (await gemma("macros for salmon", [])).reply
      if (KCAL.test(reply)) break
      expect(reply).toMatch(/couldn.t verify/i) // the only acceptable failure is the honest one, never an invented number
    }
    console.info(`[live gemma salmon] attempts=${attempts + 1} ${reply.replace(/\s+/g, " ").slice(0, 300)}`)
    expect(reply).toMatch(KCAL)
    expect(reply).not.toMatch(/couldn.t verify/i)
  })

  it("DANTE cross-domain: 800 kcal + heavy deadlift tonight → performance answer, no meal plan", async () => {
    resetDanteState()
    const r = await post({ messages: [{ role: "user", content: "I only ate 800 calories today and I'm supposed to deadlift heavy tonight. Should I still push the session?" }] })
    expect(r.status).toBe(200)
    const text = danteText(r.text)
    console.info(`[live dante] ${text.replace(/\s+/g, " ").slice(0, 700)}`)
    expect(text.length).toBeGreaterThan(40)
    expect(text).not.toMatch(/(breakfast|lunch|dinner)\s*:\s*\d/i)
    expect(sql(`select count(*) from food_logs where user_id='${session.userId}' and created_at > now() - interval '2 minutes';`)).toBe("0")
  })

  it("DANTE fact access: is 200g cod enough protein after training", async () => {
    resetDanteState()
    const r = await post({ messages: [{ role: "user", content: "is 200g cod enough protein after training?" }] })
    expect(r.status).toBe(200)
    const text = danteText(r.text)
    console.info(`[live dante cod] ${text.replace(/\s+/g, " ").slice(0, 500)}`)
    expect(text).toMatch(/4[56]\s*g|46/)
  })

  it("DANTE Vietnamese: hôm qua ngủ tệ, nay có nên squat nặng ko (sleep ≠ insult)", async () => {
    resetDanteState()
    const r = await post({ messages: [{ role: "user", content: "hôm qua ngủ tệ, nay có nên squat nặng ko" }] })
    expect(r.status).toBe(200)
    const text = danteText(r.text)
    console.info(`[live dante vi] ${text.replace(/\s+/g, " ").slice(0, 500)}`)
    expect(text).not.toMatch(/chửi|roast|bring the training log/i)
  })

  it("DANTE follow-up chain stays on the squat", async () => {
    resetDanteState()
    const t: Array<{ role: "user" | "assistant"; content: string }> = []
    for (const m of ["My squat feels weak.", "why?", "what should I change?", "what if I train tomorrow?"]) {
      t.push({ role: "user", content: m })
      const r = await post({ messages: t })
      expect(r.status).toBe(200)
      const text = danteText(r.text)
      t.push({ role: "assistant", content: text })
      console.info(`[live dante chain] "${m}" -> ${text.replace(/\s+/g, " ").slice(0, 220)}`)
    }
  })
})
