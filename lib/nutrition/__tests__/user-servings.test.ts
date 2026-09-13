import { describe, expect, it } from "vitest"

/** "Saved serving" (spec Part "10. TESTS"). */
import { deleteUserFoodServing, loadServingsForFood, saveUserFoodServing } from "@/lib/nutrition/user-servings"

type ServingRow = {
  id: string
  user_id: string
  food_identity: string
  food_name: string
  serving_name: string
  serving_grams: number
}

function createFakeSupabase() {
  const rows: ServingRow[] = []
  let nextId = 1

  const client = {
    from(table: string) {
      if (table !== "user_food_servings") throw new Error(`Unexpected table: ${table}`)

      return {
        select: () => ({
          eq: (_c1: string, userId: string) => ({
            eq: (_c2: string, foodIdentity: string) => ({
              order: async () => ({
                data: rows.filter((r) => r.user_id === userId && r.food_identity === foodIdentity),
                error: null,
              }),
            }),
          }),
        }),

        upsert: (values: { user_id: string; food_identity: string; serving_name: string; serving_grams: number }) => ({
          select: () => ({
            single: async () => {
              const existing = rows.find(
                (r) =>
                  r.user_id === values.user_id &&
                  r.food_identity === values.food_identity &&
                  r.serving_name === values.serving_name,
              )

              if (existing) {
                existing.serving_grams = values.serving_grams
                return { data: existing, error: null }
              }

              const row: ServingRow = {
                id: `serving-${nextId++}`,
                user_id: values.user_id,
                food_identity: values.food_identity,
                food_name: "Whey Protein",
                serving_name: values.serving_name,
                serving_grams: values.serving_grams,
              }
              rows.push(row)
              return { data: row, error: null }
            },
          }),
        }),

        delete: () => ({
          eq: (_c1: string, id: string) => ({
            eq: async (_c2: string, userId: string) => {
              const index = rows.findIndex((r) => r.id === id && r.user_id === userId)
              if (index >= 0) rows.splice(index, 1)
              return { error: null }
            },
          }),
        }),
      }
    },
  }

  return { client, rows }
}

const USER_ID = "user-1"
const FOOD_IDENTITY = "local:local-whey-protein"

describe("saveUserFoodServing", () => {
  it("saves a new named serving preset (e.g. '1 scoop = 30g')", async () => {
    const { client } = createFakeSupabase()

    const result = await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 30,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.servingName).toBe("1 scoop")
      expect(result.data.servingGrams).toBe(30)
    }
  })

  it("rejects a non-positive serving size", async () => {
    const { client } = createFakeSupabase()

    const result = await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "bad",
      servingGrams: 0,
    })

    expect(result.success).toBe(false)
  })

  it("rejects a blank serving name", async () => {
    const { client } = createFakeSupabase()

    const result = await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "  ",
      servingGrams: 30,
    })

    expect(result.success).toBe(false)
  })

  it("updates the grams for the same user+food+serving-name instead of duplicating", async () => {
    const { client, rows } = createFakeSupabase()

    await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 30,
    })
    await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 32,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].serving_grams).toBe(32)
  })
})

describe("loadServingsForFood", () => {
  it("returns only this user's servings for this exact food", async () => {
    const { client } = createFakeSupabase()

    await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 30,
    })
    await saveUserFoodServing(client as never, "someone-else", {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 999,
    })

    const servings = await loadServingsForFood(client as never, USER_ID, FOOD_IDENTITY)

    expect(servings).toHaveLength(1)
    expect(servings[0].servingGrams).toBe(30)
  })
})

describe("deleteUserFoodServing", () => {
  it("deletes a serving belonging to the user", async () => {
    const { client, rows } = createFakeSupabase()

    const saved = await saveUserFoodServing(client as never, USER_ID, {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 30,
    })
    if (!saved.success) throw new Error("setup failed")

    const result = await deleteUserFoodServing(client as never, USER_ID, saved.data.id)

    expect(result.success).toBe(true)
    expect(rows).toHaveLength(0)
  })

  it("does not delete another user's serving (isolation)", async () => {
    const { client, rows } = createFakeSupabase()

    const saved = await saveUserFoodServing(client as never, "owner", {
      foodIdentity: FOOD_IDENTITY,
      foodName: "Whey Protein",
      servingName: "1 scoop",
      servingGrams: 30,
    })
    if (!saved.success) throw new Error("setup failed")

    await deleteUserFoodServing(client as never, "attacker", saved.data.id)

    expect(rows).toHaveLength(1)
  })
})
