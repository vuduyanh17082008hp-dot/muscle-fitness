import type { TrainingLoadSummary, TrainingLoadState } from "@/lib/recovery/types"
import { addDaysIso } from "@/lib/nutrition/date-utils"

export type RecentSessionRow = {
  completed_at: string | null
  session_rpe: number | null
  total_volume_kg: number | null
}

function toLocalDateIso(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}

function calendarDaysBetween(earlierDateIso: string, laterDateIso: string): number {
  const earlier = Date.parse(`${earlierDateIso}T12:00:00.000Z`)
  const later = Date.parse(`${laterDateIso}T12:00:00.000Z`)
  if (!Number.isFinite(earlier) || !Number.isFinite(later)) return Number.POSITIVE_INFINITY
  return Math.floor((later - earlier) / (1000 * 60 * 60 * 24))
}

/**
 * Connects today's recovery score to recent training load using simple,
 * explainable rules. This never cancels a workout automatically — it only
 * classifies the day as green / amber / red for the athlete to act on.
 *
 * Session day-bucketing uses the athlete's IANA timezone so a late-evening
 * session in Asia/Singapore is not counted on the previous UTC date.
 */
export function computeTrainingLoad(
  sessions: RecentSessionRow[],
  recoveryScore: number | null,
  now: Date = new Date(),
  timeZone: string = "UTC",
): TrainingLoadSummary {
  const todayLocal = toLocalDateIso(now, timeZone)
  const windowStart = addDaysIso(todayLocal, -6)

  const last7 = sessions.filter((session) => {
    if (!session.completed_at) return false
    const completedAt = new Date(session.completed_at)
    if (!Number.isFinite(completedAt.getTime()) || completedAt.getTime() > now.getTime()) {
      return false
    }
    const sessionDay = toLocalDateIso(completedAt, timeZone)
    return sessionDay >= windowStart && sessionDay <= todayLocal
  })

  const sessionsLast7Days = last7.length

  const trainingDaySet = new Set(
    last7
      .filter((session) => session.completed_at)
      .map((session) => toLocalDateIso(new Date(session.completed_at!), timeZone)),
  )

  const restDaysLast7Days = Math.max(0, 7 - trainingDaySet.size)

  const rpeValues = last7
    .map((session) => session.session_rpe)
    .filter((value): value is number => value !== null && Number.isFinite(value))

  const averageSessionRpe =
    rpeValues.length > 0
      ? Math.round(
          (rpeValues.reduce((sum, value) => sum + value, 0) /
            rpeValues.length) *
            10,
        ) / 10
      : null

  const volumeValues = last7
    .map((session) => session.total_volume_kg)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)

  const totalVolumeKgLast7Days =
    volumeValues.length > 0
      ? Math.round(volumeValues.reduce((sum, value) => sum + value, 0))
      : null

  const mostRecent = sessions
    .filter((session) => {
      if (!session.completed_at) return false
      const completedAt = new Date(session.completed_at)
      return Number.isFinite(completedAt.getTime()) && completedAt.getTime() <= now.getTime()
    })
    .sort(
      (a, b) =>
        new Date(b.completed_at!).getTime() -
        new Date(a.completed_at!).getTime(),
    )[0]

  const lastSessionDaysAgo = mostRecent?.completed_at
    ? calendarDaysBetween(toLocalDateIso(new Date(mostRecent.completed_at), timeZone), todayLocal)
    : null

  const highLoad =
    sessionsLast7Days >= 5 ||
    (averageSessionRpe !== null && averageSessionRpe >= 8.5)

  const noRestDays = restDaysLast7Days === 0 && sessionsLast7Days >= 5

  let state: TrainingLoadState = "green"
  let reason =
    "Training load looks manageable relative to your recovery data. Train your plan as normal."

  if (recoveryScore === null) {
    state = "green"
    reason =
      "No recovery check-in yet today — log one to connect training load with readiness."
  } else if (recoveryScore < 50 && (highLoad || noRestDays)) {
    state = "red"
    reason =
      "Recovery signals are in the priority range and recent training load is high. Prioritise recovery or choose a lower-stress session today."
  } else if (recoveryScore < 50) {
    state = "amber"
    reason =
      "Recovery signals are low. Maintain quality but consider reducing unnecessary volume or intensity today."
  } else if (recoveryScore < 70 && highLoad) {
    state = "amber"
    reason =
      "Recovery is moderate while recent load has been high. Keep technique quality high and consider trimming extra volume."
  } else if (noRestDays) {
    state = "amber"
    reason =
      "No rest days in the last 7 days. Recovery is currently acceptable, but a lower-stress day soon would help sustain it."
  }

  return {
    state,
    reason,
    sessionsLast7Days,
    restDaysLast7Days,
    averageSessionRpe,
    totalVolumeKgLast7Days,
    lastSessionDaysAgo,
  }
}
