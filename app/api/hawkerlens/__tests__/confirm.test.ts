import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * "Component adjustment" + "confirmation" (spec Part "10. TESTS") for
 * POST /api/hawkerlens/confirm — the user's edited component list is
 * what gets saved, through the same createFoodLog() path every other
 * source uses.
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

import { createClient } from "@/lib/supabase/server"

const USER_ID = "user-1"

/**
 * food_logs fake that behaves like the real table where it matters here:
 * (user_id, idempotency_key) is unique (23505 on replay) and createFoodLog's
 * replay lookup returns the existing row. `failNames` makes inserts for those
 * food names fail like a transient DB error.
 */
function createFakeSupabase({ failNames = new Set<string>() }: { failNames?: Set<string> } = {}) {
  const insertedFoodLogs: Record<string, unknown>[] = []
  const scanUpdates: Record<string, unknown>[] = []
  const rowFor = (values: Record<string, unknown>, id: string) => ({
    id,
    log_date: "2026-09-13",
    meal_type: values.meal_type,
    food_name: values.food_name,
    brand: null,
    source: values.source,
    source_id: null,
    barcode: null,
    quantity_grams: values.quantity_grams,
    serving_name: null,
    servings_consumed: null,
    calories: values.calories,
    protein_g: values.protein_g,
    carbs_g: values.carbs_g,
    fat_g: values.fat_g,
    fiber_g: values.fiber_g,
    is_estimated: values.is_estimated,
    estimation_confidence: values.estimation_confidence,
    estimation_reason: values.estimation_reason,
    estimated_from: values.estimated_from,
    created_at: new Date().toISOString(),
  })

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from(table: string) {
      if (table === "profiles") {
        // createFoodLog resolves "today" from the user's persisted
        // profile timezone when no explicit logDate is given (see
        // lib/nutrition/food-log/load-food-log-context.ts::resolveLocalToday).
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { timezone: "UTC" }, error: null }),
            }),
          }),
        }
      }

      if (table === "food_logs") {
        return {
          insert: (values: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (failNames.has(String(values.food_name).split(" (")[0])) {
                  return { data: null, error: { code: "08006", message: "connection failure" } }
                }
                if (insertedFoodLogs.some((row) => row.idempotency_key === values.idempotency_key)) {
                  return { data: null, error: { code: "23505", message: "duplicate key" } }
                }
                insertedFoodLogs.push(values)
                return { data: rowFor(values, `log-${insertedFoodLogs.length}`), error: null }
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: (_column: string, key: string) => ({
                maybeSingle: async () => {
                  const index = insertedFoodLogs.findIndex((row) => row.idempotency_key === key)
                  return { data: index < 0 ? null : rowFor(insertedFoodLogs[index], `log-${index + 1}`), error: null }
                },
              }),
            }),
          }),
        }
      }

      if (table === "hawkerlens_scans") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                is: async () => {
                  scanUpdates.push(values)
                  return { error: null }
                },
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return { client, insertedFoodLogs, scanUpdates }
}

const RICE = { name: "Rice", grams: 150, per100g: { calories: 200, protein: 4.2, carbs: 33, fat: 5.5 }, confidence: 0.8, idempotencyKey: "11111111-1111-4111-8111-111111111111" }
const CHICKEN = { name: "Chicken", grams: 180, per100g: { calories: 215, protein: 19, carbs: 0, fat: 15 }, confidence: 0.8, idempotencyKey: "22222222-2222-4222-8222-222222222222" }
const SOUP = { name: "Soup", grams: 200, per100g: { calories: 20, protein: 1, carbs: 2, fat: 0.5 }, confidence: 0.5, idempotencyKey: "33333333-3333-4333-8333-333333333333" }

type ConfirmBody = { ok: boolean; status: string; results: Array<{ idempotencyKey: string; ok: boolean; entryId?: string; error?: string }> }

function postJson(body: unknown) {
  return new Request("http://localhost/api/hawkerlens/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
})

async function confirm(client: unknown, components: unknown[]) {
  vi.mocked(createClient).mockResolvedValue(client as never)
  const { POST } = await import("../confirm/route")
  const response = await POST(postJson({ scanId: "11111111-1111-1111-1111-111111111111", dish: "chicken_rice", mealType: "lunch", components }))
  return { status: response.status, body: (await response.json()) as ConfirmBody }
}

