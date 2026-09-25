import { describe, expect, it } from "vitest"

import { buildProgressJourney } from "@/lib/progress/aggregator"
import { selectMotivationLine } from "@/lib/motivation"
import type { BuildProgressJourneyInput } from "@/lib/progress/types"

function base(overrides: Partial<BuildProgressJourneyInput> = {}): BuildProgressJourneyInput {
  return {
    subjectRef: "user-a",
    timezone: "UTC",
    now: new Date("2026-09-25T12:00:00.000Z"),
    plan: {
      id: "plan-1",
      createdAt: "2026-08-03T00:00:00.000Z",
      daysPerWeek: 3,
      weeks: 8,
      name: "Upper / Lower",
    },
    sessions: [],
    checkins: [],
    nutritionDays: [],
    ...overrides,
  }
}

describe("P-A empty", () => {
  it("returns a clean empty journey", () => {
    const journey = buildProgressJourney(base({ plan: null }))
    expect(journey.weeklySnapshots).toEqual([])
    expect(journey.currentWeek).toBe(0)
    expect(journey.thenVsNow).toEqual([])
    expect(journey.groundedSummary.toLowerCase()).toContain("baseline")
  })
})

describe("P-B one partial week", () => {
  it("does not invent a later week narrative", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-05T12:00:00.000Z"),
        sessions: [
          {
            id: "s1",
            scheduledFor: "2026-08-04T09:00:00.000Z",
            completedAt: "2026-08-04T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
      }),
    )
    expect(journey.weeklySnapshots).toHaveLength(1)
    expect(journey.weeklySnapshots[0]?.weekIndex).toBe(1)
    expect(journey.groundedSummary.toLowerCase()).toContain("baseline")
    expect(journey.groundedSummary).not.toMatch(/Week 8/i)
  })
})

describe("P-C week index stability", () => {
  it("keeps the same week numbers across two computes", () => {
    const input = base({
      sessions: [
        {
          id: "s1",
          scheduledFor: "2026-08-04T09:00:00.000Z",
          completedAt: "2026-08-04T10:00:00.000Z",
          sessionState: "completed",
          restDay: false,
        },
        {
          id: "s2",
          scheduledFor: "2026-08-11T09:00:00.000Z",
          completedAt: "2026-08-11T10:00:00.000Z",
          sessionState: "completed",
          restDay: false,
        },
      ],
    })
    const first = buildProgressJourney(input)
    const second = buildProgressJourney(input)
    expect(first.weeklySnapshots.map((week) => week.weekIndex)).toEqual(
      second.weeklySnapshots.map((week) => week.weekIndex),
    )
  })
})

describe("P-D timezone", () => {
  it("allocates a post-midnight Singapore session to the local date", () => {
    const journey = buildProgressJourney(
      base({
        timezone: "Asia/Singapore",
        now: new Date("2026-09-14T02:00:00.000Z"),
        plan: {
          id: "plan-1",
          createdAt: "2026-09-13T16:30:00.000Z",
          daysPerWeek: 1,
          weeks: 2,
          name: "Test",
        },
        sessions: [
          {
            id: "late",
            scheduledFor: "2026-09-13T17:00:00.000Z",
            completedAt: "2026-09-13T18:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
      }),
    )
    expect(journey.weeklySnapshots[0]?.completedSessions).toBe(1)
  })
})

describe("P-E2 future and duplicate days", () => {
  it("ignores future sessions and does not double-count one day", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-05T12:00:00.000Z"),
        sessions: [
          {
            id: "dup-a",
            scheduledFor: "2026-08-04T09:00:00.000Z",
            completedAt: "2026-08-04T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "dup-b",
            scheduledFor: "2026-08-04T18:00:00.000Z",
            completedAt: "2026-08-04T19:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "future",
            scheduledFor: "2026-08-20T09:00:00.000Z",
            completedAt: "2026-08-20T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
      }),
    )
    expect(journey.currentStreak).toBe(1)
    expect(journey.consistencyDays.filter((day) => day.date === "2026-08-20")).toHaveLength(0)
  })
})

describe("P-E/F/G streak semantics", () => {
  it("counts planned rest, breaks on a miss, and ignores no-requirement days", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-08T12:00:00.000Z"),
        sessions: [
          {
            id: "t1",
            scheduledFor: "2026-08-03T09:00:00.000Z",
            completedAt: "2026-08-03T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "r1",
            scheduledFor: "2026-08-04T09:00:00.000Z",
            completedAt: null,
            sessionState: "not_started",
            restDay: true,
          },
          {
            id: "miss",
            scheduledFor: "2026-08-05T09:00:00.000Z",
            completedAt: null,
            sessionState: "not_started",
            restDay: false,
          },
          {
            id: "t2",
            scheduledFor: "2026-08-06T09:00:00.000Z",
            completedAt: "2026-08-06T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
      }),
    )
    expect(journey.currentStreak).toBe(1)
    expect(journey.longestStreak).toBeGreaterThanOrEqual(2)
    expect(journey.milestones.some((item) => item.type === "RETURN_AFTER_MISS")).toBe(true)
  })
})

