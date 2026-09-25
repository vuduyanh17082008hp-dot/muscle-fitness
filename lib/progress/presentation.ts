import { addDaysIso } from "@/lib/nutrition/date-utils"
import { enumerateDates, mondayOf } from "@/lib/progress/week-boundary"
import type {
  ConsistencyDay,
  ProgressJourney,
  ProgressMilestone,
  ProgressMilestoneType,
  ProgressSessionRow,
} from "@/lib/progress/types"

export {
  CONSISTENCY_STATUS_LABEL,
  formatGoal,
  formatKg,
  formatPoints,
} from "@/lib/progress/format"

export type NextMilestone = {
  type: ProgressMilestoneType
  title: string
  current: number
  target: number
  unit: string
}

export type RhythmRow = {
  label: string
  planned: number
  completed: number
  percent: number
}

export type HeatmapInsight = {
  trainingDays: number
  missedDays: number
  restDays: number
  note: string | null
}

const NEXT_CATALOG: Array<{ type: ProgressMilestoneType; title: string; target: number }> = [
  { type: "SEVEN_DAY_STREAK", title: "7-day consistency", target: 7 },
  { type: "FOURTEEN_DAY_STREAK", title: "14-day consistency", target: 14 },
  { type: "THIRTY_DAY_STREAK", title: "30-day consistency", target: 30 },
  { type: "FOUR_WEEKS_COMPLETE", title: "Four weeks on the board", target: 4 },
]

export function journeySentence(journey: ProgressJourney, restToday = false): string {
  if (restToday && journey.currentStreak > 0) {
    return "Recovery is today's planned work."
  }
  if (journey.currentStreak <= 0) {
    return "You're building your first baseline. Start with today's plan."
  }
  const gap = journey.longestStreak - journey.currentStreak
  if (journey.longestStreak > journey.currentStreak && gap > 0 && gap <= 2) {
    return `Two more consistent days match your best streak.`
  }
  if (journey.longestStreak > journey.currentStreak) {
    return `You've kept your planned routine for ${journey.currentStreak} qualifying days. Your best is ${journey.longestStreak}.`
  }
  return `You've kept your planned routine for ${journey.currentStreak} qualifying day${journey.currentStreak === 1 ? "" : "s"}.`
}

export function nextMilestone(journey: ProgressJourney): NextMilestone | null {
  const unlocked = new Set(journey.milestones.map((item) => item.type))
  const completeWeeks = journey.weeklySnapshots.filter(
    (week) => week.plannedSessions > 0 && week.completedSessions >= week.plannedSessions,
  ).length

  for (const item of NEXT_CATALOG) {
    if (unlocked.has(item.type)) continue
    const current =
      item.type === "FOUR_WEEKS_COMPLETE" ? completeWeeks : Math.min(journey.currentStreak, item.target)
    return {
      type: item.type,
      title: item.title,
      current,
      target: item.target,
      unit: item.type === "FOUR_WEEKS_COMPLETE" ? "weeks" : "days",
    }
  }
  return null
}

export function heatmapInsight(days: ConsistencyDay[]): HeatmapInsight {
  const trainingDays = days.filter((day) => day.status === "TRAINING_COMPLETE").length
  const missedDays = days.filter((day) => day.status === "MISSED").length
  const restDays = days.filter((day) => day.status === "RECOVERY_COMPLETE").length
  const missed = days.filter((day) => day.status === "MISSED")
  let note: string | null = null
  if (missed.length >= 3) {
    const weekdayCounts = new Map<number, number>()
    for (const day of missed) {
      const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay()
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1)
    }
    const ranked = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])
    const [weekday, count] = ranked[0] ?? [null, 0]
    if (weekday !== null && count >= 3 && count / missed.length >= 0.5) {
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      note = `${count} of your ${missed.length} missed planned sessions happened on ${names[weekday]}s.`
    }
  }
  return { trainingDays, missedDays, restDays, note }
}

export function weeklyRhythm(input: {
  sessions: ProgressSessionRow[]
  timeZone: string
  localDate: string
  localDateOfSession: (session: ProgressSessionRow, timeZone: string) => string | null
}): RhythmRow[] {
  const weekStart = mondayOf(input.localDate)
  const weekEnd = addDaysIso(weekStart, 6)
  const weekSessions = input.sessions.filter((session) => {
    const date = input.localDateOfSession(session, input.timeZone)
    return date !== null && date >= weekStart && date <= weekEnd
  })

  const buckets = new Map<string, { planned: number; completed: number }>()
  for (const session of weekSessions) {
    const label = session.restDay
      ? "Recovery"
      : categoryFromName(session.focus ?? session.name ?? "Session")
    const bucket = buckets.get(label) ?? { planned: 0, completed: 0 }
    bucket.planned += 1
    if (session.sessionState === "completed" || session.restDay) bucket.completed += 1
    buckets.set(label, bucket)
  }

  return [...buckets.entries()].map(([label, counts]) => ({
    label,
    planned: counts.planned,
    completed: counts.completed,
    percent: counts.planned > 0 ? Math.round((counts.completed / counts.planned) * 100) : 0,
  }))
}

