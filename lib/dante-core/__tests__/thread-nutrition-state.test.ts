import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { loadThreadNutritionState } from "@/lib/dante-core/conversation-store"

const THREAD = "949a6b16-3163-4f04-9bfe-8d911fca20f6"

/** Minimal PostgREST chain: records every filter, returns the given rows newest-first. */
function fake(rows: Array<{ metadata: unknown }>) {
  const filters: Array<[string, unknown]> = []
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
    order: () => chain,
    limit: async () => ({ data: rows, error: null }),
  }
  return { client: { from: () => chain } as never, filters }
}

describe("One Day, One Thread — the thread's meal state, server-side", () => {
  it("reads only the caller's finished assistant rows in that thread", async () => {
    const { client, filters } = fake([])
    await loadThreadNutritionState(client, "user-1", THREAD)
    expect(filters).toEqual(expect.arrayContaining([["thread_id", THREAD], ["user_id", "user-1"], ["role", "assistant"], ["status", "complete"]]))
  })

  it("a training turn in between (no nutrition metadata) never erases the meal state", async () => {
    const state = { activeDraft: null, conversation: { pendingLog: null } }
    const { client } = fake([{ metadata: { insight: null } }, { metadata: { nutrition: state } }, { metadata: { nutrition: { activeDraft: null, conversation: { old: true } } } }])
    expect(await loadThreadNutritionState(client, "user-1", THREAD)).toEqual(state)
  })

  it("no nutrition turn, or a malformed thread id → no carried state", async () => {
    expect(await loadThreadNutritionState(fake([{ metadata: {} }]).client, "user-1", THREAD)).toBeNull()
    expect(await loadThreadNutritionState(fake([]).client, "user-1", "not-a-uuid")).toBeNull()
  })
})
