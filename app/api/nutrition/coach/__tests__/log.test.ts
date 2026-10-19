import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
let adminClient: unknown
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => adminClient }))
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn(async () => undefined) }))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutrition/food-log/load-food-log-context")>()),
  resolveLocalToday: vi.fn(async () => "2026-10-07"),
}))
vi.mock("@/lib/nutrition/coach/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nutrition/coach/context")>()),
  loadCoachContext: vi.fn(),
}))

import { POST as logRoute } from "@/app/api/nutrition/coach/log/route"
import { POST as confirmHttp } from "@/app/api/dante/tools/confirm/route"
import { POST as coachRoute } from "@/app/api/nutrition/coach/route"
import { confirmPendingAction } from "@/lib/dante-core/tools/pending-actions"
import { getDanteTool } from "@/lib/dante-core/tools/registry"
import { loadCoachContext } from "@/lib/nutrition/coach/context"
import { mealFingerprint } from "@/lib/nutrition/coach/fingerprint"
import { totalsFor } from "@/lib/nutrition/coach/macros"
import { createClient } from "@/lib/supabase/server"
import { makeCtx } from "@/lib/nutrition/coach/__tests__/fixtures"

const ALICE = "00000000-0000-4000-8000-0000000000a1"
const MALLORY = "00000000-0000-4000-8000-0000000000b2"

type Row = Record<string, unknown>

/** Minimal in-memory PostgREST fake: enforces unique(user_id, idempotency_key) on food_logs like the real table. */
function makeDb() {
  const tables: Record<string, Row[]> = { dante_tool_actions: [], food_logs: [] }

  function builder(table: string) {
    let mode: "select" | "insert" | "update" = "select"
    let payload: Row = {}
    const filters: Array<(row: Row) => boolean> = []
    let max = Infinity

    const run = (): { data: Row[] | null; error: { code?: string; message: string } | null } => {
      const rows = (tables[table] ??= [])
      if (mode === "insert") {
        if (table === "food_logs" && rows.some((r) => r.user_id === payload.user_id && r.idempotency_key === payload.idempotency_key)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } }
        }
        const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), executed_at: null, result: null, fiber_g: null, ...payload }
        rows.push(row)
        return { data: [row], error: null }
      }
      if (mode === "update" && table === "dante_tool_actions" && payload.status === "confirmed" && failures.claim) return { data: null, error: { message: failures.claim } }
      const matched = rows.filter((row) => filters.every((f) => f(row))).slice(0, max)
      if (mode === "update") for (const row of matched) Object.assign(row, payload)
      return { data: matched, error: null }
    }

    const q: Record<string, unknown> = {
      insert: (p: Row) => ((mode = "insert"), (payload = p), q),
      update: (p: Row) => ((mode = "update"), (payload = p), q),
      select: () => q,
      eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), q),
      gt: (column: string, value: string) => (filters.push((r) => String(r[column]) > value), q),
      limit: (n: number) => ((max = n), q),
      maybeSingle: async () => {
        const { data, error } = run()
        return { data: data?.[0] ?? null, error }
      },
      single: async () => {
        const { data, error } = run()
        return { data: data?.[0] ?? null, error: error ?? (data?.[0] ? null : { message: "no row" }) }
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }

  /** Mirrors public.finalize_food_log_action (real transactional behaviour is covered by the local E2E). */
  function finalize(userId: string | null, actionId: string, row: Row): { data: Row | null; error: { message: string; code?: string } | null } {
    const action = tables.dante_tool_actions.find((a) => a.id === actionId && a.user_id === userId)
    if (!userId || !action) return { data: null, error: { message: "ACTION_NOT_FOUND", code: "P0002" } }
    if (!["log_food", "log_meal_draft"].includes(String(action.tool_name))) return { data: null, error: { message: "ACTION_FORBIDDEN", code: "42501" } }
    if (!["confirmed", "executed"].includes(String(action.status))) return { data: null, error: { message: "ACTION_NOT_CONFIRMED", code: "P0001" } }
    if (failures.finalize) return { data: null, error: { message: failures.finalize } }
    let log = tables.food_logs.find((r) => r.user_id === userId && r.idempotency_key === actionId)
    if (!log) {
      log = { id: crypto.randomUUID(), created_at: new Date().toISOString(), fiber_g: null, ...row, user_id: userId, idempotency_key: actionId }
      tables.food_logs.push(log)
    }
    if (action.status !== "executed") Object.assign(action, { status: "executed", executed_at: new Date().toISOString(), result: { foodLogId: log.id } })
    return { data: log, error: null }
  }

  const failures: { finalize?: string; claim?: string } = {}

  /** Service-role client: RLS-bypassing, takes the session-derived user id explicitly. Browser clients have no rpc/writes. */
  const admin = {
    rpc: async (name: string, args: { p_action_id: string; p_user_id: string; p_row: Row }) => (name === "finalize_food_log_action" ? finalize(args.p_user_id, args.p_action_id, args.p_row) : { data: null, error: { message: "unknown rpc" } }),
    from: (table: string) => builder(table),
  }
  adminClient = admin

  const client = (userId: string | null) => ({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: userId ? null : { message: "none" } }) },
    from: (table: string) => builder(table),
  })

  return { tables, client, failures }
}

