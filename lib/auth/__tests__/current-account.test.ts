import { beforeEach, describe, expect, it, vi } from "vitest"

/** DB-02-01 read boundary: ownership by table, canonical column names, controlled failure states. */

vi.mock("@/lib/supabase/server", () => ({ createTypedClient: vi.fn() }))
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }))

import { getCurrentAccount } from "@/lib/auth/current-account"
import { createTypedClient } from "@/lib/supabase/server"

type R = { data: unknown; error: { message: string } | null }

function setup(profile: R, fitness: R) {
  const selects: Record<string, string> = {}
  vi.mocked(createTypedClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@b.c", user_metadata: {}, app_metadata: {} } }, error: null }) },
    from: (table: string) => ({
      select: (cols: string) => {
        selects[table] = cols
        return { eq: () => ({ maybeSingle: async () => (table === "profiles" ? profile : fitness) }) }
      },
    }),
  } as never)
  return selects
}

const cols = (s: string) => s.split(",").map((c) => c.trim())
const profileRow = { full_name: "Ann", username: "ann", date_of_birth: "1995-04-02", gender: "non_binary", timezone: "Asia/Tokyo", onboarding_completed: true }
const fitnessRow = { height_cm: 170, weight_kg: "65.5", goal: "muscle_gain", experience: "beginner", training_days: 4, session_duration_minutes: 60 }

describe("getCurrentAccount", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads identity from profiles and fitness fields from fitness_profiles", async () => {
    setup({ data: profileRow, error: null }, { data: fitnessRow, error: null })
    const a = (await getCurrentAccount())!
    expect(a.profile).toMatchObject({ date_of_birth: "1995-04-02", gender: "non_binary", timezone: "Asia/Tokyo", onboarding_completed: true })
    expect(a.fitnessProfile).toMatchObject({ height_cm: 170, weight_kg: 65.5, goal: "muscle_gain", session_duration_minutes: 60 })
    expect(a.readStatus).toEqual({ profile: "ok", fitness: "ok" })
  })

  it("never selects columns that do not exist on fitness_profiles", async () => {
    const selects = setup({ data: profileRow, error: null }, { data: fitnessRow, error: null })
    await getCurrentAccount()
    const fitness = cols(selects.fitness_profiles)
    for (const bad of ["date_of_birth", "gender", "timezone", "onboarding_completed", "session_duration"]) {
      expect(fitness).not.toContain(bad)
    }
    expect(fitness).toContain("session_duration_minutes")
    expect(cols(selects.profiles)).toEqual(expect.arrayContaining(["date_of_birth", "gender", "timezone", "onboarding_completed"]))
  })

  it("treats a missing fitness profile as a valid state", async () => {
    setup({ data: profileRow, error: null }, { data: null, error: null })
    const a = (await getCurrentAccount())!
    expect(a.fitnessProfile).toBeNull()
    expect(a.readStatus).toEqual({ profile: "ok", fitness: "not_created" })
  })

  it("reports not-found and read failures without throwing", async () => {
    setup({ data: null, error: null }, { data: null, error: { message: "boom" } })
    const a = (await getCurrentAccount())!
    expect(a.readStatus).toEqual({ profile: "not_found", fitness: "error" })
    setup({ data: null, error: { message: "boom" } }, { data: null, error: null })
    expect((await getCurrentAccount())!.readStatus.profile).toBe("error")
  })
})
