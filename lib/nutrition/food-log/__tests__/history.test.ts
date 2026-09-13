import { describe, expect, it } from "vitest"

/** "History" (spec Part "10. TESTS"): recent + frequent foods. */
import { loadFrequentFoods, loadRecentFoods } from "@/lib/nutrition/food-log/history"

type LogRow = {
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
  created_at: string
}

function row(overrides: Partial<LogRow> = {}): LogRow {
  return {
    food_name: "Grilled Chicken Breast",
    brand: null,
    source: "usda",
    source_id: "123",
    barcode: null,
    quantity_grams: 150,
    serving_name: null,
    servings_consumed: null,
    calories: 250,
    protein_g: 46,
    carbs_g: 0,
    fat_g: 5,
    fiber_g: null,
    is_estimated: false,
    created_at: "2026-09-10T12:00:00.000Z",
    ...overrides,
  }
}

function createFakeSupabase(rows: LogRow[]) {
  return {
    from(table: string) {
      if (table !== "food_logs") throw new Error(`Unexpected table: ${table}`)

      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: rows, error: null }),
            }),
          }),
        }),
      }
    },
  }
}

describe("loadRecentFoods", () => {
  it("returns one deduped entry per distinct food, most-recent-first", async () => {
    const client = createFakeSupabase([
      row({ food_name: "Oats", source_id: "oats-1", created_at: "2026-09-12T08:00:00.000Z" }),
      row({ food_name: "Grilled Chicken Breast", source_id: "123", created_at: "2026-09-11T12:00:00.000Z" }),
      row({ food_name: "Grilled Chicken Breast", source_id: "123", created_at: "2026-09-10T12:00:00.000Z" }),
    ])

    const recent = await loadRecentFoods(client as never, "user-1")

    expect(recent).toHaveLength(2)
    expect(recent[0].foodName).toBe("Oats") // most recent first
    expect(recent[1].timesLogged).toBe(2) // both chicken breast rows collapsed into one, counted
  })

  it("dedupes barcode-identified foods even if the display name differs slightly", async () => {
    const client = createFakeSupabase([
      row({ food_name: "Oreo Original", barcode: "7622210951353", source: "open-food-facts", source_id: null }),
      row({ food_name: "Oreo Original (150g)", barcode: "7622210951353", source: "open-food-facts", source_id: null }),
    ])

    const recent = await loadRecentFoods(client as never, "user-1")

    expect(recent).toHaveLength(1)
    expect(recent[0].timesLogged).toBe(2)
  })

  it("returns an empty list gracefully when the query errors", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    }

    const recent = await loadRecentFoods(client as never, "user-1")
    expect(recent).toEqual([])
  })
})

describe("loadFrequentFoods", () => {
  it("only includes foods logged more than once, ranked by use count", async () => {
    const client = createFakeSupabase([
      row({ food_name: "Oats", source_id: "oats-1" }),
      row({ food_name: "Grilled Chicken Breast", source_id: "123" }),
      row({ food_name: "Grilled Chicken Breast", source_id: "123" }),
      row({ food_name: "Grilled Chicken Breast", source_id: "123" }),
    ])

    const frequent = await loadFrequentFoods(client as never, "user-1")

    expect(frequent).toHaveLength(1)
    expect(frequent[0].foodName).toBe("Grilled Chicken Breast")
    expect(frequent[0].timesLogged).toBe(3)
  })
})
