import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/nutrition/load-nutrition-context", () => ({ loadNutritionContext: vi.fn() }))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn(), resolveLocalToday: vi.fn(async () => "2026-11-02") }))
vi.mock("@/lib/nutrition/food-log/history", () => ({ loadRecentFoods: vi.fn(async () => []) }))
vi.mock("@/lib/training/load-today-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/training/load-today-session")>()),
  resolveUserTimeZone: vi.fn(async () => "Asia/Singapore"),
}))
vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/client")>()),
  callOpenAiWithFallback: vi.fn(),
}))
vi.mock("@/lib/dante-core/openai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/config")>()),
  isOpenAiConfigured: vi.fn(() => true),
}))
vi.mock("@/lib/nutrition/knowledge/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutrition/knowledge/retrieve")>()),
  getOptionalNutritionKnowledgeContext: vi.fn(async () => null),
}))
vi.mock("@/lib/dante-core/tools/pending-actions", () => ({ createPendingAction: vi.fn(), confirmPendingAction: vi.fn(), cancelPendingAction: vi.fn(), readPendingActionStatus: vi.fn() }))

import { POST } from "@/app/api/chatbot/route"
import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { cancelPendingAction, confirmPendingAction, createPendingAction, readPendingActionStatus } from "@/lib/dante-core/tools/pending-actions"
import { draftIdentity } from "@/lib/nutrition/coach/log-action"
import { PLANNER_MARKER } from "@/lib/nutrition/coach/orchestration"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"
import { createClient } from "@/lib/supabase/server"

/**
 * P0 — chat-driven meal logging continuity. Observed: Gemma suggests a meal, the user says "log this now", Gemma asks for the
 * meal type, the user answers and says "confirm" — and Gemma re-voices the original recommendation. The chat held no pending
 * log; "confirm" fell through to the generic follow-up/orchestration path. The write itself always goes through the existing
 * dante_tool_actions lifecycle (create pending → atomic confirm → log_meal_draft with the action id as idempotency key).
 */

const USER = "00000000-0000-4000-8000-0000000000aa"
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const basePlan = (): Json => ({
  understanding: { userGoal: "x", explicitRequests: [], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: [], continuationOfPreviousTurn: true, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
  need: { primaryNeed: "general", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "HIGH" },
  strategy: { mode: "CONTINUE", primaryObjective: "answer", supportingObjectives: [], requiresConfirmation: false },
  clarification: null,
  foods: [],
})

/** The model always re-voices the meal — exactly the observed regression if any turn reaches it. */
const REVOICE = "Here's your High-Protein Tuna Bread Bowl again: tuna and bread, great for your protein."

function session() {
  let active: Json | null = null
  let conversation: Json | undefined
  const recent: Array<{ role: "user" | "coach"; text: string }> = []
  return {
    get draft() {
      return active
    },
    /** What a tampered/old client could echo. */
    inject(patch: Json) {
      conversation = { ...(conversation ?? {}), ...patch }
    },
    async say(message: string): Promise<Json> {
      recent.push({ role: "user", text: message })
      const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, coachMode: "nutrition", activeDraft: active, conversation: { ...(conversation ?? {}), recentMessages: recent.slice(-6) } }) }))
      const json = (await response.json()) as Json
      recent.push({ role: "coach", text: json.reply })
      conversation = json.conversation
      if (json.mealDraft) active = json.mealDraft
      if (json.conversation?.deactivateDraft) active = null
      return json
    },
  }
}

let actionSeq = 0
const actions = new Map<string, { status: string; args: Json }>()
const logged: Json[] = []

