import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ kind: "admin" })),
}))

import { createClient } from "@supabase/supabase-js"
import { createRecoveryAdminClient } from "@/lib/supabase/admin"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(createClient).mockClear()
})

describe("createRecoveryAdminClient", () => {
  it("requires SUPABASE_SERVICE_ROLE_KEY and never uses a NEXT_PUBLIC key", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "must-not-be-used")
    expect(() => createRecoveryAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(createClient).not.toHaveBeenCalled()
  })

  it("passes only the server service role key", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret")
    createRecoveryAdminClient()
    expect(createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "service-role-secret",
      expect.objectContaining({ auth: { autoRefreshToken: false, persistSession: false } }),
    )
  })
})
