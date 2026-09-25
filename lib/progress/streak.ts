import { addDaysIso } from "@/lib/nutrition/date-utils"
import { enumerateDates, localDateInZone } from "@/lib/progress/week-boundary"
import type { ConsistencyDay, ProgressCheckinRow, ProgressSessionRow } from "@/lib/progress/types"

export function localDateOfSession(session: ProgressSessionRow, timeZone: string): string | null {
  const stamp = session.completedAt ?? session.scheduledFor
  if (!stamp) return null
  return localDateInZone(stamp, timeZone)
}

export function buildConsistencyDays(input: {
  fromDate: string
  toDate: string
  timeZone: string
  sessions: ProgressSessionRow[]
  checkins: ProgressCheckinRow[]
}): ConsistencyDay[] {
  const sessionsByDate = new Map<string, ProgressSessionRow[]>()
  for (const session of input.sessions) {
    const date = localDateOfSession(session, input.timeZone)
    if (!date) continue
    const bucket = sessionsByDate.get(date) ?? []
    bucket.push(session)
    sessionsByDate.set(date, bucket)
  }
  const checkins = new Set(input.checkins.map((row) => row.date))

  return enumerateDates(input.fromDate, input.toDate).map((date) => {
    const daySessions = sessionsByDate.get(date) ?? []
    const required = daySessions.filter((session) => !session.restDay)
    const rest = daySessions.filter((session) => session.restDay)
    const completed = required.filter((session) => session.sessionState === "completed")
    const hasCheckin = checkins.has(date)

    if (required.length > 0) {
      if (completed.length >= required.length) {
        return {
          date,
          status: "TRAINING_COMPLETE",
          countsTowardStreak: true,
          evidenceRefs: completed.map((session) => `VERIFIED_LOG:workout_sessions:${session.id}`),
        }
      }
      return {
        date,
        status: "MISSED",
        countsTowardStreak: false,
        evidenceRefs: required.map((session) => `VERIFIED_LOG:workout_sessions:${session.id}`),
      }
    }

    if (rest.length > 0) {
      return {
        date,
        status: "RECOVERY_COMPLETE",
        countsTowardStreak: true,
        evidenceRefs: rest.map((session) => `VERIFIED_LOG:workout_sessions:${session.id}`),
      }
    }

    if (hasCheckin) {
      return {
        date,
        status: "CHECKIN_COMPLETE",
        countsTowardStreak: true,
        evidenceRefs: [`VERIFIED_LOG:recovery_checkins:${date}`],
      }
    }

    return {
      date,
      status: "NO_REQUIREMENT",
      countsTowardStreak: true,
      evidenceRefs: [],
    }
  })
}

export function computeStreaks(days: ConsistencyDay[]): {
  currentStreak: number
  longestStreak: number
} {
  let longest = 0
  let run = 0
  for (const day of days) {
    if (day.status === "NO_REQUIREMENT") {
      continue
    }
    if (day.countsTowardStreak) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }

  let current = 0
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index]
    if (day.status === "NO_REQUIREMENT") continue
    if (!day.countsTowardStreak) break
    current += 1
  }

  return { currentStreak: current, longestStreak: longest }
}

export function previousDate(date: string): string {
  return addDaysIso(date, -1)
}
