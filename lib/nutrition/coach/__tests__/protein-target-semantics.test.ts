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

  it("meal optimizer constraint is a per-meal share of the daily target that never replaces it", () => {
    const s = snap()
    const c = contextConstraints(s)!
    expect(c.proteinTarget).toBe(46) // 35 % of 132, not the 100 g still left today
    expect(c.proteinTarget).not.toBe(s.proteinTarget)
    expect(s.proteinTarget).toBe(132)
  })

  it("per-meal figure follows remaining protein when below the share, never the daily target", () => {
    expect(contextConstraints(snap({ proteinRemaining: 35 }))!.proteinTarget).toBe(35)
  })

  it("one meal's calorie ceiling is a share of the day, not the whole remaining budget (S4-A: 902 kcal lunch)", () => {
    expect(contextConstraints(snap({ caloriesTarget: 1990, caloriesRemaining: 1600 }))!.calorieCeiling).toBe(597)
    expect(contextConstraints(snap({ caloriesTarget: 3170, caloriesRemaining: 3000 }))!.calorieCeiling).toBe(900)
    // Less left than a share: the remaining budget is the ceiling.
    expect(contextConstraints(snap({ caloriesTarget: 2200, caloriesRemaining: 300 }))!.calorieCeiling).toBe(300)
  })
})
