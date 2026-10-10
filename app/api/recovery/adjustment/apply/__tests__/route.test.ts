import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createRecoveryAdminClient: vi.fn(() => ({})),
}))

vi.mock("@/lib/recovery/apply-proposal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recovery/apply-proposal")>()
  return {
    ...actual,
    applyWorkoutAdjustment: vi.fn(),
  }
})

vi.mock("@/lib/recovery/supabase-apply", () => ({
  createSupabaseMutationStore: vi.fn(() => ({})),
  createSupabaseProposalStore: vi.fn(() => ({})),
  createSupabaseSessionWriter: vi.fn(() => ({})),
  createSupabaseCanonicalCommit: vi.fn(() => ({})),
}))

import { createClient } from "@/lib/supabase/server"
import { applyWorkoutAdjustment } from "@/lib/recovery/apply-proposal"
import { POST } from "@/app/api/recovery/adjustment/apply/route"

function post(body: unknown, user: { id: string } | null = { id: "user-a" }) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: "no session" },
      }),
    },
  } as never)
  return POST(
    new Request("http://localhost/api/recovery/adjustment/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

describe("POST /api/recovery/adjustment/apply", () => {
  beforeEach(() => {
    vi.mocked(applyWorkoutAdjustment).mockReset()
    vi.mocked(createClient).mockReset()
  })

  it("returns 401 without a session and does not apply", async () => {
    const response = await post({ proposalId: "wap_1", confirm: true }, null)
    expect(response.status).toBe(401)
    expect(applyWorkoutAdjustment).not.toHaveBeenCalled()
  })

  it("rejects a client-authoritative proposal payload", async () => {
    const response = await post({
      proposalId: "wap_1",
      confirm: true,
      proposal: {
        changes: [{ after: { targetSets: 10, isSkipped: true } }],
      },
    })
    expect(response.status).toBe(400)
    expect(applyWorkoutAdjustment).not.toHaveBeenCalled()
  })

  it("rejects extra after prescription fields", async () => {
    const response = await post({
      proposalId: "wap_1",
      confirm: true,
      after: { targetSets: 99 },
    })
    expect(response.status).toBe(400)
    expect(applyWorkoutAdjustment).not.toHaveBeenCalled()
  })

  it("requires explicit confirm", async () => {
    const response = await post({ proposalId: "wap_1" })
    expect(response.status).toBe(400)
    expect(applyWorkoutAdjustment).not.toHaveBeenCalled()
  })

  it("rejects confirm:false", async () => {
    const response = await post({ proposalId: "wap_1", confirm: false })
    expect(response.status).toBe(400)
    expect(applyWorkoutAdjustment).not.toHaveBeenCalled()
  })

  it("applies by proposalId only", async () => {
    vi.mocked(applyWorkoutAdjustment).mockResolvedValue({
      ok: true,
      alreadyApplied: false,
      mutation: { changeRefs: ["chg_1"] },
      session: {},
    } as never)
    const response = await post({ proposalId: "wap_canonical", confirm: true })
    expect(response.status).toBe(200)
    expect(applyWorkoutAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "user-a", proposalId: "wap_canonical" }),
    )
    expect(vi.mocked(applyWorkoutAdjustment).mock.calls[0]?.[0]).not.toHaveProperty("proposal")
  })
})
