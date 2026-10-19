/**
 * H0 Gemma runtime budget parity. The REAL provider client runs (only `fetch` is replaced), under the same TurnBudget the
 * Dante route owns: one deadline, the client's abort, bounded provider attempts, late results dropped, honest status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/nutrition/load-nutrition-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutrition/load-nutrition-context")>()),
  loadNutritionContext: vi.fn(),
}))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn(), resolveLocalToday: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/history", () => ({ loadRecentFoods: vi.fn(async () => []) }))
vi.mock("@/lib/training/load-today-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/training/load-today-session")>()),
  resolveUserTimeZone: vi.fn(async () => "Asia/Singapore"),
}))
vi.mock("@/lib/intelligence/gemma-consumer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intelligence/gemma-consumer")>()
  return { ...actual, loadGemmaCoordination: vi.fn(async () => actual.EMPTY_COORDINATION) }
})
vi.mock("@/lib/nutrition/knowledge/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutrition/knowledge/retrieve")>()),
  getOptionalNutritionKnowledgeContext: vi.fn(async () => null),
}))

import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { createTurnBudget, MIN_ATTEMPT_MS } from "@/lib/dante-core/turn-budget"
import { GEMMA_MAX_PROVIDER_ATTEMPTS, handleNutritionCoachChat } from "@/lib/nutrition/coach/chat"
import { PLANNER_MARKER } from "@/lib/nutrition/coach/orchestration"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"

const USER = "00000000-0000-4000-8000-00000000000a"
const supabase = { from: () => { throw new Error("no direct table access") } } as never
const MESSAGE = "is white rice a good carb source?"
const plannerPlan = {
  understanding: { userGoal: null, explicitRequests: ["nutrition question"], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
  need: { primaryNeed: "answer", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
  strategy: { mode: "ANSWER", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false },
  clarification: null,
  foods: [],
}
const MODEL_REPLY = "White rice is an easy-to-digest carbohydrate; pair it with protein and vegetables for a balanced plate."

type Handler = (prompt: string, init: RequestInit) => Promise<Response>
const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
const promptOf = (init: RequestInit) => String(JSON.parse(String(init.body)).messages?.[0]?.content ?? "")
/** Resolves only when the request's signal aborts: a provider that never answers. */
const hang = (init: RequestInit) => new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }))
const healthy: Handler = async (prompt) => completion(prompt.includes(PLANNER_MARKER) ? JSON.stringify(plannerPlan) : MODEL_REPLY)

let fetchMock: ReturnType<typeof vi.fn>
function provider(handler: Handler) {
  fetchMock = vi.fn((_url: string, init: RequestInit) => handler(promptOf(init), init))
  vi.stubGlobal("fetch", fetchMock)
}

async function turn(budget = createTurnBudget(), message = MESSAGE) {
  const body = { message, coachMode: "nutrition", conversation: { recentMessages: [{ role: "user", text: message }] } }
  const response = await handleNutritionCoachChat({ supabase, userId: USER, body, budget })
  return { status: response.status, json: (await response.json()) as { ok: boolean; code?: string; reply?: string; route?: string; runtime: { status: string; providerAttempts: number; providerCap: number; dependencies: Record<string, string> } } }
}

