import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addDaysIso, isSupportedFoodLogViewDate, isSupportedFoodLogWriteDate, todayIso } from "@/lib/nutrition/date-utils"
import { localDateTimeParts } from "@/lib/training/load-today-session"

describe("todayIso", () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it("returns the LOCAL calendar date, not the UTC date, just after midnight in a positive-offset timezone (Test A — Sep 14 local must not become Sep 13)", () => {
    process.env.TZ = "Asia/Singapore" // UTC+8
    // 2026-09-13T17:00:00Z is 2026-09-14T01:00:00 in Singapore — the
    // exact reported-bug scenario. The old `.toISOString().slice(0, 10)`
    // implementation would have returned "2026-09-13" here.
    vi.setSystemTime(new Date("2026-09-13T17:00:00.000Z"))
    expect(todayIso()).toBe("2026-09-14")
  })

  it("still agrees with UTC when the viewer's timezone IS UTC", () => {
    process.env.TZ = "UTC"
    vi.setSystemTime(new Date("2026-09-13T17:00:00.000Z"))
    expect(todayIso()).toBe("2026-09-13")
  })

  it("stays on the correct local day even for a negative-offset timezone", () => {
    process.env.TZ = "America/Los_Angeles" // UTC-7/8
    // 2026-09-14T03:00:00Z is still 2026-09-13 evening in Los Angeles.
    vi.setSystemTime(new Date("2026-09-14T03:00:00.000Z"))
    expect(todayIso()).toBe("2026-09-13")
  })
})

describe("addDaysIso", () => {
  it("adds days to a calendar date independent of timezone (pure date arithmetic, not an instant)", () => {
    expect(addDaysIso("2026-09-14", -1)).toBe("2026-09-13")
    expect(addDaysIso("2026-09-14", 1)).toBe("2026-09-15")
  })
})

describe("food log date window", () => {
  it("writes only on profile-local today, including the Singapore UTC-midnight boundary", () => {
    const localToday = localDateTimeParts(new Date("2026-10-06T16:30:00.000Z"), "Asia/Singapore").localDate
    expect(localToday).toBe("2026-10-07")
    expect(isSupportedFoodLogWriteDate("2026-10-07", localToday)).toBe(true)
    expect(isSupportedFoodLogWriteDate("2026-10-06", localToday)).toBe(false)
    expect(isSupportedFoodLogWriteDate("2099-01-01", localToday)).toBe(false)
    expect(isSupportedFoodLogWriteDate("2020-01-01", localToday)).toBe(false)
    expect(isSupportedFoodLogWriteDate("2026-02-30", localToday)).toBe(false)
  })

  it("lets history view any past day but not a future day", () => {
    expect(isSupportedFoodLogViewDate("2024-02-29", "2026-09-15")).toBe(true)
    expect(isSupportedFoodLogViewDate("2026-09-15", "2026-09-15")).toBe(true)
    expect(isSupportedFoodLogViewDate("2026-09-16", "2026-09-15")).toBe(false)
  })
})
