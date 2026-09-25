import { describe, expect, it } from "vitest"

import { buildQuickInsights, weekStrip } from "@/lib/progress/insights"
import { buildConsistencyLevel } from "@/lib/progress/level"
import { buildPersonalRecords, isRecentPr } from "@/lib/progress/personal-records"
import { resolveProgressMotivation, selectMotivationLine } from "@/lib/motivation"
import type { ConsistencyDay } from "@/lib/progress/types"

function day(date: string, status: ConsistencyDay["status"]): ConsistencyDay {
  return { date, status, countsTowardStreak: status !== "MISSED", evidenceRefs: [] }
}

describe("consistency level", () => {
  it("awards planned training and rest without extra-session bonuses", () => {
    const level = buildConsistencyLevel({
      days: [
        day("2026-08-03", "TRAINING_COMPLETE"),
        day("2026-08-04", "RECOVERY_COMPLETE"),
        day("2026-08-03", "TRAINING_COMPLETE"),
      ],
      milestoneCount: 1,
    })
    expect(level.currentXp).toBe(210)
    expect(level.level).toBe(1)
  })

  it("is deterministic across renders", () => {
    const input = {
      days: [day("2026-08-03", "TRAINING_COMPLETE"), day("2026-08-05", "CHECKIN_COMPLETE")],
      milestoneCount: 2,
    }
    expect(buildConsistencyLevel(input)).toEqual(buildConsistencyLevel(input))
  })
})

describe("quick insights", () => {
  it("names best and most-missed weekdays from real counts", () => {
    const insights = buildQuickInsights({
      sessions: [],
      snapshots: [
        { adherence: 40 } as never,
        { adherence: 50 } as never,
        { adherence: 70 } as never,
      ],
      days: [
        day("2026-08-03", "TRAINING_COMPLETE"),
        day("2026-08-10", "TRAINING_COMPLETE"),
        day("2026-08-17", "TRAINING_COMPLETE"),
        day("2026-08-08", "MISSED"),
        day("2026-08-15", "MISSED"),
      ],
    })
    expect(insights.find((item) => item.id === "best_day")?.value).toBe("Monday")
    expect(insights.find((item) => item.id === "most_missed")?.value).toBe("Saturday")
    expect(insights.find((item) => item.id === "trend")?.value).toBe("Rising")
    expect(insights.find((item) => item.id === "avg_session")).toBeUndefined()
  })
})

describe("week strip", () => {
  it("maps the current Monday week without inventing completions", () => {
    const dots = weekStrip([day("2026-09-21", "TRAINING_COMPLETE")], "2026-09-25")
    expect(dots).toHaveLength(7)
    expect(dots[0]?.kind).toBe("done")
    expect(dots.filter((dot) => dot.kind === "done")).toHaveLength(1)
  })
})

describe("personal records", () => {
  it("labels estimated 1RM and computes previous/current/delta", () => {
    const records = buildPersonalRecords([
      { exerciseId: "bench", exerciseName: "Bench Press", date: "2026-08-01", estimated1RmKg: 80 },
      { exerciseId: "bench", exerciseName: "Bench Press", date: "2026-09-01", estimated1RmKg: 85 },
      { exerciseId: "bench", exerciseName: "Bench Press", date: "2026-09-01", estimated1RmKg: 85 },
    ])
    expect(records[0]?.metric).toBe("Estimated 1RM")
    expect(records[0]?.currentKg).toBe(85)
    expect(records[0]?.previousKg).toBe(80)
    expect(records[0]?.deltaKg).toBe(5)
    expect(isRecentPr(records, "2026-09-10")).toBe(true)
  })
})

describe("motivation v2", () => {
  it("prioritizes a new PR and stays off when disabled", () => {
    const contexts = resolveProgressMotivation({
      currentStreak: 2,
      milestoneTypes: ["SEVEN_DAY_STREAK"],
      adherenceImproved: true,
      restDayCompleted: true,
      hasNewPr: true,
    })
    const selected = selectMotivationLine({
      contexts,
      localDate: "2026-09-25",
      preference: { enabled: true, lastDate: null, lastKey: null },
    })
    expect(selected?.context).toBe("NEW_PR")
    expect(
      selectMotivationLine({
        contexts,
        localDate: "2026-09-25",
        preference: { enabled: false, lastDate: null, lastKey: null },
      }),
    ).toBeNull()
  })
})
