import { describe, expect, it } from "vitest"

import { buildMuscleFocus } from "@/lib/progress/muscle-focus"
import { buildProgressPageModel } from "@/lib/progress/page-model"
import {
  CONSISTENCY_STATUS_LABEL,
  formatPoints,
  heatmapInsight,
  heatmapWindow,
  journeySentence,
  nextMilestone,
  previousWeekVolumeDelta,
  weeklyRhythm,
} from "@/lib/progress/presentation"
import { buildProgressJourney } from "@/lib/progress/aggregator"
import { localDateOfSession } from "@/lib/progress/streak"
import { MOTIVATION_BANK, resolveProgressMotivation, selectMotivationLine } from "@/lib/motivation"
import type { BuildProgressJourneyInput, ProgressJourney } from "@/lib/progress/types"

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

function session(
  id: string,
  scheduledFor: string,
  state: string,
  extras: Partial<BuildProgressJourneyInput["sessions"][number]> = {},
) {
  return {
    id,
    scheduledFor,
    completedAt: state === "completed" ? scheduledFor : null,
    sessionState: state,
    restDay: false,
    ...extras,
  }
}

describe("journey sentence", () => {
  it("does not invent a daily-workout streak", () => {
    const empty = buildProgressJourney(base({ plan: null }))
    expect(journeySentence(empty)).toContain("baseline")
    const streak = buildProgressJourney(
      base({
        now: new Date("2026-08-10T12:00:00.000Z"),
        sessions: [
          session("a", "2026-08-07T09:00:00.000Z", "completed"),
          session("b", "2026-08-08T09:00:00.000Z", "completed"),
          session("c", "2026-08-09T09:00:00.000Z", "completed"),
        ],
      }),
    )
    expect(journeySentence(streak)).toContain("planned routine")
    expect(journeySentence(streak)).not.toContain("every day")
  })
})

describe("next milestone", () => {
  it("keeps 14-day language internally consistent", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-12T12:00:00.000Z"),
        sessions: Array.from({ length: 8 }, (_, index) =>
          session(`s${index}`, `2026-08-${String(3 + index).padStart(2, "0")}T09:00:00.000Z`, "completed"),
        ),
      }),
    )
    const next = nextMilestone(journey)
    expect(next?.title).toBe("14-day consistency")
    expect(next?.target).toBe(14)
    expect(next?.current).toBeLessThanOrEqual(14)
    expect(next?.current).not.toBe(18)
  })
})

describe("heatmap", () => {
  it("only reports a weekday pattern when the count supports it", () => {
    const weak = heatmapInsight([
      { date: "2026-08-01", status: "MISSED", countsTowardStreak: false, evidenceRefs: [] },
      { date: "2026-08-08", status: "MISSED", countsTowardStreak: false, evidenceRefs: [] },
    ])
    expect(weak.note).toBeNull()

    const saturdays = heatmapInsight(
      ["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-10"].map((date, index) => ({
        date,
        status: index < 4 ? "MISSED" : "TRAINING_COMPLETE",
        countsTowardStreak: index >= 4,
        evidenceRefs: [],
      })) as ProgressJourney["consistencyDays"],
    )
    expect(saturdays.note).toContain("Saturdays")
    expect(saturdays.note).not.toContain("weakest link")
  })

  it("pads a 12-week window without inventing completions", () => {
    const window = heatmapWindow(
      [{ date: "2026-09-24", status: "TRAINING_COMPLETE", countsTowardStreak: true, evidenceRefs: ["x"] }],
      "2026-09-25",
    )
    expect(window).toHaveLength(84)
    expect(window.filter((day) => day.status === "TRAINING_COMPLETE")).toHaveLength(1)
  })
})

describe("weekly rhythm", () => {
  it("derives labels from the user plan instead of hardcoding PPL", () => {
    const rows = weeklyRhythm({
      timeZone: "UTC",
      localDate: "2026-09-23",
      localDateOfSession,
      sessions: [
        session("u", "2026-09-21T09:00:00.000Z", "completed", { focus: "Upper Strength" }),
        session("l", "2026-09-23T09:00:00.000Z", "not_started", { focus: "Lower Power" }),
        session("r", "2026-09-22T09:00:00.000Z", "not_started", { restDay: true, focus: "Rest" }),
      ],
    })
    expect(rows.map((row) => row.label)).toEqual(expect.arrayContaining(["Upper", "Legs", "Recovery"]))
    expect(rows.find((row) => row.label === "Push")).toBeUndefined()
  })
})

