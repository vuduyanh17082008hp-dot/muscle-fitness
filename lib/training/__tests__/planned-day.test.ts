import { describe, expect, it } from "vitest"

import { resolvePlannedDay } from "@/lib/training/planned-day"

const day = (id: string, order: number, weekday: number | null, exercises = 4, rest = false) => ({ id, name: id, day_order: order, scheduled_weekday: weekday, rest_day: rest, workout_exercises: Array.from({ length: exercises }, (_, i) => ({ id: `${id}-${i}` })) })

describe("planned day for today (hackathon repair F-05)", () => {
  it("a plan day on today's weekday is a training day, not a rest day", () => {
    expect(resolvePlannedDay([day("upper", 1, 1), day("lower", 2, 4)], 1, null)).toMatchObject({ kind: "SCHEDULED", dayId: "upper", exerciseCount: 4 })
  })
  it("weekday-assigned plan with nothing today is a real rest day", () => {
    expect(resolvePlannedDay([day("upper", 1, 1), day("lower", 2, 4)], 0, null)).toEqual({ kind: "REST" })
  })
  it("flexible plans rotate after the last completed day", () => {
    const days = [day("a", 1, null), day("b", 2, null), day("c", 3, null)]
    expect(resolvePlannedDay(days, 3, null)).toMatchObject({ kind: "FLEXIBLE", dayId: "a" })
    expect(resolvePlannedDay(days, 3, "b")).toMatchObject({ kind: "FLEXIBLE", dayId: "c" })
    expect(resolvePlannedDay(days, 3, "c")).toMatchObject({ kind: "FLEXIBLE", dayId: "a" })
  })
  it("rest days and empty days are never offered; no usable day → null", () => {
    expect(resolvePlannedDay([day("r", 1, 1, 4, true), day("empty", 2, 1, 0)], 1, null)).toBeNull()
  })
})
