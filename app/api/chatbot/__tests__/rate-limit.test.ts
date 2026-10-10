import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))
vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: vi.fn(),
}))

import { POST } from "@/app/api/chatbot/route"
import { checkDanteRateLimit } from "@/lib/chatbot-rate-limit"
import { streamDanteReply } from "@/lib/dante-core/openai/client"
import { createClient } from "@/lib/supabase/server"

const USER = { id: "00000000-0000-4000-8000-000000000001" }

function authClient(user: typeof USER | null) {
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: "no session" },
      }),
    },
  }
}

function request(body: string) {
  return new Request("http://localhost/api/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
}

describe("POST /api/chatbot application rate limit", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(checkDanteRateLimit).mockReset()
    vi.mocked(streamDanteReply).mockReset()
  })

  it("authenticates before parsing or consuming quota", async () => {
    vi.mocked(createClient).mockResolvedValue(authClient(null) as never)

    const response = await POST(request("{"))

    expect(response.status).toBe(401)
    expect(checkDanteRateLimit).not.toHaveBeenCalled()
    expect(streamDanteReply).not.toHaveBeenCalled()
  })

  it("returns structured 429 with Retry-After before Dante/provider execution", async () => {
    vi.mocked(createClient).mockResolvedValue(authClient(USER) as never)
    vi.mocked(checkDanteRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 23,
    })

    const response = await POST(request(JSON.stringify({ message: "Hello Dante" })))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("23")
    expect(body).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Dante is receiving too many requests. Please try again shortly.",
      retryAfterSeconds: 23,
    })
    expect(checkDanteRateLimit).toHaveBeenCalledWith(USER.id)
    expect(streamDanteReply).not.toHaveBeenCalled()
  })

  it("fails closed without invoking Dante when rate-limit storage fails", async () => {
    vi.mocked(createClient).mockResolvedValue(authClient(USER) as never)
    vi.mocked(checkDanteRateLimit).mockRejectedValue(new Error("database unavailable"))

    const response = await POST(request(JSON.stringify({ message: "Hello Dante" })))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: "RATE_LIMIT_UNAVAILABLE" })
    expect(streamDanteReply).not.toHaveBeenCalled()
  })

  it("checks quota before rejecting malformed authenticated JSON", async () => {
    vi.mocked(createClient).mockResolvedValue(authClient(USER) as never)
    vi.mocked(checkDanteRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 8,
      retryAfterSeconds: 60,
    })

    const response = await POST(request("{"))

    expect(response.status).toBe(400)
    expect(checkDanteRateLimit).toHaveBeenCalledTimes(1)
    expect(streamDanteReply).not.toHaveBeenCalled()
  })
})