export function rhythmNote(rows: RhythmRow[]): string | null {
  if (rows.length === 0) return null
  const outstanding = rows.filter((row) => row.label !== "Recovery" && row.completed < row.planned)
  const done = rows.filter((row) => row.label !== "Recovery" && row.completed >= row.planned && row.planned > 0)
  if (outstanding.length === 1 && done.length > 0) {
    return `You completed all ${done.map((row) => row.label.toLowerCase()).join(" and ")} work. One ${outstanding[0].label.toLowerCase()} session is still outstanding.`
  }
  if (outstanding.length === 0 && done.length > 0) {
    return "You completed the planned sessions logged for this week."
  }
  return null
}

function categoryFromName(raw: string): string {
  const value = raw.toLowerCase()
  if (/\bpush\b/.test(value)) return "Push"
  if (/\bpull\b/.test(value)) return "Pull"
  if (/\bleg|lower\b/.test(value)) return "Legs"
  if (/\bupper\b/.test(value)) return "Upper"
  if (/\bcardio|condit/.test(value)) return "Cardio"
  if (/\brecover|rest|mobility\b/.test(value)) return "Recovery"
  const first = raw.trim().split(/\s+/)[0]
  return first ? first.replace(/^./, (char) => char.toUpperCase()) : "Session"
}

export const MILESTONE_CATALOG: Array<{
  type: ProgressMilestoneType
  title: string
  description: string
  threshold: string
}> = [
  { type: "FIRST_WEEK_COMPLETE", title: "First week complete", description: "Finish every planned session in a week.", threshold: "1 full week" },
  { type: "SEVEN_DAY_STREAK", title: "7-day consistency", description: "Complete planned actions for seven qualifying days.", threshold: "7 days" },
  { type: "FOURTEEN_DAY_STREAK", title: "14-day consistency", description: "Keep the planned routine for fourteen qualifying days.", threshold: "14 days" },
  { type: "THIRTY_DAY_STREAK", title: "30-day consistency", description: "Keep the planned routine for thirty qualifying days.", threshold: "30 days" },
  { type: "FOUR_WEEKS_COMPLETE", title: "Four weeks on the board", description: "Four weeks with enough logged history to compare.", threshold: "4 weeks" },
  { type: "ADHERENCE_IMPROVED", title: "Adherence improved", description: "A higher share of planned sessions than your first comparable week.", threshold: "2 comparable weeks" },
  { type: "RECOVERY_CONSISTENCY", title: "Recovery check-ins stacking", description: "Seven check-ins in seven days.", threshold: "7 check-ins" },
  { type: "RETURN_AFTER_MISS", title: "Back on the board", description: "A miss happened, then you picked the plan back up.", threshold: "Return after a miss" },
  { type: "FIRST_VERIFIED_PR", title: "First verified PR", description: "A new estimated 1RM appeared in your logged sets.", threshold: "Logged estimated 1RM" },
]

export function catalogWithUnlocks(milestones: ProgressMilestone[]) {
  return MILESTONE_CATALOG.map((item) => {
    const unlocked = milestones.find((milestone) => milestone.type === item.type)
    return { ...item, unlocked }
  })
}

export function heatmapWindow(days: ConsistencyDay[], today: string): ConsistencyDay[] {
  const thisMonday = mondayOf(today)
  const firstMonday = addDaysIso(thisMonday, -77)
  const lastCell = addDaysIso(firstMonday, 83)
  const byDate = new Map(days.map((day) => [day.date, day]))
  return enumerateDates(firstMonday, lastCell).map(
    (date) =>
      byDate.get(date) ?? {
        date,
        status: "NO_REQUIREMENT",
        countsTowardStreak: true,
        evidenceRefs: [],
      },
  )
}

export function previousWeekVolumeDelta(journey: ProgressJourney): number | null {
  const snapshots = journey.weeklySnapshots
  if (snapshots.length < 2) return null
  const now = snapshots[snapshots.length - 1]?.trainingVolume
  const prev = snapshots[snapshots.length - 2]?.trainingVolume
  if (now === undefined || prev === undefined || prev <= 0) return null
  return Math.round(((now - prev) / prev) * 100)
}

