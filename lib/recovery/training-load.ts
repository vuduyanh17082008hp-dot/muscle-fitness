import type { TrainingLoadSummary, TrainingLoadState } from "@/lib/recovery/types"

export type RecentSessionRow = {
  completed_at: string | null
  session_rpe: number | null
  total_volume_kg: number | null
}

function daysAgo(dateIso: string, now: Date): number {
  const then = new Date(dateIso)
  const diffMs = now.getTime() - then.getTime()

  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Connects today's recovery score to recent training load using simple,
 * explainable rules. This never cancels a workout automatically — it only
 * classifies the day as green / amber / red for the athlete to act on.
 */
export function computeTrainingLoad(
  sessions: RecentSessionRow[],
  recoveryScore: number | null,
  now: Date = new Date(),
): TrainingLoadSummary {
  const last7 = sessions.filter((session) => {
    if (!session.completed_at) return false
    return daysAgo(session.completed_at, now) < 7
  })

  const sessionsLast7Days = last7.length

  const trainingDaySet = new Set(
    last7
      .filter((session) => session.completed_at)
      .map((session) => session.completed_at!.slice(0, 10)),
  )

  const restDaysLast7Days = Math.max(0, 7 - trainingDaySet.size)

  const rpeValues = last7
    .map((session) => session.session_rpe)
    .filter((value): value is number => value !== null)

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
    .filter((value): value is number => value !== null && value > 0)

  const totalVolumeKgLast7Days =
    volumeValues.length > 0
      ? Math.round(volumeValues.reduce((sum, value) => sum + value, 0))
      : null

  const mostRecent = sessions
    .filter((session) => session.completed_at)
    .sort(
      (a, b) =>
        new Date(b.completed_at!).getTime() -
        new Date(a.completed_at!).getTime(),
    )[0]

  const lastSessionDaysAgo = mostRecent?.completed_at
    ? daysAgo(mostRecent.completed_at, now)
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
