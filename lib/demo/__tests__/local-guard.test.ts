import { describe, expect, it } from "vitest"

import { assertLocalSupabaseUrl } from "@/lib/demo/local-guard"

describe("assertLocalSupabaseUrl", () => {
  it("allows loopback HTTP", () => {
    expect(assertLocalSupabaseUrl("http://127.0.0.1:54321").origin).toBe("http://127.0.0.1:54321")
    expect(assertLocalSupabaseUrl("http://localhost:54321").hostname).toBe("localhost")
  })

  it("blocks hosted Supabase", () => {
    expect(() => assertLocalSupabaseUrl("https://jlwszvtitjtgothgxubo.supabase.co")).toThrow(
      /blocked/i,
    )
  })

  it("blocks https even on loopback", () => {
    expect(() => assertLocalSupabaseUrl("https://127.0.0.1:54321")).toThrow(/Refusing/)
  })
})
