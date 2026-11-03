import { describe, expect, it } from "vitest"

import { todaysThread } from "@/lib/dante-core/active-thread"

describe("One Day, One Thread — fallback thread", () => {
  const now = new Date(2026, 10, 3, 12, 0)
  it("reopens today's most recent conversation", () => {
    expect(todaysThread([{ id: "a", updatedAt: new Date(2026, 10, 3, 8, 0).toISOString() }, { id: "b", updatedAt: new Date(2026, 10, 2, 22, 0).toISOString() }], now)).toBe("a")
  })
  it("never reopens an older day's conversation, and nothing when there is none", () => {
    expect(todaysThread([{ id: "b", updatedAt: new Date(2026, 10, 2, 22, 0).toISOString() }], now)).toBeNull()
    expect(todaysThread([], now)).toBeNull()
  })
})
