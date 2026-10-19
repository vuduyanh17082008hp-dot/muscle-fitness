import { describe, expect, it } from "vitest"

import { reconcileRecoveryReport, resolveCurrentRecovery } from "@/lib/recovery/current-recovery"
import { readinessDecisionLines } from "@/lib/intelligence/query-understanding/dante-context"
import { parseUserQuery } from "@/lib/intelligence/query-understanding/frame"

const TODAY = "2026-10-13"

describe("PF-04 resolveCurrentRecovery", () => {
  it("CURRENT: a check-in for the local calendar day", () => {
    expect(
      resolveCurrentRecovery({
        localDate: TODAY,
        checkins: [{ checkin_date: TODAY, recovery_score: 38 }, { checkin_date: "2026-10-12", recovery_score: 71 }],
        todayScore: 38,
      }),
    ).toEqual({ status: "CURRENT", score: 38, recordedDate: TODAY, localDate: TODAY, provenance: "VERIFIED_CHECKIN" })
  })

  it("STALE: yesterday's score is returned with its date, never as today's", () => {
    expect(
      resolveCurrentRecovery({
        localDate: TODAY,
        checkins: [{ checkin_date: "2026-10-10", recovery_score: 60 }, { checkin_date: "2026-10-12", recovery_score: 38 }],
        todayScore: null,
      }),
    ).toEqual({ status: "STALE", score: 38, recordedDate: "2026-10-12", localDate: TODAY, provenance: "VERIFIED_CHECKIN" })
  })

  it("MISSING: no check-in at all, or only unscored older rows", () => {
    const missing = { status: "MISSING", score: null, recordedDate: null, localDate: TODAY, provenance: "NONE" }
    expect(resolveCurrentRecovery({ localDate: TODAY, checkins: [], todayScore: null })).toEqual(missing)
    expect(
      resolveCurrentRecovery({ localDate: TODAY, checkins: [{ checkin_date: "2026-10-12", recovery_score: null }], todayScore: null }),
    ).toEqual(missing)
  })

  it("a row dated after the local day is not treated as current or stale", () => {
    expect(
      resolveCurrentRecovery({ localDate: TODAY, checkins: [{ checkin_date: "2026-10-14", recovery_score: 90 }], todayScore: null }).status,
    ).toBe("MISSING")
  })
})

describe("PF-04 reconcileRecoveryReport", () => {
  const current = resolveCurrentRecovery({ localDate: TODAY, checkins: [{ checkin_date: TODAY, recovery_score: 38 }], todayScore: 38 })
  const stale = resolveCurrentRecovery({ localDate: TODAY, checkins: [{ checkin_date: "2026-10-12", recovery_score: 38 }], todayScore: null })

  it("verified today 38 vs user says 11: both kept, conflict flagged, verified wins", () => {
    expect(reconcileRecoveryReport(current, 11)).toEqual({
      verified: 38,
      userReported: 11,
      conflict: true,
      effective: { score: 38, provenance: "VERIFIED", recordedDate: TODAY },
    })
  })

  it("agreeing numbers are not a conflict", () => {
    expect(reconcileRecoveryReport(current, 38).conflict).toBe(false)
  })

  it("no verified today: the user's number is USER_EXPLICIT, never VERIFIED, and outranks a stale check-in", () => {
    expect(reconcileRecoveryReport(stale, 11)).toEqual({
      verified: null,
      userReported: 11,
      conflict: false,
      effective: { score: 11, provenance: "USER_EXPLICIT", recordedDate: null },
    })
  })

  it("no verified today and no user number: the stale check-in is used, labelled stale with its date", () => {
    expect(reconcileRecoveryReport(stale, null).effective).toEqual({ score: 38, provenance: "STALE_CHECKIN", recordedDate: "2026-10-12" })
  })

  it("nothing at all: NONE", () => {
    expect(reconcileRecoveryReport(null, null).effective).toEqual({ score: null, provenance: "NONE", recordedDate: null })
  })
})

describe("PF-04 Dante prompt context", () => {
  const frame = parseUserQuery("recovery is 11, should I train today?", { surface: "DANTE", history: [] })

  it("states the verified score and the conflict, and keeps the user's number as USER_EXPLICIT", () => {
    const text = readinessDecisionLines(frame, { hasCheckin: true, score: 38, status: "Recovery Priority", state: {
      status: "CURRENT", score: 38, recordedDate: TODAY, localDate: TODAY, provenance: "VERIFIED_CHECKIN",
    } }).join(" ")
    expect(text).toContain("score=38/100")
    expect(text).toContain("recovery_conflict=true: verified=38 (VERIFIED), user_reported=11 (USER_EXPLICIT)")
  })

  it("with only a stale check-in: never presents it as today's, and treats the user's number as self-reported", () => {
    const text = readinessDecisionLines(frame, { hasCheckin: false, score: null, status: null, state: {
      status: "STALE", score: 38, recordedDate: "2026-10-12", localDate: TODAY, provenance: "VERIFIED_CHECKIN",
    } }).join(" ")
    expect(text).toContain("no check-in logged today")
    expect(text).toContain("provenance=USER_EXPLICIT")
    expect(text).not.toMatch(/VERIFIED/)
    expect(text).toContain("from 2026-10-12 (score 38/100) — status=STALE")
    expect(text).not.toContain("score=38/100")
    expect(text).not.toContain("recovery_conflict=true")
  })
})
