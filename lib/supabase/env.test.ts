import { afterEach, describe, expect, it, vi } from "vitest"

import { getSupabaseEnvironment } from "@/lib/supabase/env"

const PUBLIC_KEY = "test-public-key"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getSupabaseEnvironment", () => {
  it("accepts the standard local Supabase URL during development", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY)

    expect(getSupabaseEnvironment()).toEqual({
      url: "http://127.0.0.1:54321",
      publicKey: PUBLIC_KEY,
    })
  })

  it("rejects a loopback HTTP URL in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY)

    expect(() => getSupabaseEnvironment()).toThrow(
      /loopback HTTP URL outside production/,
    )
  })

  it("accepts a hosted Supabase HTTPS project URL", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://example.supabase.co",
    )
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY)

    expect(getSupabaseEnvironment()).toEqual({
      url: "https://example.supabase.co",
      publicKey: PUBLIC_KEY,
    })
  })
})
