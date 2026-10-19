import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { classifyQueryError } from "@/lib/supabase/query-error"

// Shapes as PostgREST v14 / postgrest-js 2.x return them.
const FUTURE_IAT = { code: "PGRST303", message: "JWT issued at future" }
const EXPIRED = { code: "PGRST303", message: "JWT expired" }
const BAD_SIGNATURE = { code: "PGRST301", message: "No suitable key or wrong key type" }
const MISSING_COLUMN = { code: "42703", message: "column user_preferences.activity_level_override does not exist" }
const RLS = { code: "42501", message: "permission denied for table user_preferences" }
const NETWORK = { code: "", message: "TypeError: fetch failed" }
const ABORTED = { code: "", message: "AbortError: This operation was aborted" }

describe("classifyQueryError", () => {
  it("separates auth-time failures from profile absence", () => {
    expect(classifyQueryError(FUTURE_IAT, 401)).toBe("AUTH_CLOCK_SKEW_OR_FUTURE_IAT")
    expect(classifyQueryError(EXPIRED, 401)).toBe("AUTH_EXPIRED")
    expect(classifyQueryError(BAD_SIGNATURE, 401)).toBe("AUTH_INVALID")
    expect(classifyQueryError({ code: "", message: "" }, 401)).toBe("AUTH_INVALID")
  })

  it("separates RLS, schema, not-found and transport failures", () => {
    expect(classifyQueryError(RLS, 403)).toBe("RLS_DENIED")
    expect(classifyQueryError(MISSING_COLUMN, 400)).toBe("SCHEMA_MISMATCH")
    expect(classifyQueryError({ code: "PGRST204", message: "Could not find the column" }, 400)).toBe("SCHEMA_MISMATCH")
    expect(classifyQueryError({ code: "PGRST116", message: "0 rows" }, 406)).toBe("NOT_FOUND")
    expect(classifyQueryError(NETWORK, 0)).toBe("DEPENDENCY_FAILURE")
    expect(classifyQueryError(ABORTED, 0)).toBe("DEPENDENCY_FAILURE")
    expect(classifyQueryError({ code: "57014", message: "canceling statement due to statement timeout" }, 500)).toBe("DEPENDENCY_FAILURE")
    expect(classifyQueryError({ code: "XX000", message: "boom" }, 400)).toBe("QUERY_FAILED")
  })
})

type Response = { data: unknown; error: { code: string; message: string } | null; status: number }

function fakeSupabase(preferences: Response[], others: Response = { data: null, error: null, status: 200 }) {
  const selects: string[] = []
  const client = {
    from: (table: string) => {
      let columns = ""
      const query = {
        select: (c: string) => ((columns = c), query),
        eq: () => query,
        maybeSingle: async () => {
          selects.push(`${table}:${columns.replace(/\s+/g, "")}`)
          return table === "user_preferences" ? preferences.shift()! : others
        },
      }
      return query
    },
  } as unknown as Parameters<typeof loadNutritionContext>[0]
  return { client, prefSelects: () => selects.filter((s) => s.startsWith("user_preferences")) }
}

describe("nutrition user_preferences schema fallback", () => {
  it("falls back to base columns when the override columns are missing", async () => {
    const { client, prefSelects } = fakeSupabase([
      { data: null, error: MISSING_COLUMN, status: 400 },
      { data: { cooking_ability: "basic" }, error: null, status: 200 },
    ])
    const ctx = await loadNutritionContext(client, "u1")
    expect(prefSelects()).toHaveLength(2)
    expect(prefSelects()[1]).not.toContain("activity_level_override")
    expect(ctx.cookingAbility).toBe("basic")
  })

  it.each([
    ["future-issued JWT", FUTURE_IAT, 401],
    ["expired JWT", EXPIRED, 401],
    ["network timeout", ABORTED, 0],
    ["RLS denial", RLS, 403],
  ])("%s does not run the schema fallback", async (_label, error, status) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { client, prefSelects } = fakeSupabase([{ data: null, error, status }])
    const ctx = await loadNutritionContext(client, "u1")
    expect(prefSelects()).toHaveLength(1)
    expect(warn.mock.calls.flat().join(" ")).not.toContain("Falling back")
    expect(ctx.cookingAbility).toBeNull()
    warn.mockRestore()
  })

  it("logs the disposition, not the raw message, for profile reads", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { client } = fakeSupabase(
      [{ data: null, error: FUTURE_IAT, status: 401 }],
      { data: null, error: FUTURE_IAT, status: 401 },
    )
    await loadNutritionContext(client, "u1")
    const logged = warn.mock.calls.map((c) => c.join(" "))
    expect(logged).toContain("[NUTRITION] Unable to load profile: AUTH_CLOCK_SKEW_OR_FUTURE_IAT")
    expect(logged).toContain("[NUTRITION] Unable to load fitness profile: AUTH_CLOCK_SKEW_OR_FUTURE_IAT")
    warn.mockRestore()
  })
})
