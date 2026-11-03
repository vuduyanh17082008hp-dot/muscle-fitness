import { beforeEach, describe, expect, it, vi } from "vitest"

const compareLeftovers = vi.fn()
let configured = true
const from = vi.fn()
let user: { id: string } | null = { id: "user-1" }

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from }),
}))
vi.mock("@/lib/ai/vision-client", () => ({
  compareLeftovers: (...args: unknown[]) => compareLeftovers(...args),
  isVisionConfigured: () => configured,
}))

import { POST } from "@/app/api/nutrition/photo-leftovers/route"

const IMG = "data:image/jpeg;base64,AAAA"
const components = [
  { id: "c0", name: "Rice", servedGrams: 200 },
  { id: "c1", name: "Chicken", servedGrams: 150 },
]
const post = (body: unknown) => POST(new Request("http://x/api/nutrition/photo-leftovers", { method: "POST", body: JSON.stringify(body) }))

beforeEach(() => {
  compareLeftovers.mockReset()
  from.mockReset()
  configured = true
  user = { id: "user-1" }
})

describe("POST /api/nutrition/photo-leftovers", () => {
  it("needs a signed-in user", async () => {
    user = null
    expect((await post({ before: IMG, after: IMG, components })).status).toBe(401)
  })

  it("rejects a non-image, an oversized image, and duplicate component ids without calling the model", async () => {
    expect((await post({ before: IMG, after: "data:text/plain;base64,AAAA", components })).status).toBe(400)
    expect((await post({ before: IMG, after: `data:image/jpeg;base64,${"A".repeat(2_000_100)}`, components })).status).toBe(413)
    expect((await post({ before: IMG, after: IMG, components: [components[0], components[0]] })).status).toBe(400)
    expect((await post({ before: IMG, components })).status).toBe(400) // only one photo
    expect(compareLeftovers).not.toHaveBeenCalled()
  })

  it("turns the model's 'remaining' into SUGGESTED eaten percentages; can't-tell stays null; nothing is written", async () => {
    compareLeftovers.mockResolvedValue({
      sameMeal: true,
      components: [
        { id: "c0", remainingPercent: 50, confidence: "medium" },
        { id: "c1", remainingPercent: null, confidence: "low", note: "hidden under rice" },
      ],
    })
    const response = await post({ before: IMG, after: IMG, components })
    expect(await response.json()).toEqual({
      ok: true,
      result: {
        status: "ok",
        components: [
          { id: "c0", eatenPercent: 50, confidence: "medium", note: null },
          { id: "c1", eatenPercent: null, confidence: "low", note: "hidden under rice" },
        ],
      },
    })
    expect(from).not.toHaveBeenCalled()
  })

  it("a different meal, a provider failure, or no vision config are recoverable results, never a guess", async () => {
    compareLeftovers.mockResolvedValue({ sameMeal: false, reason: "That's a bicycle.", components: [] })
    expect((await (await post({ before: IMG, after: IMG, components })).json()).result).toEqual({ status: "not_same_meal", reason: "That's a bicycle." })
    compareLeftovers.mockResolvedValue(null)
    expect((await (await post({ before: IMG, after: IMG, components })).json()).result.status).toBe("error")
    configured = false
    expect((await (await post({ before: IMG, after: IMG, components })).json()).result.status).toBe("unconfigured")
    expect(from).not.toHaveBeenCalled()
  })
})
