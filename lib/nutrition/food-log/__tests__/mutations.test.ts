import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Create / edit / delete (spec Part "10. TESTS") for the food_logs
 * mutation layer — the same functions every input source (barcode,
 * search, manual, photo, HawkerLens) writes through.
 */

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

import { createFoodLog, deleteFoodLog, updateFoodLogQuantity } from "@/lib/nutrition/food-log/mutations"

type Row = {
  id: string
  user_id: string
  log_date: string
  meal_type: string
  food_name: string
  brand: string | null
  source: string
  source_id: string | null
  barcode: string | null
  quantity_grams: number
  serving_name: string | null
  servings_consumed: number | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  is_estimated: boolean
  estimation_confidence: string | null
  estimation_reason: string | null
  estimated_from: string | null
  created_at: string
}

function createFakeSupabase() {
  const rows = new Map<string, Row>()
  let nextId = 1

  const client = {
    from(table: string) {
      if (table === "profiles") {
        // createFoodLog resolves "today" from the user's persisted
        // profile timezone when no explicit logDate is given (see
        // lib/nutrition/food-log/load-food-log-context.ts::resolveLocalToday) —
        // fixed at UTC here so test expectations don't depend on the
        // machine's local clock.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { timezone: "UTC" }, error: null }),
            }),
          }),
        }
      }

      if (table !== "food_logs") throw new Error(`Unexpected table: ${table}`)

      return {
        insert: (values: Partial<Row>) => ({
          select: () => ({
            single: async () => {
              const id = `row-${nextId++}`
              const row: Row = {
                id,
                user_id: values.user_id as string,
                log_date: values.log_date as string,
                meal_type: values.meal_type as string,
                food_name: values.food_name as string,
                brand: values.brand ?? null,
                source: values.source as string,
                source_id: values.source_id ?? null,
                barcode: values.barcode ?? null,
                quantity_grams: values.quantity_grams as number,
                serving_name: values.serving_name ?? null,
                servings_consumed: values.servings_consumed ?? null,
                calories: values.calories as number,
                protein_g: values.protein_g as number,
                carbs_g: values.carbs_g as number,
                fat_g: values.fat_g as number,
                fiber_g: values.fiber_g ?? null,
                is_estimated: values.is_estimated ?? false,
                estimation_confidence: values.estimation_confidence ?? null,
                estimation_reason: values.estimation_reason ?? null,
                estimated_from: values.estimated_from ?? null,
                created_at: new Date().toISOString(),
              }
              rows.set(id, row)
              return { data: row, error: null }
            },
          }),
        }),

        update: (values: Partial<Row>) => ({
          eq: (_c1: string, id: string) => ({
            eq: (_c2: string, userId: string) => ({
              select: () => ({
                single: async () => {
                  const existing = rows.get(id)
                  if (!existing || existing.user_id !== userId) {
                    return { data: null, error: { message: "not found" } }
                  }
                  const updated = { ...existing, ...values }
                  rows.set(id, updated)
                  return { data: updated, error: null }
                },
              }),
            }),
          }),
        }),

        delete: () => ({
          eq: (_c1: string, id: string) => ({
            eq: async (_c2: string, userId: string) => {
              const existing = rows.get(id)
              if (existing && existing.user_id === userId) rows.delete(id)
              return { error: null }
            },
          }),
        }),

        select: () => ({
          eq: (_c1: string, id: string) => ({
            eq: (_c2: string, userId: string) => ({
              single: async () => {
                const existing = rows.get(id)
                if (!existing || existing.user_id !== userId) {
                  return { data: null, error: { message: "not found" } }
                }
                return { data: existing, error: null }
              },
            }),
          }),
        }),
      }
    },
  }

  return { client, rows }
}

