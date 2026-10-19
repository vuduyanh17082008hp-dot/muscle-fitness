import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Create / edit / delete (spec Part "10. TESTS") for the food_logs
 * mutation layer — the same functions every input source (barcode,
 * search, manual, photo, HawkerLens) writes through.
 */

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

// The server's own lookups (never the network in tests). Default: nothing resolves, so an unverifiable claim is the baseline.
vi.mock("@/lib/nutrition/food-data/usda", () => ({ getFoodById: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/nutrition/food-data/open-food-facts", () => ({ getProductByBarcode: vi.fn().mockResolvedValue(null) }))

import { emitEvent } from "@/lib/events/emit"
import { getProductByBarcode } from "@/lib/nutrition/food-data/open-food-facts"
import { getFoodById } from "@/lib/nutrition/food-data/usda"
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

/**
 * B2 — server-authoritative provenance. The request may PROPOSE source / per100g / isEstimated; only a record the
 * server re-resolves itself is stored as verified, and then with the SERVER's profile.
 */
describe("createFoodLog provenance trust boundary", () => {
  const FAKE = { calories: 900, protein: 99, carbs: 0, fat: 1 }
  const base = { mealType: "lunch" as const, quantityGrams: 200 }
  const usdaCod = {
    id: "usda-175174", name: "Fish, cod, Atlantic, cooked, dry heat", source: "usda" as const, sourceId: "175174", sourceLabel: "USDA FoodData Central",
    preparationState: "cooked" as const, per100g: { calories: 105, protein: 22.8, carbs: 0, fat: 0.9 },
  }
  const stored = (rows: Map<string, Row>) => [...rows.values()][0]

  it("1. source=usda + fake per100g + isEstimated=false, no resolvable record -> stored as user_provided, estimated", async () => {
    vi.mocked(getFoodById).mockResolvedValueOnce(null)
    const { client, rows } = createFakeSupabase()
    const result = await createFoodLog(client as never, USER_ID, { ...base, foodName: "Cod", source: "usda", sourceId: "999999", per100g: FAKE, isEstimated: false })
    expect(result.success).toBe(true)
    expect(stored(rows)).toMatchObject({ source: "user_provided", is_estimated: true, estimation_confidence: "low" })
    expect(stored(rows).estimation_reason).toMatch(/Could not be verified against USDA/)
  })

  it("1b. source=usda with no / non-numeric sourceId is never looked up and never verified", async () => {
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Cod", source: "usda", per100g: FAKE, isEstimated: false })
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Cod", source: "usda", sourceId: "../etc", per100g: FAKE, isEstimated: false })
    expect(getFoodById).not.toHaveBeenCalled()
    expect(rows.size).toBe(2)
    for (const row of rows.values()) expect(row).toMatchObject({ source: "user_provided", is_estimated: true })
  })

  it("1c. source=usda + REAL id + fake per100g -> the server's USDA profile is stored, the submitted macros are discarded", async () => {
    vi.mocked(getFoodById).mockResolvedValueOnce(usdaCod)
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Cod", source: "usda", sourceId: "175174", per100g: FAKE, isEstimated: false })
    expect(stored(rows)).toMatchObject({ source: "usda", is_estimated: false, calories: 210, protein_g: 45.6, fat_g: 1.8 })
  })

  it("2. local verified source + altered client macros -> recomputed from the server's local table", async () => {
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, quantityGrams: 100, foodName: "Oats", source: "local", sourceId: "local-oats-raw", per100g: { calories: 10, protein: 90, carbs: 1, fat: 0 } })
    expect(stored(rows)).toMatchObject({ source: "local", is_estimated: false, calories: 389, protein_g: 16.9 })
  })

  it("2b. local claim with an unknown id -> user_provided, estimated", async () => {
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Oats", source: "local", sourceId: "local-nope", per100g: FAKE })
    expect(stored(rows)).toMatchObject({ source: "user_provided", is_estimated: true })
  })

  it("3. negative per100g is rejected", async () => {
    const { client, rows } = createFakeSupabase()
    const result = await createFoodLog(client as never, USER_ID, { ...base, foodName: "X", source: "user_provided", per100g: { calories: 100, protein: -5, carbs: 0, fat: 0 } })
    expect(result).toMatchObject({ success: false, status: 400 })
    expect(rows.size).toBe(0)
  })

  it.each([
    ["500 g protein per 100 g", { calories: 400, protein: 500, carbs: 0, fat: 0 }],
    ["macros summing past 100 g", { calories: 400, protein: 60, carbs: 40, fat: 30 }],
    ["5000 kcal per 100 g", { calories: 5000, protein: 10, carbs: 10, fat: 10 }],
    ["NaN", { calories: Number.NaN, protein: 10, carbs: 10, fat: 10 }],
    ["Infinity", { calories: 100, protein: Number.POSITIVE_INFINITY, carbs: 10, fat: 10 }],
  ])("4. impossible values are rejected: %s", async (_label, per100g) => {
    const { client, rows } = createFakeSupabase()
    const result = await createFoodLog(client as never, USER_ID, { ...base, foodName: "X", source: "user_provided", per100g })
    expect(result).toMatchObject({ success: false, status: 400 })
    expect(rows.size).toBe(0)
  })

  it("5. legitimate verified food stays verified (server profile used)", async () => {
    vi.mocked(getFoodById).mockResolvedValueOnce(usdaCod)
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, quantityGrams: 150, foodName: usdaCod.name, source: "usda", sourceId: "175174", per100g: usdaCod.per100g })
    expect(stored(rows)).toMatchObject({ source: "usda", source_id: "175174", is_estimated: false, estimation_reason: null, protein_g: 34.2 })
  })

  it("5b. barcode product is re-resolved by barcode; a record whose own macros were estimated stays estimated", async () => {
    vi.mocked(getProductByBarcode).mockResolvedValueOnce({ id: "off-1", name: "Bar", source: "open-food-facts", sourceId: "5000159407236", sourceLabel: "Open Food Facts", preparationState: "packaged", per100g: { calories: 480, protein: 6, carbs: 60, fat: 24 }, isEstimated: true, estimationReason: "missing fat from source", estimatedFrom: "usda-1" })
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, quantityGrams: 50, foodName: "Bar", source: "open-food-facts", barcode: "5000159407236", per100g: FAKE, isEstimated: false })
    expect(stored(rows)).toMatchObject({ source: "open-food-facts", is_estimated: true, estimation_reason: "missing fat from source", calories: 240 })
  })

  it("5c. a verified food may still be flagged as an estimate by the caller (photo portion): downgrade is always allowed", async () => {
    vi.mocked(getFoodById).mockResolvedValueOnce(usdaCod)
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Cod", source: "usda", sourceId: "175174", per100g: usdaCod.per100g, isEstimated: true, estimationConfidence: "low", estimationReason: "Portion estimated from a photo." })
    expect(stored(rows)).toMatchObject({ source: "usda", is_estimated: true, estimation_confidence: "low", estimation_reason: "Portion estimated from a photo." })
  })

  it("6. USER_PROVIDED manual food keeps its own values and its user_provided label", async () => {
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, quantityGrams: 100, foodName: "Home stew", source: "user_provided", per100g: { calories: 120, protein: 9, carbs: 8, fat: 5 } })
    expect(stored(rows)).toMatchObject({ source: "user_provided", is_estimated: false, calories: 120, protein_g: 9 })
    expect(getFoodById).not.toHaveBeenCalled()
  })

  it("7. estimated food is always stored as estimated, even if the request says isEstimated=false", async () => {
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Laksa", source: "ai_estimate", per100g: { calories: 150, protein: 7, carbs: 15, fat: 7 }, isEstimated: false, estimationConfidence: "medium" })
    expect(stored(rows)).toMatchObject({ source: "ai_estimate", is_estimated: true, estimation_confidence: "medium" })
  })

  it("a lookup that throws is 'could not verify', never verified", async () => {
    vi.mocked(getFoodById).mockRejectedValueOnce(new Error("network"))
    const { client, rows } = createFakeSupabase()
    const result = await createFoodLog(client as never, USER_ID, { ...base, foodName: "Cod", source: "usda", sourceId: "175174", per100g: FAKE })
    expect(result.success).toBe(true)
    expect(stored(rows)).toMatchObject({ source: "user_provided", is_estimated: true })
  })

  it("server-computed profiles (meal drafts built from the ingredient table) are not re-resolved", async () => {
    const { client, rows } = createFakeSupabase()
    await createFoodLog(client as never, USER_ID, { ...base, foodName: "Draft", source: "local", sourceId: "meal:abc", per100g: { calories: 150, protein: 12, carbs: 15, fat: 4 }, serverComputedProfile: true })
    expect(stored(rows)).toMatchObject({ source: "local", is_estimated: false })
  })
})