const MEAL = [
  { ingredientId: "chicken_breast", grams: 150 },
  { ingredientId: "rice", grams: 150 },
  { ingredientId: "broccoli", grams: 120 },
]

function draftBody(ingredients = MEAL, extra: Record<string, unknown> = {}) {
  const snapshot = {
    capturedAt: "2026-10-07T10:00:00.000Z",
    timezone: "Asia/Singapore",
    localDate: "2026-10-07",
    goal: "fat_loss",
    caloriesTarget: 2200,
    caloriesConsumed: 1680,
    caloriesRemaining: 520,
    proteinTarget: 160,
    proteinConsumed: 106,
    proteinRemaining: 54,
    contextVersion: "v",
  }
  return {
    id: crypto.randomUUID(),
    name: "High-Protein Chicken Rice Bowl",
    family: "savory_bowl",
    mode: "BALANCED",
    sessionContextSnapshot: snapshot,
    ingredients: ingredients.map((i) => ({ ...i, name: "x" })),
    constraints: { calorieCeiling: 520, calorieCeilingStrict: false, calorieCeilingSource: "context", proteinTarget: 54, proteinTargetSource: "context", maxPriceSgd: null, maxCookMinutes: null, availableIds: null },
    scalingMode: "AUTO",
    history: [{ version: 1, label: "Created", ingredients }],
    historyIndex: 0,
    acknowledgedContextVersion: null,
    craving: null,
    // A hostile client may try to dictate totals — these must be ignored.
    nutrition: { calories: 1, protein: 999, carbs: 0, fat: 0 },
    ...extra,
  }
}

const propose = (body: unknown) => logRoute(new Request("http://localhost/api/nutrition/coach/log", { method: "POST", body: JSON.stringify(body) }))

let db: ReturnType<typeof makeDb>
const confirmAs = (userId: string, actionId: string) =>
  confirmPendingAction(db.client(userId) as never, { supabase: db.client(userId) as never, userId, now: new Date(), timezone: "Asia/Singapore", cache: new Map() }, actionId)

beforeEach(() => {
  vi.clearAllMocks()
  db = makeDb()
  vi.mocked(createClient).mockImplementation((async () => db.client(ALICE)) as never)
  vi.mocked(loadCoachContext).mockResolvedValue({ ok: true, ctx: makeCtx() })
})

describe("auth", () => {
  it("requires authentication for drafts and logging", async () => {
    vi.mocked(createClient).mockImplementation((async () => db.client(null)) as never)
    expect((await propose({ draft: draftBody(), mealType: "dinner" })).status).toBe(401)
    expect((await coachRoute(new Request("http://localhost/api/nutrition/coach", { method: "POST", body: JSON.stringify({ action: "build" }) }))).status).toBe(401)
    expect(db.tables.dante_tool_actions).toHaveLength(0)
  })
})

describe("request bounds", () => {
  it("rejects oversized deterministic coach bodies before any work", async () => {
    const padding = "x".repeat(70 * 1024)
    const coach = await coachRoute(
      new Request("http://localhost/api/nutrition/coach", {
        method: "POST",
        body: JSON.stringify({ action: "build", padding }),
      }),
    )
    const log = await propose({ draft: draftBody(), mealType: "dinner", padding })

    expect(coach.status).toBe(413)
    expect(log.status).toBe(413)
    expect(db.tables.dante_tool_actions).toHaveLength(0)
    expect(db.tables.food_logs).toHaveLength(0)
  })
})

