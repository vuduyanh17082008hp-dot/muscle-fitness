import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Create / edit / delete (spec Part "10. TESTS") for the food_logs
 * mutation layer — the same functions every input source (barcode,
 * search, manual, photo, HawkerLens) writes through.
 */

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

import { emitEvent } from "@/lib/events/emit"
import { createFoodLog, deleteFoodLog, updateFoodLogQuantity } from "@/lib/nutrition/food-log/mutations"

const KEY_A = "11111111-1111-4111-8111-111111111111"
const KEY_B = "22222222-2222-4222-8222-222222222222"

const CHICKEN = {
  mealType: "lunch" as const,
  foodName: "Chicken Breast — cooked",
  source: "local" as const,
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  quantityGrams: 150,
}

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
  idempotency_key: string | null
  created_at: string
}

function createFakeSupabase(timezone = "UTC") {
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
              maybeSingle: async () => ({ data: { timezone }, error: null }),
            }),
          }),
        }
      }

      if (table !== "food_logs") throw new Error(`Unexpected table: ${table}`)

      return {
        insert: (values: Partial<Row>) => ({
          select: () => ({
            single: async () => {
              const key = values.idempotency_key ?? null
              if (key) {
                for (const existing of rows.values()) {
                  if (existing.user_id === values.user_id && existing.idempotency_key === key) {
                    return { data: null, error: { message: "duplicate key", code: "23505" } }
                  }
                }
              }
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
                idempotency_key: key,
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

        select: () => {
          const filters: Record<string, string> = {}
          const chain = {
            eq(column: string, value: string) {
              filters[column] = value
              return chain
            },
            async single() {
              const match = find()
              if (!match) return { data: null, error: { message: "not found" } }
              return { data: match, error: null }
            },
            async maybeSingle() {
              return { data: find(), error: null }
            },
          }
          function find() {
            return [...rows.values()].find((row) =>
              Object.entries(filters).every(([column, value]) => {
                if (column === "id") return row.id === value
                if (column === "user_id") return row.user_id === value
                if (column === "idempotency_key") return row.idempotency_key === value
                return true
              }),
            )
          }
          return chain
        },
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

describe("createFoodLog request idempotency", () => {
  it("replays the same user + key without inserting or emitting again", async () => {
    const { client, rows } = createFakeSupabase()

    const first = await createFoodLog(client as never, USER_ID, { ...CHICKEN, idempotencyKey: KEY_A })
    const second = await createFoodLog(client as never, USER_ID, { ...CHICKEN, idempotencyKey: KEY_A })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    if (first.success && second.success) {
      expect(second.data.id).toBe(first.data.id)
      expect(second.data.calories).toBe(first.data.calories)
    }
    expect(rows.size).toBe(1)
    expect(emitEvent).toHaveBeenCalledTimes(1)
  })

  it("allows the same food twice when the keys differ", async () => {
    const { client, rows } = createFakeSupabase()

    const first = await createFoodLog(client as never, USER_ID, { ...CHICKEN, idempotencyKey: KEY_A })
    const second = await createFoodLog(client as never, USER_ID, { ...CHICKEN, idempotencyKey: KEY_B })

    expect(first.success && second.success).toBe(true)
    expect(rows.size).toBe(2)
    const calories = [...rows.values()].reduce((sum, row) => sum + Number(row.calories), 0)
    expect(calories).toBe(495)
  })

  it("scopes uniqueness to the authenticated user", async () => {
    const { client, rows } = createFakeSupabase()

    const first = await createFoodLog(client as never, USER_ID, { ...CHICKEN, idempotencyKey: KEY_A })
    const second = await createFoodLog(client as never, "user-2", { ...CHICKEN, idempotencyKey: KEY_A })

    expect(first.success && second.success).toBe(true)
    if (first.success && second.success) {
      expect(second.data.id).not.toBe(first.data.id)
    }
    expect(rows.size).toBe(2)
  })

  it("rejects a malformed idempotency key", async () => {
    const { client, rows } = createFakeSupabase()

    const result = await createFoodLog(client as never, USER_ID, {
      ...CHICKEN,
      idempotencyKey: "not-a-uuid",
    })

    expect(result).toMatchObject({ success: false, status: 400 })
    expect(rows.size).toBe(0)
  })
})

describe("createFoodLog write-date window", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("accepts the profile-local today around Singapore UTC midnight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-06T16:30:00.000Z"))
    const { client } = createFakeSupabase("Asia/Singapore")

    const result = await createFoodLog(client as never, USER_ID, {
      ...CHICKEN,
      logDate: "2026-10-07",
      idempotencyKey: KEY_A,
    })

    expect(result.success).toBe(true)
  })

  it("rejects the UTC date when it is not the profile-local today", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-06T16:30:00.000Z"))
    const { client, rows } = createFakeSupabase("Asia/Singapore")

    const result = await createFoodLog(client as never, USER_ID, {
      ...CHICKEN,
      logDate: "2026-10-06",
      idempotencyKey: KEY_A,
    })

    expect(result).toMatchObject({ success: false, status: 400 })
    expect(rows.size).toBe(0)
  })

  it("rejects a far-future write date", async () => {
    const { client } = createFakeSupabase()
    const result = await createFoodLog(client as never, USER_ID, {
      ...CHICKEN,
      logDate: "2099-01-01",
      idempotencyKey: KEY_A,
    })
    expect(result).toMatchObject({ success: false, status: 400 })
  })

  it("rejects a historical write date", async () => {
    const { client } = createFakeSupabase()
    const result = await createFoodLog(client as never, USER_ID, {
      ...CHICKEN,
      logDate: "2020-01-01",
      idempotencyKey: KEY_A,
    })
    expect(result).toMatchObject({ success: false, status: 400 })
  })
})
