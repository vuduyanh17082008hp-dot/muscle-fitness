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

function createFakeSupabase() {
  const insertedFoodLogs: Record<string, unknown>[] = []
  const scanUpdates: Record<string, unknown>[] = []

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
                insertedFoodLogs.push(values)
                return {
                  data: {
                    id: `log-${insertedFoodLogs.length}`,
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
                  },
                  error: null,
                }
              },
            }),
          }),
        }
      }

      if (table === "hawkerlens_scans") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                scanUpdates.push(values)
                return { error: null }
              },
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return { client, insertedFoodLogs, scanUpdates }
}

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
          { name: "Rice", grams: 150, per100g: { calories: 200, protein: 4.2, carbs: 33, fat: 5.5 }, confidence: 0.8 }, // user reduced from 240g
          { name: "Chicken", grams: 180, per100g: { calories: 215, protein: 19, carbs: 0, fat: 15 }, confidence: 0.8 }, // user increased
        ],
      }),
    )

    const body = (await response.json()) as { ok: boolean; savedIds: string[] }
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.savedIds).toHaveLength(2)
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