beforeEach(() => {
  vi.clearAllMocks()
  actionSeq = 0
  actions.clear()
  logged.length = 0
  // Only the similar-meal lookup reads a table directly; everything else goes through mocked loaders / the action module.
  const similarQuery: Json = { select: () => similarQuery, eq: () => similarQuery, limit: async () => ({ data: logged.filter((row) => row.similarTo).map((row) => ({ id: row.foodLogId })), error: null }) }
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }, from: vi.fn((table: string) => { if (table === "food_logs") return similarQuery; throw new Error(`no direct table access: ${table}`) }) } as never)
  vi.mocked(loadNutritionContext).mockImplementation((async () => ({
    plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: [], excludedFoods: [], foodPreferences: [] } },
    targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
    fitnessGoal: "fat_loss",
    cookingAbility: null,
  })) as never)
  vi.mocked(loadFoodLogForDate).mockImplementation((async () => ({
    date: "2026-11-02",
    entries: logged.map((row) => ({ id: row.foodLogId, logDate: "2026-11-02", mealType: row.mealType, foodName: row.name, brand: null, source: "local", sourceId: null, barcode: null, quantityGrams: 300, servingName: null, servingsConsumed: null, calories: row.calories, proteinG: row.protein, carbsG: 0, fatG: 0, fiberG: null, isEstimated: false, estimationConfidence: null })),
    totals: { calories: 1500 + logged.reduce((s, r) => s + r.calories, 0), protein: 90 + logged.reduce((s, r) => s + r.protein, 0), carbs: 0, fat: 0 },
  })) as never)
  vi.mocked(callOpenAiWithFallback).mockImplementation(async (prompt: string) => ({ reply: prompt.includes(PLANNER_MARKER) ? JSON.stringify(basePlan()) : REVOICE, model: "test" }))
  vi.mocked(createPendingAction).mockImplementation(async (_s, _u, toolName, args, summary) => {
    const actionId = `00000000-0000-4000-8000-${String(++actionSeq).padStart(12, "0")}`
    actions.set(actionId, { status: "pending", args: args as Json })
    return { actionId, toolName, summary, expiresAt: new Date(Date.now() + 600_000).toISOString() }
  })
  // Same CAS contract as the real module: only a pending row can be claimed, and it runs exactly once.
  vi.mocked(confirmPendingAction).mockImplementation(async (_s, _c, actionId) => {
    const row = actions.get(actionId)
    if (!row) return { ok: false, status: "not_found", error: "Action not found.", code: "ACTION_NOT_FOUND" }
    if (row.status !== "pending") return { ok: false, status: "already_handled", error: `This action was already ${row.status}.`, code: "ACTION_ALREADY_PROCESSED" }
    row.status = "executed"
    const result = { foodLogId: `log-${actionId.slice(-4)}`, calories: 480, protein: 45 }
    logged.push({ ...result, mealType: row.args.mealType, name: row.args.name })
    return { ok: true, status: "executed", result }
  })
  vi.mocked(cancelPendingAction).mockImplementation(async (_s, _u, actionId) => {
    const row = actions.get(actionId)
    if (!row || row.status !== "pending") return { ok: false, status: "already_handled", error: "This action was already handled." }
    row.status = "cancelled"
    return { ok: true }
  })
})

async function suggested() {
  const s = session()
  const built = await s.say("I have tuna and bread. Build me a high protein meal")
  expect(built.route).toBe("build")
  expect(built.mealDraft?.name).toBeTruthy()
  return { s, name: built.mealDraft.name as string }
}