describe("explicit log confirmation", () => {
  it("proposing a log writes NOTHING to food_logs — only a pending action", async () => {
    const response = await propose({ draft: draftBody(), mealType: "dinner" })
    const json = await response.json()
    expect(json.ok).toBe(true)
    expect(json.pendingConfirmation).toMatchObject({ toolName: "log_meal_draft" })
    expect(db.tables.food_logs).toHaveLength(0)
    expect(db.tables.dante_tool_actions).toHaveLength(1)
    expect(db.tables.dante_tool_actions[0]).toMatchObject({ status: "pending", user_id: ALICE, tool_name: "log_meal_draft" })
  })

  it("confirming writes exactly one food log with server-recomputed macros and the meal fingerprint", async () => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    const outcome = await confirmAs(ALICE, pendingConfirmation.actionId)
    expect(outcome.ok).toBe(true)
    expect(db.tables.food_logs).toHaveLength(1)
    const row = db.tables.food_logs[0]
    const expected = totalsFor(MEAL)
    expect(Number(row.calories)).toBeCloseTo(expected.calories, 0)
    expect(Number(row.protein_g)).toBeCloseTo(expected.protein, 0)
    expect(Number(row.calories)).not.toBe(1) // client-supplied totals ignored
    expect(row).toMatchObject({ user_id: ALICE, meal_type: "dinner", source: "local", source_id: mealFingerprint(MEAL), idempotency_key: pendingConfirmation.actionId, is_estimated: false })
    expect(Number(row.quantity_grams)).toBe(420)
  })

  it("rejects a draft whose ingredients are not canonical", async () => {
    const response = await propose({ draft: draftBody([{ ingredientId: "mystery_meat", grams: 100 }] as never), mealType: "dinner" })
    expect(response.status).toBe(400)
  })

  it("rejects an ingredient blocked by current server-side allergies", async () => {
    vi.mocked(loadCoachContext).mockResolvedValue({ ok: true, ctx: makeCtx({ allergies: ["dairy"] }) })
    const yogurt = [{ ingredientId: "greek_yogurt", grams: 200 }]
    const response = await propose({ draft: draftBody(yogurt), mealType: "snack" })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ ok: false, code: "BLOCKED_INGREDIENT" })
    expect(db.tables.dante_tool_actions).toHaveLength(0)
  })

  it("rechecks current allergies at confirmation time", async () => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    vi.mocked(loadCoachContext).mockResolvedValue({ ok: true, ctx: makeCtx({ allergies: ["poultry"] }) })

    const outcome = await confirmAs(ALICE, pendingConfirmation.actionId)

    expect(outcome.ok).toBe(false)
    expect(db.tables.food_logs).toHaveLength(0)
  })
})

describe("stale context", () => {
  const staleBefore = () => vi.mocked(loadCoachContext).mockResolvedValue({ ok: true, ctx: makeCtx({ caloriesTarget: 2000 }) })

  it("unchanged context: proposal + confirm succeed", async () => {
    const proposed = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    expect(proposed.ok).toBe(true)
    expect(db.tables.dante_tool_actions[0].args).toMatchObject({ context: { caloriesTarget: 2200, proteinTarget: 160, caloriesRemaining: 520 } })
    expect((await confirmAs(ALICE, proposed.pendingConfirmation.actionId)).ok).toBe(true)
    expect(db.tables.food_logs).toHaveLength(1)
  })

  it("target changed before proposal: stale result, no action created", async () => {
    staleBefore()
    const json = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    expect(json).toMatchObject({ ok: false, code: "STALE_CONTEXT", actions: ["Refresh meal", "Keep current draft"] })
    expect(db.tables.dante_tool_actions).toHaveLength(0)
  })

  it("'Keep current draft' lets the old meal concept be proposed", async () => {
    staleBefore()
    const current = makeCtx({ caloriesTarget: 2000 }).snapshot.contextVersion
    const json = await (await propose({ draft: draftBody(MEAL, { acknowledgedContextVersion: current }), mealType: "dinner" })).json()
    expect(json.ok).toBe(true)
    expect(db.tables.dante_tool_actions[0].args).toMatchObject({ context: { caloriesTarget: 2000 } })
  })

  it("target changed between proposal and confirmation: confirmation blocks", async () => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    staleBefore()
    const outcome = await confirmAs(ALICE, pendingConfirmation.actionId)
    expect(outcome).toMatchObject({ ok: false, code: "ACTION_STALE" })
    expect(db.tables.food_logs).toHaveLength(0)
    expect(db.tables.dante_tool_actions[0].status).toBe("failed")
  })

  it("an acknowledged stale draft still cannot bypass allergy/exclusion safety", async () => {
    staleBefore()
    const current = makeCtx({ caloriesTarget: 2000 }).snapshot.contextVersion
    const { pendingConfirmation } = await (await propose({ draft: draftBody(MEAL, { acknowledgedContextVersion: current }), mealType: "dinner" })).json()

    // allergy added after proposal; context itself unchanged since proposal
    vi.mocked(loadCoachContext).mockResolvedValue({ ok: true, ctx: makeCtx({ caloriesTarget: 2000, allergies: ["poultry"] }) })
    expect(await confirmAs(ALICE, pendingConfirmation.actionId)).toMatchObject({ ok: false, code: "ACTION_FORBIDDEN" })
    expect(db.tables.food_logs).toHaveLength(0)

    // and at proposal time an acknowledged draft with a blocked ingredient is rejected outright
    const blocked = await propose({ draft: draftBody(MEAL, { acknowledgedContextVersion: current }), mealType: "dinner" })
    expect(blocked.status).toBe(422)
  })
})