describe("POST /api/hawkerlens/confirm — partial outcomes are never reported as success", () => {
  it("first item fails, later items save: PARTIAL (207, ok:false) with per-item results", async () => {
    const fake = createFakeSupabase({ failNames: new Set(["Rice"]) })
    const { status, body } = await confirm(fake.client, [RICE, CHICKEN, SOUP])

    expect(status).toBe(207)
    expect(body).toMatchObject({ ok: false, status: "partial" })
    expect(body.results.map((r) => r.ok)).toEqual([false, true, true])
    expect(body.results[0]).toMatchObject({ idempotencyKey: RICE.idempotencyKey, ok: false })
    expect(fake.insertedFoodLogs).toHaveLength(2)
  })

  it("last item fails: PARTIAL", async () => {
    const fake = createFakeSupabase({ failNames: new Set(["Soup"]) })
    const { status, body } = await confirm(fake.client, [RICE, CHICKEN, SOUP])

    expect(status).toBe(207)
    expect(body.status).toBe("partial")
    expect(body.results.map((r) => r.ok)).toEqual([true, true, false])
  })

  it("all items fail: FAILED (500), nothing saved, scan confirmation not recorded", async () => {
    const fake = createFakeSupabase({ failNames: new Set(["Rice", "Chicken"]) })
    const { status, body } = await confirm(fake.client, [RICE, CHICKEN])

    expect(status).toBe(500)
    expect(body).toMatchObject({ ok: false, status: "failed" })
    expect(body.results.every((r) => !r.ok)).toBe(true)
    expect(fake.insertedFoodLogs).toHaveLength(0)
    expect(fake.scanUpdates).toHaveLength(0)
  })

  it("retrying after a partial save resends only the failures and never duplicates a row", async () => {
    const failNames = new Set(["Chicken"])
    const fake = createFakeSupabase({ failNames })
    const first = await confirm(fake.client, [RICE, CHICKEN])
    expect(first.body.status).toBe("partial")

    failNames.clear() // transient failure is over
    const retry = await confirm(fake.client, [CHICKEN])
    expect(retry.body).toMatchObject({ ok: true, status: "complete" })

    // A blind full replay (same keys) is idempotent too: existing rows come back, no new inserts.
    const replay = await confirm(fake.client, [RICE, CHICKEN])
    expect(replay.body.status).toBe("complete")
    expect(replay.body.results.map((r) => r.entryId)).toEqual(["log-1", "log-2"])

    expect(fake.insertedFoodLogs.map((row) => row.food_name)).toEqual([
      "Rice (HawkerLens: chicken rice)",
      "Chicken (HawkerLens: chicken rice)",
    ])
  })
})

describe("POST /api/hawkerlens/confirm", () => {
  it("saves each confirmed, user-adjusted component as its own food_logs row via the shared createFoodLog path", async () => {
    const { client, insertedFoodLogs, scanUpdates } = createFakeSupabase()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import("../confirm/route")

    const response = await POST(
      postJson({
        scanId: "11111111-1111-1111-1111-111111111111",
        dish: "chicken_rice",
        mealType: "lunch",
        components: [
          { name: "Rice", grams: 150, per100g: { calories: 200, protein: 4.2, carbs: 33, fat: 5.5 }, confidence: 0.8, idempotencyKey: "11111111-1111-4111-8111-111111111111" }, // user reduced from 240g
          { name: "Chicken", grams: 180, per100g: { calories: 215, protein: 19, carbs: 0, fat: 15 }, confidence: 0.8, idempotencyKey: "22222222-2222-4222-8222-222222222222" }, // user increased
        ],
      }),
    )

    const body = (await response.json()) as ConfirmBody
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: "complete" })
    expect(body.results.every((r) => r.ok)).toBe(true)
    expect(insertedFoodLogs).toHaveLength(2)
    expect(insertedFoodLogs[0]).toMatchObject({ source: "ai_estimate", is_estimated: true, quantity_grams: 150 })
    expect(insertedFoodLogs[1]).toMatchObject({ quantity_grams: 180 })
    expect(scanUpdates).toHaveLength(1) // the original prediction is preserved; only the confirmation is recorded
  })

  it("rejects unauthenticated requests", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    } as never)

    const { POST } = await import("../confirm/route")
    const response = await POST(
      postJson({ dish: "chicken_rice", mealType: "lunch", components: [{ name: "Rice", grams: 100, per100g: { calories: 100, protein: 1, carbs: 1, fat: 1 } }] }),
    )

    expect(response.status).toBe(401)
  })

  it("rejects an invalid dish id — the typed enum is enforced server-side, not just client-side", async () => {
    const { client } = createFakeSupabase()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import("../confirm/route")
    const response = await POST(
      postJson({
        dish: "not_a_real_dish",
        mealType: "lunch",
        components: [{ name: "Rice", grams: 100, per100g: { calories: 100, protein: 1, carbs: 1, fat: 1 } }],
      }),
    )

    expect(response.status).toBe(400)
  })

  it("rejects an empty component list", async () => {
    const { client } = createFakeSupabase()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import("../confirm/route")
    const response = await POST(postJson({ dish: "chicken_rice", mealType: "lunch", components: [] }))

    expect(response.status).toBe(400)
  })
})
