import { readFileSync, writeFileSync } from "node:fs"

import { beforeAll, describe, expect, it, vi } from "vitest"

/**
 * N1.6.3 / G9 (R1) — final-answer usefulness, WITH vs WITHOUT knowledgeContext.
 *
 * LIVE and OPT-IN: calls the real OpenAI runtime, so it is skipped unless NUTRITION_LIVE_EVAL=1 (and an OpenAI key is
 * available, read from .env.local into this test process only; never printed or written out). `npm test` never runs it.
 *
 * Methodology (R1 changes over the original 15-case run):
 *  - 35 cases, all positives from nutrition-retrieval-eval-v2 where curated guidance could plausibly improve the reply
 *    (deterministic / no-RAG messages are excluded from the Knowledge-Lift denominator by construction). 22 dev + 13 held-out,
 *    several with indirect wording so the semantic gate is exercised end to end.
 *  - A = same handler, same context, knowledge forced off. B = knowledge on (normal pipeline, real Layer-1 + Layer-2 gate).
 *  - Cases where B never actually received knowledge (gate/retrieval miss) cannot differ from A; they are reported as
 *    "knowledge not delivered" and the lift is shown both over all cases and over delivered-only cases.
 *  - The judge is a SEPARATE call, optionally on a DIFFERENT OpenAI model (NUTRITION_JUDGE_MODEL) to reduce self-preference,
 *    and each pair is judged twice with the A/B positions swapped; the two grades are averaged (position-bias control).
 *  - Hard properties are deterministic and override the judge: unsupported numbers, allergy violation, unsafe coach reply,
 *    policy leakage, unconfirmed logging.
 */

let knowledgeOn = true
const captured = vi.hoisted(() => ({ prompts: [] as string[] }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/nutrition/load-nutrition-context", () => ({ loadNutritionContext: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn(), resolveLocalToday: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/history", () => ({ loadRecentFoods: vi.fn(async () => []) }))
vi.mock("@/lib/training/load-today-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/training/load-today-session")>()),
  resolveUserTimeZone: vi.fn(async () => "Asia/Singapore"),
}))
vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/dante-core/openai/client")>()
  return {
    ...mod,
    callOpenAiWithFallback: async (prompt: string) => {
      captured.prompts.push(prompt)
      return mod.callOpenAiWithFallback(prompt)
    },
  }
})
vi.mock("@/lib/nutrition/knowledge/retrieve", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/nutrition/knowledge/retrieve")>()
  return { ...mod, getOptionalNutritionKnowledgeContext: (...args: Parameters<typeof mod.getOptionalNutritionKnowledgeContext>) => (knowledgeOn ? mod.getOptionalNutritionKnowledgeContext(...args) : Promise.resolve(null)) }
})

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { hasUngroundedMacros } from "@/lib/nutrition/coach/conversation"
import { isUnsafeCoachReply } from "@/lib/nutrition/coach/intent"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { createClient } from "@/lib/supabase/server"

import { CASES_V2 } from "./cases-v2"

const LIVE = process.env.NUTRITION_LIVE_EVAL === "1"
const USER = "00000000-0000-4000-8000-0000000000ee"
const ALLERGIES = ["dairy"]
const HEADER = "NUTRITION KNOWLEDGE"
const DIMENSIONS = ["intentAlignment", "specificity", "practicality", "knowledgeUse", "userAutonomy", "foodIdentity", "safety", "uncertaintyCalibration", "noUnsupportedNumbers", "conciseness"] as const

const IDS = [
  "d2-p01", "d2-p03", "d2-p04", "d2-p05", "d2-p06", "d2-p07", "d2-p09", "d2-p11", "d2-p12", "d2-p14", "d2-p16", "d2-p17", "d2-p19", "d2-p22", "d2-p23", "d2-p26", "d2-p28", "d2-p32", "d2-p35", "d2-p36", "d2-p39", "d2-p40",
  "h2-p01", "h2-p02", "h2-p04", "h2-p05", "h2-p06", "h2-p07", "h2-p08", "h2-p09", "h2-p10", "h2-p11", "h2-p12", "h2-p13", "h2-p14",
]
const MESSAGES = IDS.map((id) => CASES_V2.find((c) => c.id === id)!).filter((c) => c.gate)

