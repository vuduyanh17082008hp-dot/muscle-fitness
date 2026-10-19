// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

const select = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: (cols: string) => {
        select(cols)
        return { order: () => ({ limit: async () => ({ data: [], error: null }) }) }
      },
    }),
  }),
}))

import { GET } from "../route"

describe("GET /api/exercises", () => {
  // Regression (VER3-01): exercise_library has primary_muscle, not muscle_group.
  it("selects the real primary_muscle column, aliased to muscle_group", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const cols = select.mock.calls[0][0] as string
    expect(cols).toContain("muscle_group:primary_muscle")
    expect(cols.replace("muscle_group:primary_muscle", "")).not.toMatch(/\bmuscle_group\b/)
  })
})
