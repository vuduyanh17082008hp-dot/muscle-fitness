import { describe, expect, it } from "vitest"

import { contextConstraints, makeSnapshot } from "../draft"

const snap = (over: Partial<Parameters<typeof makeSnapshot>[0]> = {}) =>
  makeSnapshot({
    capturedAt: "2026-10-07T10:00:00.000Z",
    timezone: "Asia/Singapore",
    localDate: "2026-10-07",
    goal: "fat_loss",
    caloriesTarget: 2200,
    caloriesConsumed: 1200,
    caloriesRemaining: 1000,
    proteinTarget: 132,
    proteinConsumed: 32,
    proteinRemaining: 100,
    ...over,
  })

describe("protein target semantics", () => {
  it("keeps the canonical daily target (132) and derives remaining from it", () => {
    const s = snap()
    expect(s.proteinTarget).toBe(132)
    expect(s.proteinRemaining).toBe(100)
  })

  it("meal optimizer constraint is a per-meal figure (<=60g) that never replaces the daily target", () => {
    const s = snap()
    const c = contextConstraints(s)!
    expect(c.proteinTarget).toBe(60)
    expect(c.proteinTarget).not.toBe(s.proteinTarget)
    expect(s.proteinTarget).toBe(132)
  })

  it("per-meal figure follows remaining protein when below the cap, never the daily target", () => {
    expect(contextConstraints(snap({ proteinRemaining: 35 }))!.proteinTarget).toBe(35)
  })
})