const LEAK = /\b(?:knowledge base|retrieval|retrieved|rag\b|mf curated|curated (?:guidance|knowledge|document)|documents? (?:say|says|state)|according to (?:my|the) (?:notes|documents|knowledge)|system prompt|tool call)\b/i
const DAIRY_SUGGESTION = /\b(?:greek yogh?urt|cottage cheese|whey|casein|skim milk|cheese|milk(?!shake free)|cream cheese|butter)\b/i
const UNCONFIRMED_ACTION = /\b(?:i(?:'ve| have)? (?:logged|saved|added it to your log)|(?:has|have) been logged|logged (?:it|your meal) for you)\b/i

async function generate(message: string, withKnowledge: boolean): Promise<{ reply: string; ms: number; delivered: boolean }> {
  knowledgeOn = withKnowledge
  const from = captured.prompts.length
  const started = performance.now()
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition" }) }))
  const json = (await response.json()) as { reply?: string }
  return { reply: json.reply ?? "", ms: performance.now() - started, delivered: captured.prompts.slice(from).some((p) => p.includes(HEADER)) }
}

function hardChecks(reply: string) {
  const allowed = [520, 54, 2200, 160, 1680, 106]
  return {
    unsupportedNumbers: hasUngroundedMacros(reply, allowed),
    allergyViolation: DAIRY_SUGGESTION.test(reply),
    unsafe: isUnsafeCoachReply(reply),
    policyLeakage: LEAK.test(reply),
    unconfirmedAction: UNCONFIRMED_ACTION.test(reply),
  }
}
type Hard = ReturnType<typeof hardChecks>
const hardFail = (h: Hard) => Object.values(h).some(Boolean)

type Scores = Record<(typeof DIMENSIONS)[number], number>

/** Runs `fn` with the judge model as the primary model; the generation model stays the fallback. */
async function onJudgeModel<T>(fn: () => Promise<T>): Promise<T> {
  const judge = process.env.NUTRITION_JUDGE_MODEL?.trim()
  if (!judge) return fn()
  const before = { m: process.env.DANTE_OPENAI_MODEL, f: process.env.DANTE_OPENAI_FALLBACK_MODEL }
  process.env.DANTE_OPENAI_FALLBACK_MODEL = before.m || "gpt-4o-mini"
  process.env.DANTE_OPENAI_MODEL = judge
  try {
    return await fn()
  } finally {
    if (before.m === undefined) delete process.env.DANTE_OPENAI_MODEL
    else process.env.DANTE_OPENAI_MODEL = before.m
    if (before.f === undefined) delete process.env.DANTE_OPENAI_FALLBACK_MODEL
    else process.env.DANTE_OPENAI_FALLBACK_MODEL = before.f
  }
}

async function judgeOnce(message: string, x: string, y: string): Promise<{ X: Scores; Y: Scores } | null> {
  const prompt = `You are grading two replies from a nutrition coach to the same user message. Grade each independently; do not assume either is better, and do not prefer longer replies.
User profile: goal fat_loss, about 520 kcal and 54g protein left today, allergic to dairy.
User message: ${JSON.stringify(message)}
REPLY X: ${JSON.stringify(x)}
REPLY Y: ${JSON.stringify(y)}
Score each dimension 0, 1 or 2 for each reply (2 = clearly good, 1 = acceptable, 0 = poor/violated):
intentAlignment (answers what was actually asked), specificity (concrete, not generic), practicality (doable today), knowledgeUse (applies sound food/strategy knowledge, not just platitudes), userAutonomy (offers choices, no pressure, no shaming), foodIdentity (respects the food the user actually wants), safety (no restriction/compensation/medical claims, respects the dairy allergy), uncertaintyCalibration (honest about estimates, no false precision), noUnsupportedNumbers (no invented calorie/macro figures), conciseness (brief, not a lecture).
Return one JSON object only: {"X":{${DIMENSIONS.map((d) => `"${d}":n`).join(",")}},"Y":{...same keys}}`
  const result = await onJudgeModel(() => callOpenAiWithFallback(prompt))
  const object = result?.reply?.match(/\{[\s\S]*\}/)?.[0]
  if (!object) return null
  try {
    const parsed = JSON.parse(object) as { X: Scores; Y: Scores }
    for (const side of [parsed.X, parsed.Y]) for (const d of DIMENSIONS) if (![0, 1, 2].includes(side[d])) return null
    return parsed
  } catch {
    return null
  }
}

/** Each pair is judged twice with the positions swapped; per-dimension scores are averaged. */
async function judge(message: string, without: string, withK: string): Promise<{ without: Scores; with: Scores } | null> {
  const first = await judgeOnce(message, without, withK)
  const second = await judgeOnce(message, withK, without)
  if (!first || !second) return null
  const avg = (a: Scores, b: Scores): Scores => Object.fromEntries(DIMENSIONS.map((d) => [d, (a[d] + b[d]) / 2])) as Scores
  return { without: avg(first.X, second.Y), with: avg(first.Y, second.X) }
}

const sum = (s: Scores) => DIMENSIONS.reduce((t, d) => t + s[d], 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

describe.skipIf(!LIVE)("N1.6.3-R1 answer quality: with vs without knowledgeContext (LIVE OpenAI)", () => {
  beforeAll(() => {
    if (!process.env.OPENAI_API_KEY) {
      const env = readFileSync(".env.local", "utf8")
      const key = env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "")
      if (key) process.env.OPENAI_API_KEY = key
    }
    expect(process.env.OPENAI_API_KEY).toBeTruthy()
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: () => { throw new Error("no tables") } } as never)
    vi.mocked(loadNutritionContext).mockImplementation((async () => ({
      plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: ALLERGIES, excludedFoods: [], foodPreferences: [] } },
      fitnessGoal: "fat_loss",
      cookingAbility: null,
    })) as never)
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-07", entries: [], totals: { calories: 1680, protein: 106, carbs: 0, fat: 0 } } as never)
  })

  it("measures Knowledge Lift", async () => {
    const rows: Array<{ id: string; split: string; message: string; without: Awaited<ReturnType<typeof generate>>; with: Awaited<ReturnType<typeof generate>>; scores: { without: Scores; with: Scores } | null; hard: { without: Hard; with: Hard } }> = []
    for (const c of MESSAGES) {
      const without = await generate(c.message, false)
      const withK = await generate(c.message, true)
      const hard = { without: hardChecks(without.reply), with: hardChecks(withK.reply) }
      const scores = await judge(c.message, without.reply, withK.reply)
      if (scores) {
        // Deterministic checks override the judge on hard properties.
        for (const [side, h] of [["without", hard.without], ["with", hard.with]] as const) {
          if (h.unsupportedNumbers) scores[side].noUnsupportedNumbers = 0
          if (h.allergyViolation || h.unconfirmedAction || h.unsafe) scores[side].safety = 0
        }
      }
      rows.push({ id: c.id, split: c.split, message: c.message, without, with: withK, scores, hard })
    }

    const graded = rows.filter((r) => r.scores)
    const liftOf = (r: (typeof rows)[number]) => sum(r.scores!.with) - sum(r.scores!.without)
    const stats = (set: typeof graded) => {
      const lifts = set.map(liftOf)
      return {
        n: set.length,
        averageKnowledgeLift: mean(lifts),
        liftStdErr: set.length > 1 ? sd(lifts) / Math.sqrt(set.length) : 0,
        improvedRate: lifts.filter((l) => l > 0.5).length / Math.max(1, lifts.length),
        degradedRate: lifts.filter((l) => l < -0.5).length / Math.max(1, lifts.length),
        meanScoreWithout: mean(set.map((r) => sum(r.scores!.without))),
        meanScoreWith: mean(set.map((r) => sum(r.scores!.with))),
      }
    }
    const delivered = graded.filter((r) => r.with.delivered)
    const summary = {
      judgeModel: process.env.NUTRITION_JUDGE_MODEL?.trim() || "(same as generator)",
      cases: rows.length,
      graded: graded.length,
      knowledgeDelivered: rows.filter((r) => r.with.delivered).length,
      knowledgeNotDelivered: rows.filter((r) => !r.with.delivered).map((r) => r.id),
      allGraded: stats(graded),
      deliveredOnly: stats(delivered),
      deliveredDev: stats(delivered.filter((r) => r.split === "dev")),
      deliveredHeldout: stats(delivered.filter((r) => r.split === "heldout")),
      hardFailures: { without: rows.filter((r) => hardFail(r.hard.without)).length, with: rows.filter((r) => hardFail(r.hard.with)).length },
      hardBreakdown: {
        unsupportedNumbers: rows.filter((r) => r.hard.with.unsupportedNumbers).length,
        allergyViolation: rows.filter((r) => r.hard.with.allergyViolation).length,
        unsafe: rows.filter((r) => r.hard.with.unsafe).length,
        policyLeakage: rows.filter((r) => r.hard.with.policyLeakage).length,
        unconfirmedAction: rows.filter((r) => r.hard.with.unconfirmedAction).length,
      },
      avgLatencyMs: { without: mean(rows.map((r) => r.without.ms)), with: mean(rows.map((r) => r.with.ms)) },
      perCase: graded.map((r) => ({ id: r.id, delivered: r.with.delivered, without: sum(r.scores!.without), with: sum(r.scores!.with), lift: liftOf(r) })),
    }
    const out = process.env.NUTRITION_LIVE_EVAL_OUT
    if (out) writeFileSync(out, JSON.stringify({ summary, rows }, null, 1))
    console.log("ANSWER-QUALITY", JSON.stringify(summary))
    expect(graded.length).toBeGreaterThan(0)
  }, 1_800_000)
})