const USER_ID = "user-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createFoodLog", () => {
  it("scales macros deterministically from per100g x grams and persists the scaled totals", async () => {
    const { client } = createFakeSupabase()

    const result = await createFoodLog(client as never, USER_ID, {
      mealType: "lunch",
      foodName: "Chicken Breast — cooked",
      source: "local",
      per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      quantityGrams: 150,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.calories).toBe(247.5) // 165 * 1.5
      expect(result.data.proteinG).toBe(46.5)
    }
  })

  it("rejects a non-positive quantity", async () => {
    const { client } = createFakeSupabase()

    const result = await createFoodLog(client as never, USER_ID, {
      mealType: "lunch",
      foodName: "Test",
      source: "local",
      per100g: { calories: 100, protein: 1, carbs: 1, fat: 1 },
      quantityGrams: 0,
    })

    expect(result.success).toBe(false)
  })

  it("rejects a blank food name", async () => {
    const { client } = createFakeSupabase()

    const result = await createFoodLog(client as never, USER_ID, {
      mealType: "lunch",
      foodName: "   ",
      source: "local",
      per100g: { calories: 100, protein: 1, carbs: 1, fat: 1 },
      quantityGrams: 100,
    })

    expect(result.success).toBe(false)
  })

  it("never leaks a raw Supabase/schema error to the caller — logs it server-side and returns a clean message instead (Test: error sanitization)", async () => {
    const { client } = createFakeSupabase()
    const rawMessage = "Could not find the 'serving_name' column of 'food_logs' in the schema cache"

    // Force the insert path to fail exactly like the original bug.
    const originalFrom = client.from
    client.from = ((table: string) => {
      if (table !== "food_logs") return originalFrom(table)
      return {
        ...originalFrom(table),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: rawMessage } }),
          }),
        }),
      }
    }) as typeof client.from

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await createFoodLog(client as never, USER_ID, {
      mealType: "lunch",
      foodName: "Test",
      source: "local",
      per100g: { calories: 100, protein: 1, carbs: 1, fat: 1 },
      quantityGrams: 100,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).not.toContain("schema cache")
      expect(result.error).not.toContain("serving_name")
    }
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("createFoodLog"), rawMessage)

    consoleSpy.mockRestore()
  })
})

describe("updateFoodLogQuantity (edit)", () => {
  it("rescales macros for a new gram quantity by deriving the original per-100g profile back out", async () => {
    const { client } = createFakeSupabase()

    const created = await createFoodLog(client as never, USER_ID, {
      mealType: "breakfast",
      foodName: "Oats",
      source: "local",
      per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
      quantityGrams: 100,
    })
    if (!created.success) throw new Error("setup failed")

    const updated = await updateFoodLogQuantity(client as never, USER_ID, {
      id: created.data.id,
      quantityGrams: 50,
    })

    expect(updated.success).toBe(true)
    if (updated.success) {
      expect(updated.data.calories).toBe(194.5) // half of 389
      expect(updated.data.quantityGrams).toBe(50)
    }
  })

  it("fails for an entry that does not belong to this user", async () => {
    const { client } = createFakeSupabase()

    const created = await createFoodLog(client as never, "someone-else", {
      mealType: "breakfast",
      foodName: "Oats",
      source: "local",
      per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
      quantityGrams: 100,
    })
    if (!created.success) throw new Error("setup failed")

    const updated = await updateFoodLogQuantity(client as never, USER_ID, {
      id: created.data.id,
      quantityGrams: 50,
    })

    expect(updated.success).toBe(false)
  })
})

describe("deleteFoodLog", () => {
  it("removes an entry belonging to the user", async () => {
    const { client, rows } = createFakeSupabase()

    const created = await createFoodLog(client as never, USER_ID, {
      mealType: "dinner",
      foodName: "Rice",
      source: "local",
      per100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
      quantityGrams: 200,
    })
    if (!created.success) throw new Error("setup failed")

    const result = await deleteFoodLog(client as never, USER_ID, created.data.id)

    expect(result.success).toBe(true)
    expect(rows.has(created.data.id)).toBe(false)
  })

  it("does not remove another user's entry (isolation)", async () => {
    const { client, rows } = createFakeSupabase()

    const created = await createFoodLog(client as never, "owner", {
      mealType: "dinner",
      foodName: "Rice",
      source: "local",
      per100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
      quantityGrams: 200,
    })
    if (!created.success) throw new Error("setup failed")

    await deleteFoodLog(client as never, "attacker", created.data.id)

    expect(rows.has(created.data.id)).toBe(true)
  })
})


it.each([-1, NaN, Infinity])("does not persist an invalid nutrient %s from an internal caller", async (protein) => {
  const { client, rows } = createFakeSupabase();
  const result = await createFoodLog(client as never, USER_ID, {
    mealType: "lunch", foodName: "Test", source: "local",
    per100g: { calories: 100, protein, carbs: 10, fat: 2 }, quantityGrams: 100,
  });
  expect(result.success).toBe(false);
  expect(rows.size).toBe(0);
});

it("does not zero nutrient totals when editing a corrupt zero-gram row", async () => {
  const { client, rows } = createFakeSupabase();
  const created = await createFoodLog(client as never, USER_ID, {
    mealType: "lunch", foodName: "Test", source: "local",
    per100g: { calories: 100, protein: 10, carbs: 10, fat: 2 }, quantityGrams: 100,
  });
  if (!created.success) throw new Error(created.error);
  const row = rows.get(created.data.id)!;
  row.quantity_grams = 0;
  const result = await updateFoodLogQuantity(client as never, USER_ID, { id: row.id, quantityGrams: 200 });
  expect(result.success).toBe(false);
  expect(rows.get(row.id)?.calories).toBe(100);
});
