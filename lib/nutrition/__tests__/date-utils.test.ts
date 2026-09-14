import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addDaysIso, todayIso } from "@/lib/nutrition/date-utils"

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
