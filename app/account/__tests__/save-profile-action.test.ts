import { beforeEach, describe, expect, it, vi } from "vitest"

/** DB-02-01 write boundary: one atomic rpc, canonical enum values, no raw DB errors, input retained. */

vi.mock("@/lib/supabase/server", () => ({ createTypedClient: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { redirect } from "next/navigation"

import { saveProfileAction, type SaveProfileState } from "@/app/account/actions"
import { createTypedClient } from "@/lib/supabase/server"

const prev: SaveProfileState = { success: false, message: null, fieldErrors: {} }

function fake(rpcError: { code?: string; message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: rpcError ? null : { ok: true }, error: rpcError }))
  const from = vi.fn()
  const updateUser = vi.fn(async () => ({ error: null }))
  vi.mocked(createTypedClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@b.c" } }, error: null }), updateUser },
    rpc,
    from,
  } as never)
  return { rpc, from, updateUser }
}

function form(over: Record<string, string> = {}) {
  const data = new FormData()
  const base = {
    full_name: "Ann Lee", username: "ann.lee", phone: "", date_of_birth: "1995-04-02",
    gender: "non_binary", height_cm: "170", weight_kg: "65", timezone: "Asia/Singapore", goal: "muscle_gain",
  }
  for (const [k, v] of Object.entries({ ...base, ...over })) data.set(k, v)
  return data
}

describe("saveProfileAction", () => {
  beforeEach(() => vi.clearAllMocks())

  it("writes through exactly one rpc and never touches tables directly", async () => {
    const { rpc, from } = fake()
    await saveProfileAction(prev, form())
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
    const [name, args] = rpc.mock.calls[0] as unknown as [string, { p_payload: Record<string, unknown> }]
    expect(name).toBe("save_account_profile")
    expect(args.p_payload).toMatchObject({
      full_name: "Ann Lee", date_of_birth: "1995-04-02", gender: "non_binary",
      timezone: "Asia/Singapore", height_cm: 170, weight_kg: 65, goal: "muscle_gain",
    })
    expect(args.p_payload).not.toHaveProperty("user_id")
    expect(args.p_payload).not.toHaveProperty("session_duration")
    expect(redirect).toHaveBeenCalledWith("/account?updated=1")
  })

  it.each(["male", "female", "non_binary", "prefer_not_to_say"])("accepts canonical gender %s", async (g) => {
    const { rpc } = fake()
    await saveProfileAction(prev, form({ gender: g }))
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('rejects legacy gender "other" before any db call', async () => {
    const { rpc } = fake()
    const res = await saveProfileAction(prev, form({ gender: "other" }))
    expect(res.success).toBe(false)
    expect(res.fieldErrors.gender).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("rejects non-numeric height/weight and impossible dates instead of silently dropping them", async () => {
    const { rpc } = fake()
    const res = await saveProfileAction(prev, form({ height_cm: "abc", weight_kg: "x", date_of_birth: "2030-02-31", timezone: "Mars/Base" }))
    expect(Object.keys(res.fieldErrors).sort()).toEqual(["date_of_birth", "height_cm", "timezone", "weight_kg"])
    expect(rpc).not.toHaveBeenCalled()
  })

  it("on db failure: no success, no redirect, no raw error text, input retained, auth metadata untouched", async () => {
    const { updateUser } = fake({ code: "XX000", message: 'relation "secret_table" exploded' })
    const res = await saveProfileAction(prev, form({ full_name: "Keep Me" }))
    expect(res.success).toBe(false)
    expect(res.message).not.toMatch(/secret_table|exploded/)
    expect(res.message).toMatch(/Nothing was updated/)
    expect(res.values?.full_name).toBe("Keep Me")
    expect(redirect).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("maps a constraint violation to an actionable message", async () => {
    fake({ code: "23514", message: "violates check constraint" })
    const res = await saveProfileAction(prev, form())
    expect(res.message).toMatch(/rejected/)
    expect(res.message).not.toMatch(/constraint/)
  })
})