const fullContext = () => ({
  plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: ["peanut"], excludedFoods: [], foodPreferences: [] } },
  targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
  fitnessGoal: "fat_loss",
  cookingAbility: null,
  unavailable: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("OPENAI_API_KEY", "test")
  vi.stubEnv("DANTE_OPENAI_MODEL", "gpt-4o-mini")
  vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "gpt-4o-mini")
  vi.mocked(loadNutritionContext).mockImplementation((async () => fullContext()) as never)
  vi.mocked(loadFoodLogForDate).mockResolvedValue({ date: "2026-10-16", entries: [], totals: { calories: 900, protein: 60, carbs: 0, fat: 0 } } as never)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("Gemma turn under the shared TurnBudget", () => {
  it("baseline: a healthy turn completes with an honest status and counted attempts", async () => {
    provider(healthy)
    const { status, json } = await turn()
    expect(status).toBe(200)
    expect(json.reply).toBe(MODEL_REPLY)
    expect(json.runtime).toMatchObject({ status: "COMPLETED", providerCap: GEMMA_MAX_PROVIDER_ATTEMPTS, dependencies: { nutrition_context: "OK" } })
    expect(json.runtime.providerAttempts).toBe(fetchMock.mock.calls.length)
  })

  it("1. provider hangs: the turn deadline ends it with ONE attempt, a deterministic reply and TIMED_OUT", async () => {
    provider(async (_prompt, init) => hang(init))
    const started = Date.now()
    const { status, json } = await turn(createTurnBudget(undefined, MIN_ATTEMPT_MS + 300))
    expect(Date.now() - started).toBeLessThan(MIN_ATTEMPT_MS + 2_000)
    expect(status).toBe(200)
    expect(json.runtime.status).toBe("TIMED_OUT")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(json.reply).toBeTruthy()
    expect(json.reply).not.toBe(MODEL_REPLY)
  }, 15_000)

  it("2. nutrition dependency hangs: bounded wait, 503 dependency status, never 'complete your profile', no model call", async () => {
    provider(healthy)
    vi.mocked(loadNutritionContext).mockImplementation((() => new Promise(() => {})) as never)
    const started = Date.now()
    const { status, json } = await turn()
    expect(Date.now() - started).toBeLessThan(8_000)
    expect(status).toBe(503)
    expect(json.code).toBe("NUTRITION_CONTEXT_TIMEOUT")
    expect(json.runtime.dependencies.nutrition_context).toBe("TIMED_OUT")
    expect(JSON.stringify(json)).not.toMatch(/complete your profile/i)
    expect(fetchMock).not.toHaveBeenCalled()
  }, 15_000)

  it("3. client disconnect: the in-flight provider call is cancelled, no further attempt starts, status CANCELLED", async () => {
    provider(async (_prompt, init) => hang(init))
    const client = new AbortController()
    const budget = createTurnBudget({ signal: client.signal })
    setTimeout(() => client.abort(), 100)
    const started = Date.now()
    const { json } = await turn(budget)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(json.runtime.status).toBe("CANCELLED")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true)
  })

  it("7. partial nutrition context: a failed preferences read is a dependency failure, not empty allergies", async () => {
    provider(healthy)
    vi.mocked(loadNutritionContext).mockImplementation((async () => ({ ...fullContext(), unavailable: ["preferences"] })) as never)
    const { status, json } = await turn()
    expect(status).toBe(503)
    expect(json.code).toBe("NUTRITION_CONTEXT_UNAVAILABLE")
    expect(json.runtime).toMatchObject({ status: "DEPENDENCY_FAILED", dependencies: { nutrition_context: "FAILED" } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("7b. a nutrition loader that throws is FAILED/503, not NO_TARGET/422", async () => {
    provider(healthy)
    vi.mocked(loadNutritionContext).mockRejectedValue(new Error("fetch failed"))
    const { status, json } = await turn()
    expect(status).toBe(503)
    expect(json.code).toBe("NUTRITION_CONTEXT_UNAVAILABLE")
    expect(json.runtime.dependencies.nutrition_context).toBe("FAILED")
  })

  it("no runaway fallback chain: a provider that always fails costs at most the Gemma cap, then a deterministic reply", async () => {
    provider(async () => new Response(JSON.stringify({ error: { message: "upstream 500" } }), { status: 500 }))
    const { status, json } = await turn()
    expect(status).toBe(200)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(GEMMA_MAX_PROVIDER_ATTEMPTS)
    expect(json.runtime.providerAttempts).toBe(fetchMock.mock.calls.length)
    expect(json.reply).toBeTruthy()
  })

  it("9. two concurrent requests: one client leaving cancels only its own turn", async () => {
    const LEAVING = "is brown rice a good carb source?"
    // The leaving client's provider calls hang; the staying client's answer normally.
    provider(async (prompt, init) => (prompt.includes(LEAVING) ? hang(init) : healthy(prompt, init)))
    const leaving = new AbortController()
    const stayingBudget = createTurnBudget()
    setTimeout(() => leaving.abort(), 100)
    const [left, stayed] = await Promise.all([turn(createTurnBudget({ signal: leaving.signal }), LEAVING), turn(stayingBudget)])
    expect(left.json.runtime.status).toBe("CANCELLED")
    expect(stayed.json.runtime.status).toBe("COMPLETED")
    expect(stayed.json.reply).toBe(MODEL_REPLY)
    expect(stayingBudget.signal.aborted).toBe(false)
  })
})

describe("provider attempts (callOpenAiWithFallback under a budget)", () => {
  it("4. retryable transport error on the primary model: the fallback model answers, 2 attempts", async () => {
    vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "gpt-4.1-mini")
    let n = 0
    provider(async () => (n++ === 0 ? Promise.reject(new TypeError("fetch failed")) : completion("ok")))
    const budget = createTurnBudget()
    expect(await callOpenAiWithFallback("hi", budget)).toEqual({ reply: "ok", model: "gpt-4.1-mini" })
    expect(budget.counts.provider).toBe(2)
  })

  it("5. non-retryable error (rejected key): no second model, the error surfaces", async () => {
    vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "gpt-4.1-mini")
    provider(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }))
    const budget = createTurnBudget()
    await expect(callOpenAiWithFallback("hi", budget)).rejects.toThrow(/OPENAI_API_KEY/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("6. deadline too close before the retry: no attempt starts", async () => {
    provider(healthy)
    const budget = createTurnBudget(undefined, MIN_ATTEMPT_MS - 1)
    expect(await callOpenAiWithFallback("hi", budget)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("6b. an aborted attempt never falls through to the fallback model", async () => {
    vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "gpt-4.1-mini")
    provider(async (_prompt, init) => hang(init))
    const client = new AbortController()
    const budget = createTurnBudget({ signal: client.signal })
    setTimeout(() => client.abort(), 50)
    expect(await callOpenAiWithFallback("hi", budget)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("8. late result: a reply that lands after the turn was aborted is dropped", async () => {
    const client = new AbortController()
    const budget = createTurnBudget({ signal: client.signal })
    // A transport that ignores the abort and answers anyway, after the client left.
    provider(() => new Promise((resolve) => setTimeout(() => resolve(completion("late answer")), 80)))
    setTimeout(() => client.abort(), 20)
    expect(await callOpenAiWithFallback("hi", budget)).toBeNull()
  })

  it("provider cap: once the turn's cap is spent no new attempt starts", async () => {
    provider(healthy)
    const budget = createTurnBudget()
    budget.limit.provider = 1
    expect(await callOpenAiWithFallback("a", budget)).not.toBeNull()
    expect(await callOpenAiWithFallback("b", budget)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("loadNutritionContext reports failed reads instead of empty rows", () => {
  const table = (result: { data: unknown; error: unknown; status?: number }) => {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, { select: () => chain, eq: () => chain, maybeSingle: async () => result })
    return chain
  }
  it("an RLS/auth failure on user_preferences marks preferences unavailable (allergies unknown, not empty)", async () => {
    const actual = await vi.importActual<typeof import("@/lib/nutrition/load-nutrition-context")>("@/lib/nutrition/load-nutrition-context")
    const client = {
      from: (name: string) =>
        name === "user_preferences"
          ? table({ data: null, error: { code: "42501", message: "permission denied for table user_preferences" }, status: 403 })
          : table({ data: null, error: null }),
    }
    const context = await actual.loadNutritionContext(client as never, USER)
    expect(context.unavailable).toEqual(["preferences"])
  })
  it("rows that simply do not exist are not failures", async () => {
    const actual = await vi.importActual<typeof import("@/lib/nutrition/load-nutrition-context")>("@/lib/nutrition/load-nutrition-context")
    const context = await actual.loadNutritionContext({ from: () => table({ data: null, error: null }) } as never, USER)
    expect(context.unavailable).toEqual([])
  })
})
