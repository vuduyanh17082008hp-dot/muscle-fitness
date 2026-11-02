import { beforeEach, describe, expect, it, vi } from "vitest"

const getUser = vi.fn()
const create = vi.fn()

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock("@/lib/dante-core/openai/config", () => ({ isOpenAiConfigured: () => true, getOpenAiApiKey: () => "test-key" }))
vi.mock("openai", () => {
  class APIError extends Error {
    status: number
    constructor(status: number) {
      super("api")
      this.status = status
    }
  }
  class OpenAI {
    static APIError = APIError
    audio = { transcriptions: { create } }
  }
  return { default: OpenAI, toFile: vi.fn(async (_data: unknown, name: string, options: { type: string }) => ({ name, type: options.type })) }
})

import { POST } from "@/app/api/dante/transcribe/route"

let user = 0
const post = (file: File | null, extra: Record<string, string> = {}) => {
  const form = new FormData()
  if (file) form.append("audio", file)
  for (const [key, value] of Object.entries(extra)) form.append(key, value)
  return POST(new Request("http://localhost/api/dante/transcribe", { method: "POST", body: form }))
}
const clip = (bytes = 2048, type = "audio/webm;codecs=opus") => new File([new Uint8Array(bytes)], "speech.webm", { type })

describe("POST /api/dante/transcribe", () => {
  beforeEach(() => {
    user += 1
    getUser.mockResolvedValue({ data: { user: { id: `user-${user}` } } })
    create.mockReset()
  })

  it("requires a session", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await post(clip())).status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects missing, oversized and unsupported audio before calling the model", async () => {
    expect((await post(null)).status).toBe(400)
    expect((await post(clip(0))).status).toBe(400)
    expect((await post(clip(4 * 1024 * 1024 + 1))).status).toBe(413)
    expect((await post(clip(2048, "video/mp4"))).status).toBe(415)
    expect(create).not.toHaveBeenCalled()
  })

  it("transcribes with gpt-transcribe, EN+VI, gym keywords, and returns only the text", async () => {
    create.mockResolvedValueOnce({ text: " Lower my calories by 200 " })
    const response = await post(clip(), { language: "vi" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, text: "Lower my calories by 200", model: "gpt-transcribe" })
    const params = create.mock.calls[0]![0]
    expect(params).toMatchObject({ model: "gpt-transcribe", response_format: "json", languages: ["vi", "en"] })
    expect(params.keywords).toContain("RDL")
    expect(params.file).toMatchObject({ name: "speech.webm", type: "audio/webm" })
  })

  it("an empty transcript is NO_SPEECH, never an empty message", async () => {
    create.mockResolvedValueOnce({ text: "   " })
    const response = await post(clip())
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: "NO_SPEECH" })
  })

  it("rate-limits per user", async () => {
    create.mockResolvedValue({ text: "ok" })
    const statuses: number[] = []
    for (let i = 0; i < 9; i++) statuses.push((await post(clip())).status)
    expect(statuses.slice(0, 8).every((status) => status === 200)).toBe(true)
    expect(statuses[8]).toBe(429)
  })

  it("a provider failure is reported without the audio or transcript in logs", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    create.mockRejectedValueOnce(new Error("boom"))
    const response = await post(clip())
    expect(response.status).toBe(502)
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/calories|speech\.webm/)
    error.mockRestore()
  })
})