describe("P-H/I milestones", () => {
  it("detects a completed week and does not invent four weeks from one week", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-09T12:00:00.000Z"),
        sessions: [
          {
            id: "s1",
            scheduledFor: "2026-08-03T09:00:00.000Z",
            completedAt: "2026-08-03T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "s2",
            scheduledFor: "2026-08-05T09:00:00.000Z",
            completedAt: "2026-08-05T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "s3",
            scheduledFor: "2026-08-07T09:00:00.000Z",
            completedAt: "2026-08-07T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
      }),
    )
    expect(journey.milestones.some((item) => item.type === "FIRST_WEEK_COMPLETE")).toBe(true)
    expect(journey.milestones.some((item) => item.type === "FOUR_WEEKS_COMPLETE")).toBe(false)
    expect(journey.milestones.some((item) => item.type === "FOURTEEN_DAY_STREAK")).toBe(false)
  })

  it("unlocks 14-day consistency only after fourteen qualifying days", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-16T12:00:00.000Z"),
        sessions: Array.from({ length: 14 }, (_, index) => ({
          id: `d${index}`,
          scheduledFor: `2026-08-${String(3 + index).padStart(2, "0")}T09:00:00.000Z`,
          completedAt: `2026-08-${String(3 + index).padStart(2, "0")}T10:00:00.000Z`,
          sessionState: "completed",
          restDay: false,
        })),
      }),
    )
    expect(journey.currentStreak).toBe(14)
    expect(journey.milestones.some((item) => item.type === "FOURTEEN_DAY_STREAK")).toBe(true)
    expect(journey.milestones.filter((item) => item.type === "FOURTEEN_DAY_STREAK")).toHaveLength(1)
  })
})

describe("P-J/K missing comparison metrics", () => {
  it("hides then/now when a side has no comparable metric", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-12T12:00:00.000Z"),
        sessions: [
          {
            id: "s1",
            scheduledFor: "2026-08-04T09:00:00.000Z",
            completedAt: "2026-08-04T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
        nutritionDays: [{ date: "2026-08-11", entryCount: 1, proteinPercent: 90 }],
      }),
    )
    expect(journey.thenVsNow.some((item) => item.metricId === "nutrition_adherence")).toBe(false)
  })
})

describe("P-L/M grounded summary", () => {
  it("only claims adherence improvement when both weeks have evidence", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-18T12:00:00.000Z"),
        sessions: [
          {
            id: "w1a",
            scheduledFor: "2026-08-03T09:00:00.000Z",
            completedAt: "2026-08-03T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "w1b",
            scheduledFor: "2026-08-04T09:00:00.000Z",
            completedAt: null,
            sessionState: "not_started",
            restDay: false,
          },
          {
            id: "w2a",
            scheduledFor: "2026-08-10T09:00:00.000Z",
            completedAt: "2026-08-10T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
          {
            id: "w2b",
            scheduledFor: "2026-08-11T09:00:00.000Z",
            completedAt: "2026-08-11T10:00:00.000Z",
            sessionState: "completed",
            restDay: false,
          },
        ],
      }),
    )
    expect(journey.thenVsNow.some((item) => item.metricId === "training_adherence")).toBe(true)
    expect(journey.summaryEvidence.length).toBeGreaterThan(0)
    expect(journey.groundedSummary.toLowerCase()).not.toContain("slept more")
  })
})

describe("motivation", () => {
  it("caps to one line per local day and respects the off preference", () => {
    const first = selectMotivationLine({
      contexts: ["MILESTONE_REACHED", "STREAK_INCREASED"],
      localDate: "2026-09-25",
      preference: { enabled: true, lastDate: null, lastKey: null },
    })
    expect(first?.context).toBe("MILESTONE_REACHED")
    const second = selectMotivationLine({
      contexts: ["STREAK_INCREASED"],
      localDate: "2026-09-25",
      preference: { enabled: true, lastDate: "2026-09-25", lastKey: first?.key ?? null },
    })
    expect(second).toBeNull()
    const disabled = selectMotivationLine({
      contexts: ["PLAN_ADJUSTED"],
      localDate: "2026-09-26",
      preference: { enabled: false, lastDate: null, lastKey: null },
    })
    expect(disabled).toBeNull()
  })
})
