/**
 * H0 Gemma runtime — OPT-IN live smoke with the REAL provider through the real handler and the route's TurnBudget.
 * Skipped unless GEMMA_LIVE=1. Nutrition loaders are stubbed (partial-context case needs a controlled failure).
 *
 *   GEMMA_LIVE=1 npx vitest run app/api/chatbot/__tests__/gemma-runtime-budget.live.test.ts
 *
 * The timeout case wraps the real fetch so provider requests hang until aborted: the real client, budget and handler run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const live = await vi.hoisted(async () => {
  const enabled = process.env.GEMMA_LIVE === "1"
  if (enabled) {
    const { readFileSync } = await import("node:fs")
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^(OPENAI_[A-Z0-9_]+|DANTE_[A-Z0-9_]*MODEL[A-Z0-9_]*)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
    }
  }
  return { enabled }
})

vi.mock("@/lib/nutrition/load-nutrition-context", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/nutrition/load-nutrition-context")>()), loadNutritionContext: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn(), resolveLocalToday: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/history", () => ({ loadRecentFoods: vi.fn(async () => []) }))
vi.mock("@/lib/training/load-today-session", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/training/load-today-session")>()), resolveUserTimeZone: vi.fn(async () => "Asia/Singapore") }))
vi.mock("@/lib/intelligence/gemma-consumer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intelligence/gemma-consumer")>()
  return { ...actual, loadGemmaCoordination: vi.fn(async () => actual.EMPTY_COORDINATION) }
})

import { createTurnBudget, MIN_ATTEMPT_MS } from "@/lib/dante-core/turn-budget"
import { handleNutritionCoachChat } from "@/lib/nutrition/coach/chat"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"

const realFetch = globalThis.fetch
const providerCalls: Array<{ signal?: AbortSignal | null }> = []
const context = (unavailable: string[] = []) => ({
  plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: ["peanut"], excludedFoods: [], foodPreferences: [] } },
  targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
  fitnessGoal: "fat_loss",
  cookingAbility: null,
  unavailable,
})

function providerFetch(hang: boolean) {
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("api.openai.com")) {
      providerCalls.push({ signal: init?.signal })
      if (hang) return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }))
    }
    return realFetch(url, init)
  })
}

async function turn(message: string, budget = createTurnBudget()) {
  const started = Date.now()
  const response = await handleNutritionCoachChat({ supabase: { from: () => { throw new Error("no table access") } } as never, userId: "00000000-0000-4000-8000-0000000000e1", body: { message, coachMode: "nutrition", conversation: { recentMessages: [{ role: "user", text: message }] } }, budget })
  const body = (await response.json()) as { code?: string; reply?: string; runtime: { status: string; providerAttempts: number; dependencies: Record<string, string> } }
  console.info(`\n=== ${message} (${Date.now() - started} ms) status=${response.status} code=${body.code ?? "-"} runtime=${JSON.stringify(body.runtime)} providerCalls=${providerCalls.length}\n${body.reply ?? ""}`)
  return { status: response.status, ms: Date.now() - started, ...body }
}

describe.skipIf(!live.enabled)("Gemma runtime live smoke (opt-in, real provider)", () => {
  beforeEach(() => {
    providerCalls.length = 0
    vi.mocked(loadNutritionContext).mockImplementation((async () => context()) as never)
    vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-16", entries: [], totals: { calories: 900, protein: 60, carbs: 0, fat: 0 } } as never)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("baseline: a real provider turn completes inside the budget", async () => {
    providerFetch(false)
    const result = await turn("is oatmeal a good breakfast?")
    expect(result.status).toBe(200)
    expect(result.runtime.status).toMatch(/COMPLETED|PARTIAL/)
    expect(result.runtime.providerAttempts).toBeGreaterThan(0)
    expect(result.runtime.providerAttempts).toBeLessThanOrEqual(6)
  }, 120_000)

  it("18. partial nutrition context: preferences read failed → 503 dependency failure, no provider call", async () => {
    providerFetch(false)
    vi.mocked(loadNutritionContext).mockImplementation((async () => context(["preferences"])) as never)
    const result = await turn("what should I eat for dinner?")
    expect(result.status).toBe(503)
    expect(result.code).toBe("NUTRITION_CONTEXT_UNAVAILABLE")
    expect(result.runtime.status).toBe("DEPENDENCY_FAILED")
    expect(providerCalls).toHaveLength(0)
  }, 120_000)

  it("19. provider timeout: the turn deadline ends it, one attempt, deterministic reply, TIMED_OUT", async () => {
    providerFetch(true)
    const result = await turn("is brown rice a good carb source?", createTurnBudget(undefined, MIN_ATTEMPT_MS + 500))
    expect(result.runtime.status).toBe("TIMED_OUT")
    expect(providerCalls).toHaveLength(1)
    expect(result.ms).toBeLessThan(MIN_ATTEMPT_MS + 3_000)
    expect(result.reply).toBeTruthy()
  }, 120_000)

  it("20. client disconnect mid real provider call: the request is aborted, status CANCELLED", async () => {
    providerFetch(false)
    const client = new AbortController()
    setTimeout(() => client.abort(), 300)
    const result = await turn("what are good high-fibre snacks?", createTurnBudget({ signal: client.signal }))
    expect(result.runtime.status).toBe("CANCELLED")
    expect(providerCalls.length).toBeLessThanOrEqual(1)
    expect(providerCalls.every((call) => call.signal?.aborted === true)).toBe(true)
    expect(result.ms).toBeLessThan(3_000)
  }, 120_000)
})
