import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { GET } from "../route"

const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function client(options: {
  user?: { id: string } | null
  data?: unknown
  error?: { message: string; code?: string } | null
}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: "owner" } : options.user },
        error: options.user ? null : { message: "no session" },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.data ?? null,
              error: options.error ?? null,
            }),
          }),
        }),
      }),
    }),
  }
}

function get(id: string) {
  return GET(new Request(`http://localhost/api/sessions/${id}`), {
    params: Promise.resolve({ id }),
  })
}

describe("GET /api/sessions/[id]", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(client({ user: null }) as never)
    const response = await get(SESSION_ID)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 400 for an invalid id", async () => {
    vi.mocked(createClient).mockResolvedValue(client({}) as never)
    const response = await get("not-a-uuid")
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid session id." })
  })

  it("returns 404 when the session is missing or owned by someone else", async () => {
    vi.mocked(createClient).mockResolvedValue(client({ data: null }) as never)
    const response = await get(SESSION_ID)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Not found" })
  })

  it("does not expose a raw database error", async () => {
    vi.mocked(createClient).mockResolvedValue(
      client({
        error: { message: 'column "secret" does not exist', code: "42703" },
      }) as never,
    )
    const response = await get(SESSION_ID)
    const json = await response.json()
    expect(response.status).toBe(500)
    expect(json).toEqual({ error: "Unable to load workout session." })
    expect(JSON.stringify(json)).not.toContain("secret")
    expect(JSON.stringify(json)).not.toContain("42703")
  })

  it("returns the session for the owner", async () => {
    vi.mocked(createClient).mockResolvedValue(
      client({ data: { id: SESSION_ID, user_id: "owner" } }) as never,
    )
    const response = await get(SESSION_ID)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      session: { id: SESSION_ID, user_id: "owner" },
    })
  })
})