describe("then vs now math", () => {
  it("uses percentage points and hides missing / zero-denominator volume", () => {
    expect(formatPoints(26)).toBe("+26 pts")
    const hidden = buildProgressJourney(
      base({
        now: new Date("2026-08-12T12:00:00.000Z"),
        sessions: [session("s1", "2026-08-04T09:00:00.000Z", "completed")],
        nutritionDays: [{ date: "2026-08-11", entryCount: 1, proteinPercent: 90 }],
      }),
    )
    expect(hidden.thenVsNow.some((item) => item.metricId === "nutrition_adherence")).toBe(false)
    expect(hidden.thenVsNow.some((item) => item.metricId === "bodyweight")).toBe(false)

    const volume = buildProgressJourney(
      base({
        now: new Date("2026-08-18T12:00:00.000Z"),
        sessions: [
          session("w1", "2026-08-04T09:00:00.000Z", "completed", { volumeKg: 0 }),
          session("w2", "2026-08-11T09:00:00.000Z", "completed", { volumeKg: 12000 }),
        ],
      }),
    )
    expect(volume.thenVsNow.some((item) => item.metricId === "training_volume")).toBe(false)
    expect(previousWeekVolumeDelta(volume)).toBeNull()
  })
})

describe("muscle focus", () => {
  it("returns null until enough mapped work exists", () => {
    expect(buildMuscleFocus(["chest"])).toBeNull()
    const focus = buildMuscleFocus(["chest", "chest", "lats", "quads", "abs"])
    expect(focus?.mostTrained).toBe("Chest")
    expect(focus?.leastTrained).toBeTruthy()
    expect(JSON.stringify(focus)).not.toMatch(/strongest|weakest/i)
  })
})

describe("motivation resolver", () => {
  it("picks one safe line and stays quiet when off or already shown", () => {
    const contexts = resolveProgressMotivation({
      currentStreak: 3,
      milestoneTypes: ["RETURN_AFTER_MISS", "SEVEN_DAY_STREAK"],
      adherenceImproved: true,
      restDayCompleted: true,
    })
    expect(contexts).toContain("RETURN_AFTER_MISS")
    const selected = selectMotivationLine({
      contexts,
      localDate: "2026-09-25",
      preference: { enabled: true, lastDate: null, lastKey: null },
    })
    expect(selected?.context).toBe("MILESTONE_REACHED")
    expect(selected?.line.toLowerCase()).not.toContain("no excuses")
    expect(selectMotivationLine({
      contexts,
      localDate: "2026-09-25",
      preference: { enabled: true, lastDate: "2026-09-25", lastKey: selected?.key ?? null },
    })).toBeNull()
    expect(
      selectMotivationLine({
        contexts: ["REST_DAY_COMPLETED"],
        localDate: "2026-09-26",
        preference: { enabled: false, lastDate: null, lastKey: null },
      }),
    ).toBeNull()
    const banned = /no pain|push through|don't be weak|no excuses|rest is for losers/i
    for (const lines of Object.values(MOTIVATION_BANK)) {
      for (const line of lines) expect(line).not.toMatch(banned)
    }
  })
})

describe("grounded dante context", () => {
  it("does not invent cause or body composition", () => {
    const journey = buildProgressJourney(
      base({
        now: new Date("2026-08-18T12:00:00.000Z"),
        sessions: [
          session("w1a", "2026-08-03T09:00:00.000Z", "completed"),
          session("w1b", "2026-08-04T09:00:00.000Z", "not_started"),
          session("w2a", "2026-08-10T09:00:00.000Z", "completed"),
          session("w2b", "2026-08-11T09:00:00.000Z", "completed"),
        ],
      }),
    )
    const model = buildProgressPageModel({
      journey,
      sessions: [],
      timezone: "UTC",
      localDate: "2026-08-18",
      muscle: null,
      nutrition: { available: false, unavailable: false, rings: [] },
      body: { weightKg: 70, heightCm: 175, bmi: 22.9, goal: "lean_bulk" },
    })
    expect(model.journey.groundedSummary.toLowerCase()).not.toContain("life got in the way")
    expect(model.journey.groundedSummary.toLowerCase()).not.toContain("lean mass")
    expect(model.journey.groundedSummary.toLowerCase()).not.toContain("avoiding")
    expect(model.body.goal).toBe("Lean bulk")
    expect(CONSISTENCY_STATUS_LABEL.MISSED).toBe("Planned session missed")
  })
})