describe("confirmation error sanitization", () => {
  const SECRET = "FATAL: password authentication failed for user supabase_admin at 10.0.0.5"
  const confirmOverHttp = (actionId: string) => confirmHttp(new Request("http://localhost/api/dante/tools/confirm", { method: "POST", body: JSON.stringify({ actionId, intent: "confirm" }) }))

  it.each([
    ["claim", "ACTION_CONFIRMATION_FAILED"],
    ["finalize", "ACTION_CONFIRMATION_FAILED"],
  ] as const)("never returns raw datastore error text over HTTP (%s failure)", async (stage, code) => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    db.failures[stage] = SECRET

    const response = await confirmOverHttp(pendingConfirmation.actionId)
    const text = await response.text()

    expect(response.status).toBe(422)
    expect(text).not.toContain("password authentication")
    expect(text).not.toContain("10.0.0.5")
    expect(JSON.parse(text)).toMatchObject({ ok: false, code })
    expect(db.tables.food_logs).toHaveLength(0)
    spy.mockRestore()
  })

  it("maps a repeat confirmation to ACTION_ALREADY_PROCESSED and an unknown action to ACTION_NOT_FOUND", async () => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    await confirmOverHttp(pendingConfirmation.actionId)
    expect(await (await confirmOverHttp(pendingConfirmation.actionId)).json()).toMatchObject({ code: "ACTION_ALREADY_PROCESSED" })
    expect(await (await confirmOverHttp(crypto.randomUUID())).json()).toMatchObject({ code: "ACTION_NOT_FOUND" })
  })
})

describe("idempotency", () => {
  it("retrying the same confirmed action never double-logs", async () => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    const first = await confirmAs(ALICE, pendingConfirmation.actionId)
    const retry = await confirmAs(ALICE, pendingConfirmation.actionId)
    expect(first.ok).toBe(true)
    expect(retry.ok).toBe(false)
    expect(db.tables.food_logs).toHaveLength(1)

    // Even a direct re-execution with the same action id (e.g. a crash after the write) resolves to the same row.
    const tool = getDanteTool("log_meal_draft")!
    const args = tool.inputSchema.parse(db.tables.dante_tool_actions[0].args)
    const again = await tool.execute({ supabase: db.client(ALICE) as never, userId: ALICE, now: new Date(), actionId: pendingConfirmation.actionId }, args)
    expect(again.ok).toBe(true)
    expect(db.tables.food_logs).toHaveLength(1)
  })

  it("a NEW confirmed action for the same meal is allowed after the user acknowledges the similarity warning", async () => {
    const first = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    await confirmAs(ALICE, first.pendingConfirmation.actionId)

    const warned = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    expect(warned).toMatchObject({ ok: false, code: "SIMILAR_MEAL_LOGGED_TODAY", actions: ["Log again", "Cancel"] })
    expect(db.tables.dante_tool_actions).toHaveLength(1) // the warning created no action

    const second = await (await propose({ draft: draftBody(), mealType: "dinner", acknowledgeSimilar: true })).json()
    expect(second.ok).toBe(true)
    expect(second.pendingConfirmation.actionId).not.toBe(first.pendingConfirmation.actionId)
    await confirmAs(ALICE, second.pendingConfirmation.actionId)
    expect(db.tables.food_logs).toHaveLength(2)
  })

  it("does not warn for a genuinely different meal", async () => {
    const first = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    await confirmAs(ALICE, first.pendingConfirmation.actionId)
    const other = await (await propose({ draft: draftBody([{ ingredientId: "white_fish", grams: 150 }, { ingredientId: "rice", grams: 150 }]), mealType: "dinner" })).json()
    expect(other.ok).toBe(true)
  })

  it("does not treat a non-local source id as a Nutrition Coach fingerprint", async () => {
    db.tables.food_logs.push({
      id: crypto.randomUUID(),
      user_id: ALICE,
      log_date: "2026-10-07",
      source: "usda",
      source_id: mealFingerprint(MEAL),
    })

    const result = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    expect(result.ok).toBe(true)
  })

  it("the similarity warning is scoped to the user", async () => {
    const first = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    await confirmAs(ALICE, first.pendingConfirmation.actionId)
    vi.mocked(createClient).mockImplementation((async () => db.client(MALLORY)) as never)
    const theirs = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    expect(theirs.ok).toBe(true)
  })
})

describe("cross-user isolation", () => {
  it("another user cannot confirm someone else's pending meal log", async () => {
    const { pendingConfirmation } = await (await propose({ draft: draftBody(), mealType: "dinner" })).json()
    const outcome = await confirmAs(MALLORY, pendingConfirmation.actionId)
    expect(outcome.ok).toBe(false)
    expect(db.tables.food_logs).toHaveLength(0)
  })
})
