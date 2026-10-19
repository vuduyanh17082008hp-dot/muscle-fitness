import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.unmock("@/lib/chatbot-rate-limit")
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}))

import { checkDanteRateLimit, getDanteRateLimitConfig } from "@/lib/chatbot-rate-limit"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type Counter = { startedAt: number; count: number }

function atomicRpc(clock: { now: number }) {
  const rows = new Map<string, Counter>()

  return {
    rows,
    rpc: vi.fn(async (_name: string, args: Record<string, number | string>) => {
      const userId = String(args.p_user_id)
      const limit = Number(args.p_limit)
      const windowSeconds = Number(args.p_window_seconds)
      const existing = rows.get(userId)
      const expired = !existing || existing.startedAt + windowSeconds * 1000 <= clock.now
      const row = expired ? { startedAt: clock.now, count: 0 } : existing

      if (row.count < limit) {
        row.count += 1
        rows.set(userId, row)
        return {
          data: {
            allowed: true,
            remaining: limit - row.count,
            retry_after_seconds: windowSeconds,
          },
          error: null,
        }
      }

      return {
        data: {
          allowed: false,
          remaining: 0,
          retry_after_seconds: Math.ceil(
            (row.startedAt + windowSeconds * 1000 - clock.now) / 1000,
          ),
        },
        error: null,
      }
    }),
  }
}

describe("Dante application rate limiter", () => {
  beforeEach(() => {
    vi.stubEnv("DANTE_RATE_LIMIT_REQUESTS", "5")
    vi.stubEnv("DANTE_RATE_LIMIT_WINDOW_SECONDS", "60")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.mocked(createSupabaseAdminClient).mockReset()
  })

  it("uses central server-only configuration with human-chat defaults", () => {
    vi.unstubAllEnvs()
    expect(getDanteRateLimitConfig()).toEqual({ requests: 10, windowSeconds: 60 })
  })

  it("atomically permits exactly the configured concurrent request count", async () => {
    const store = atomicRpc({ now: 0 })
    vi.mocked(createSupabaseAdminClient).mockReturnValue(store as never)

    const results = await Promise.all(
      Array.from({ length: 12 }, () => checkDanteRateLimit("user-a")),
    )

    expect(results.filter((result) => result.allowed)).toHaveLength(5)
    expect(results.filter((result) => !result.allowed)).toHaveLength(7)
    expect(store.rows.get("user-a")?.count).toBe(5)
  })

  it("isolates users and resets after the fixed window", async () => {
    const clock = { now: 0 }
    const store = atomicRpc(clock)
    vi.mocked(createSupabaseAdminClient).mockReturnValue(store as never)

    await Promise.all(Array.from({ length: 5 }, () => checkDanteRateLimit("user-a")))
    expect((await checkDanteRateLimit("user-a")).allowed).toBe(false)
    expect((await checkDanteRateLimit("user-b")).allowed).toBe(true)

    clock.now = 60_000
    expect((await checkDanteRateLimit("user-a")).allowed).toBe(true)
  })

  it("fails closed when the durable datastore fails", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      rpc: async () => ({ data: null, error: { code: "DB_DOWN" } }),
    } as never)
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(checkDanteRateLimit("user-a")).rejects.toThrow(
      "Dante rate limiter unavailable.",
    )
  })
})