describe("P0 — suggested meal → log → meal type → confirm", () => {
  it("asks for the meal type, then a confirmation, then logs exactly once and reports the persisted outcome", async () => {
    const { s, name } = await suggested()
    const ask = await s.say("No, log this now to my plan.")
    expect(ask.reply).toMatch(/breakfast|lunch|dinner|snack/i)
    expect(ask.reply).not.toBe(REVOICE)
    expect(ask.conversation.pendingLog).toMatchObject({ stage: "AWAITING_REQUIRED_INPUT", missing: "mealType" })
    expect(createPendingAction).not.toHaveBeenCalled()

    const slot = await s.say("lunch")
    expect(slot.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION", mealType: "lunch" })
    expect(slot.reply).toMatch(/confirm/i)
    expect(slot.reply).toContain(name)
    expect(createPendingAction).toHaveBeenCalledTimes(1)
    expect(logged).toHaveLength(0) // nothing written before the confirmation

    const done = await s.say("confirm")
    expect(done.reply).not.toBe(REVOICE)
    expect(confirmPendingAction).toHaveBeenCalledTimes(1)
    expect(logged).toHaveLength(1)
    expect(done.conversation.pendingLog).toMatchObject({ stage: "VERIFIED", foodLogId: logged[0].foodLogId })
    expect(done.foodLogChanged).toBe(true)
    expect(done.reply).toMatch(/logged/i)
    expect(done.reply).toMatch(/lunch/i)
    // Remaining totals are re-read after the write, never computed from the model.
    expect(done.reply).toMatch(/remaining|left/i)

    // A repeated confirm never writes again.
    const again = await s.say("confirm")
    expect(logged).toHaveLength(1)
    expect(again.reply).toMatch(/already logged/i)
    expect(again.foodLogChanged).toBeFalsy()
  })

  it("logs in one step when the message already names the meal type, still only after confirmation", async () => {
    const { s } = await suggested()
    const ask = await s.say("log this for dinner")
    expect(ask.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION", mealType: "dinner" })
    expect(logged).toHaveLength(0)
    const yes = await s.say("yes")
    expect(logged).toHaveLength(1)
    expect(yes.conversation.pendingLog.stage).toBe("VERIFIED")
  })

  it("cancel rejects the pending action and writes nothing", async () => {
    const { s } = await suggested()
    await s.say("log this for lunch")
    const no = await s.say("cancel")
    expect(cancelPendingAction).toHaveBeenCalledTimes(1)
    expect(no.conversation.pendingLog ?? null).toBeNull()
    expect(no.reply).toMatch(/nothing was logged/i)
    const late = await s.say("confirm")
    expect(logged).toHaveLength(0)
    expect(late.reply).not.toMatch(/logged ✓|has been logged|is logged/i)
    // Live-found: with nothing pending, "confirm" re-voiced the meal ("X it is — about N kcal…"). It now says nothing is waiting.
    expect(late.reply).toMatch(/nothing is waiting to be logged/i)
    expect(late.reply).not.toBe(REVOICE)
  })

  it("a failed write keeps the pending context and offers a retry; it never claims success", async () => {
    const { s } = await suggested()
    await s.say("log this for lunch")
    vi.mocked(confirmPendingAction).mockResolvedValueOnce({ ok: false, status: "failed", error: "Database unavailable.", code: "ACTION_CONFIRMATION_FAILED" })
    const failed = await s.say("confirm")
    expect(logged).toHaveLength(0)
    expect(failed.reply).not.toMatch(/has been logged|logged it|is logged|logged ✓|^logged/i)
    expect(failed.reply).toMatch(/nothing was logged|wasn't logged|not logged/i)
    expect(failed.conversation.pendingLog).toMatchObject({ stage: "AWAITING_REQUIRED_INPUT" })
    // Retry creates a NEW action (the failed one is terminal) and logs once.
    await s.say("lunch")
    await s.say("confirm")
    expect(logged).toHaveLength(1)
  })

  it("a topic switch keeps the pending log; returning to it with 'confirm' resolves it", async () => {
    const { s } = await suggested()
    await s.say("log this for lunch")
    const aside = await s.say("how much protein is in 100 g chicken breast?")
    expect(aside.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION" })
    await s.say("ok confirm it")
    expect(logged).toHaveLength(1)
  })

  it("an unrelated 'yes' with no pending log never writes", async () => {
    const { s } = await suggested()
    await s.say("yes")
    expect(createPendingAction).not.toHaveBeenCalled()
    expect(confirmPendingAction).not.toHaveBeenCalled()
  })
})

describe("P0 — corrections, competing actions, safety, failures", () => {
  it("an edit after the proposal never logs the old portions: confirm re-proposes the edited meal", async () => {
    const { s } = await suggested()
    await s.say("log this for lunch")
    const firstArgs = [...actions.values()][0].args
    const edited = await s.say("make it higher protein")
    expect(edited.mealDraft).toBeTruthy()
    expect(edited.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION" })
    const re = await s.say("confirm")
    expect(logged).toHaveLength(0)
    expect(re.reply).toMatch(/changed/i)
    expect(re.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION", mealType: "lunch" })
    expect([...actions.values()][0].status).toBe("cancelled") // the old action can never be confirmed later
    await s.say("confirm")
    expect(logged).toHaveLength(1)
    expect([...actions.values()][1].args.ingredients).not.toEqual(firstArgs.ingredients)
  })

  it("two competing meals: a bare confirm asks which; 'the earlier one' logs the earlier meal", async () => {
    const { s, name } = await suggested()
    await s.say("log this for lunch")
    const second = await s.say("I have chicken and rice. Build me a high protein dinner")
    expect(second.mealDraft.name).not.toBe(name)
    const ask = await s.say("confirm")
    expect(logged).toHaveLength(0)
    expect(ask.reply).toMatch(/earlier one, or this one/i)
    expect(ask.conversation.pendingLog.ambiguity).toBe("other_draft")
    await s.say("the earlier one")
    expect(logged).toHaveLength(1)
    expect(logged[0].name).toBe(name)
  })

  it("an allergy added after the meal was built is a hard stop a confirmation cannot override", async () => {
    const { s } = await suggested()
    vi.mocked(loadNutritionContext).mockImplementation((async () => ({
      plan: { target: { calories: 2200, protein: 160, carbs: 250, fat: 70, proteinPerKg: 2, carbsPerKg: 3, fatPerKg: 1 }, input: { goal: "fat_loss", allergies: ["fish"], excludedFoods: [], foodPreferences: [] } },
      targets: getCanonicalNutritionTargets({ planTarget: { calories: 2200, protein: 160, carbs: 250, fat: 70 } }),
      fitnessGoal: "fat_loss",
      cookingAbility: null,
    })) as never)
    const blocked = await s.say("log this for lunch")
    expect(blocked.reply).toMatch(/allerg/i)
    expect(blocked.reply).toMatch(/won't log/i)
    expect(createPendingAction).not.toHaveBeenCalled()
    expect(blocked.conversation.pendingLog ?? null).toBeNull()
    await s.say("confirm")
    expect(logged).toHaveLength(0)
  })

  it("a lost confirm response is UNKNOWN_OUTCOME: never 'logged', never a second write; the next confirm checks and verifies", async () => {
    const { s } = await suggested()
    await s.say("log this for lunch")
    vi.mocked(confirmPendingAction).mockImplementationOnce(async (_s, _c, actionId) => {
      const row = actions.get(actionId)!
      row.status = "executed"
      logged.push({ foodLogId: "log-lost", calories: 480, protein: 45, mealType: row.args.mealType, name: row.args.name })
      throw new Error("socket hang up") // the write happened; the answer never arrived
    })
    vi.mocked(readPendingActionStatus).mockImplementation(async (_s, _u, actionId) => {
      const row = actions.get(actionId)
      return row ? { status: row.status as never, result: row.status === "executed" ? { foodLogId: "log-lost" } : null } : null
    })
    const lost = await s.say("confirm")
    expect(lost.reply).not.toMatch(/^logged/i)
    expect(lost.reply).toMatch(/couldn't confirm whether/i)
    expect(lost.conversation.pendingLog.stage).toBe("UNKNOWN_OUTCOME")
    const checked = await s.say("confirm")
    expect(logged).toHaveLength(1)
    expect(checked.conversation.pendingLog).toMatchObject({ stage: "VERIFIED", foodLogId: "log-lost" })
    expect(checked.reply).toMatch(/^Logged/)
  })

  it("Vietnamese: ghi món này → bữa trưa → xác nhận", async () => {
    const { s } = await suggested()
    const ask = await s.say("ghi món này nhé")
    expect(ask.reply).toMatch(/bữa nào/)
    const slot = await s.say("bữa trưa")
    expect(slot.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION", mealType: "lunch", lang: "vi" })
    const done = await s.say("xác nhận")
    expect(logged).toHaveLength(1)
    expect(done.reply).toMatch(/^Đã ghi/)
  })

  it("a forged or foreign action id confirms nothing", async () => {
    const { s } = await suggested()
    // Not in this user's actions (the real confirm is scoped to the session user + RLS: a foreign id looks exactly like a missing one).
    s.inject({ pendingLog: { stage: "READY_FOR_CONFIRMATION", draftId: s.draft!.id, mealName: "Anything", fingerprint: draftIdentity(s.draft as never), mealType: "lunch", actionId: "11111111-1111-4111-8111-111111111111", expiresAt: new Date(Date.now() + 60_000).toISOString() } })
    const forged = await s.say("confirm")
    expect(logged).toHaveLength(0)
    expect(forged.reply).toMatch(/can't find/i)
    expect(forged.conversation.pendingLog ?? null).toBeNull()
  })

  it("'add this to my meal plan' (no log verb) never creates a food-log action", async () => {
    const { s } = await suggested()
    await s.say("add this to my meal plan for tomorrow")
    expect(createPendingAction).not.toHaveBeenCalled()
  })
})

/**
 * MF-HOTFIX-GEMMA-P0 — free-text logging, planned-vs-eaten, and the "beside tuna" exclusion. Observed live before the fix:
 * "Log 200g chicken breast for lunch" → "I can't log that… would you like to confirm?" (no draft, nothing saved);
 * "Add this meal to tomorrow's meal plan" → a brand-new meal; "give me high protein meals beside tuna" → 2 of 3 options with tuna.
 */
const ingredientIds = (draft: Json | null | undefined): string[] => (draft?.ingredients ?? []).map((item: Json) => item.ingredientId)

describe("hotfix — direct food log from chat", () => {
  it("'Log 200g chicken breast for lunch' proposes, logs once on confirm, never twice", async () => {
    const s = session()
    const ask = await s.say("Log 200g chicken breast for lunch.")
    expect(ask.mealDraft?.ingredients).toEqual([expect.objectContaining({ ingredientId: "chicken_breast", grams: 200 })])
    expect(ask.conversation.pendingLog).toMatchObject({ stage: "READY_FOR_CONFIRMATION", mealType: "lunch" })
    expect(ask.reply).toMatch(/Nothing is saved until you confirm/)
    expect(vi.mocked(createPendingAction).mock.calls[0][3]).toMatchObject({ mealType: "lunch", ingredients: [{ ingredientId: "chicken_breast", grams: 200 }] })
    expect(logged).toHaveLength(0)

    const done = await s.say("confirm")
    expect(logged).toHaveLength(1)
    expect(done.conversation.pendingLog).toMatchObject({ stage: "VERIFIED", foodLogId: logged[0].foodLogId })
    expect(done.reply).toMatch(/^Logged/)
    await s.say("confirm")
    expect(logged).toHaveLength(1)
  })

  it("cancel after the proposal writes nothing and cancels the server action", async () => {
    const s = session()
    await s.say("log 150g chicken breast for dinner")
    const cancelled = await s.say("cancel")
    expect(cancelPendingAction).toHaveBeenCalledTimes(1)
    expect(logged).toHaveLength(0)
    expect(cancelled.reply).toMatch(/nothing was logged/i)
  })

  it.each(["Log 0g chicken breast for lunch", "Log 150g unicornium for dinner", "log 9000g chicken breast"])("'%s' saves nothing and says so", async (message) => {
    const reply = await session().say(message)
    expect(createPendingAction).not.toHaveBeenCalled()
    expect(reply.reply).toMatch(/nothing was saved/i)
    expect(reply.foodLogChanged).toBeFalsy()
  })

  it.each(["Add this meal to tomorrow's meal plan.", "log this for dinner tomorrow", "save this to my meal plan"])("planned meal '%s' is never logged as eaten", async (message) => {
    const { s } = await suggested()
    const reply = await s.say(message)
    expect(createPendingAction).not.toHaveBeenCalled()
    expect(reply.reply).toMatch(/isn't supported yet, so nothing was saved/)
  })

  it("'Add the meal we just discussed to my food log' is a log request for the meal in view", async () => {
    const { s, name } = await suggested()
    const ask = await s.say("Add the meal we just discussed to my food log.")
    expect(ask.conversation.pendingLog).toMatchObject({ stage: "AWAITING_REQUIRED_INPUT", mealName: name })
    expect(logged).toHaveLength(0)
  })
})

describe("hotfix — 'beside tuna' is an exclusion, and discovery never edits the active draft", () => {
  it("exact repro: with a tuna draft active, 'give me high protein meals beside tuna' returns only tuna-free options", async () => {
    const { s } = await suggested()
    const before = JSON.parse(JSON.stringify(s.draft))
    expect(ingredientIds(before)).toContain("tuna")
    const next = await s.say("give me high protein meals beside tuna")
    expect(next.route).toBe("build")
    const all = [next.mealDraft, ...(next.alternatives ?? [])]
    expect(all.length).toBeGreaterThanOrEqual(2)
    for (const option of all) expect(ingredientIds(option)).not.toContain("tuna")
    // Every RENDERED option is one of the evaluated, tuna-free candidates; no duplicate titles.
    const labels: string[] = next.presentedOptions.options.map((option: Json) => option.label)
    expect(labels.length).toBeGreaterThanOrEqual(2)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(all.some((option) => option.name === label)).toBe(true)
    // Discovery is a NEW draft: the earlier one is not edited, and nothing is logged.
    expect(next.draftTarget).toMatchObject({ mode: "NEW" })
    expect(next.mealDraft.id).not.toBe(before.id)
    expect(createPendingAction).not.toHaveBeenCalled()
  })

  it.each(["build me a high protein meal without tuna", "high protein meal other than tuna", "give me a high-protein meal, no more tuna"])("'%s' never selects tuna", async (message) => {
    const reply = await session().say(message)
    for (const option of [reply.mealDraft, ...(reply.alternatives ?? [])]) expect(ingredientIds(option)).not.toContain("tuna")
  })

  it("'make it cheaper' edits the draft criteria, never logs", async () => {
    const { s } = await suggested()
    await s.say("make it cheaper")
    expect(createPendingAction).not.toHaveBeenCalled()
    expect(logged).toHaveLength(0)
  })
})
