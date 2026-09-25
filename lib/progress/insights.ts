import { addDaysIso } from "@/lib/nutrition/date-utils"
import { mondayOf } from "@/lib/progress/week-boundary"
import type { ConsistencyDay, ProgressSessionRow, WeeklyProgressSnapshot } from "@/lib/progress/types"

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DOT_LABEL = ["M", "T", "W", "T", "F", "S", "S"]

export type WeekDotKind = "done" | "missed" | "rest" | "today" | "future"

export type WeekDot = {
  date: string
  label: string
  kind: WeekDotKind
  title: string
}

export type QuickInsight = {
  id: "best_day" | "most_missed" | "avg_session" | "trend"
  label: string
  value: string
  detail: string
  tone: "good" | "warn" | "neutral"
}

export function weekdayUtc(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}

export function weekStrip(days: ConsistencyDay[], today: string): WeekDot[] {
  const start = mondayOf(today)
  const byDate = new Map(days.map((day) => [day.date, day]))
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysIso(start, index)
    const day = byDate.get(date)
    const weekday = weekdayUtc(date)
    const label = DOT_LABEL[(weekday + 6) % 7]
    let kind: WeekDotKind = date > today ? "future" : "rest"
    if (day?.status === "TRAINING_COMPLETE" || day?.status === "CHECKIN_COMPLETE") kind = "done"
    else if (day?.status === "MISSED") kind = "missed"
    else if (day?.status === "RECOVERY_COMPLETE") kind = "rest"
    if (date === today && kind !== "missed") kind = kind === "done" || kind === "rest" ? kind : "today"
    if (date === today && kind === "future") kind = "today"
    return {
      date,
      label,
      kind: date === today && kind === "rest" ? "today" : kind,
      title: `${date} — ${kind}`,
    }
  })
}

export function buildQuickInsights(input: {
  days: ConsistencyDay[]
  snapshots: WeeklyProgressSnapshot[]
  sessions: ProgressSessionRow[]
}): QuickInsight[] {
  const insights: QuickInsight[] = []
  const planned = input.days.filter(
    (day) => day.status === "TRAINING_COMPLETE" || day.status === "MISSED" || day.status === "RECOVERY_COMPLETE",
  )

  if (planned.length > 0) {
    const byWeekday = new Map<number, { planned: number; done: number }>()
    for (const day of planned) {
      const weekday = weekdayUtc(day.date)
      const bucket = byWeekday.get(weekday) ?? { planned: 0, done: 0 }
      bucket.planned += 1
      if (day.status !== "MISSED") bucket.done += 1
      byWeekday.set(weekday, bucket)
    }
    const ranked = [...byWeekday.entries()]
      .filter(([, counts]) => counts.planned > 0)
      .sort((a, b) => b[1].done / b[1].planned - a[1].done / a[1].planned)
    const best = ranked[0]
    if (best) {
      const rate = Math.round((best[1].done / best[1].planned) * 100)
      insights.push({
        id: "best_day",
        label: "Best consistency day",
        value: WEEKDAY[best[0]],
        detail: `${rate}% planned completion`,
        tone: "good",
      })
    }

    const misses = input.days.filter((day) => day.status === "MISSED")
    if (misses.length >= 2) {
      const missCount = new Map<number, number>()
      for (const day of misses) {
        const weekday = weekdayUtc(day.date)
        missCount.set(weekday, (missCount.get(weekday) ?? 0) + 1)
      }
      const worst = [...missCount.entries()].sort((a, b) => b[1] - a[1])[0]
      if (worst && worst[1] >= 2) {
        insights.push({
          id: "most_missed",
          label: "Most missed",
          value: WEEKDAY[worst[0]],
          detail: `${worst[1]} missed planned days`,
          tone: "warn",
        })
      }
    }
  }

  const durations = input.sessions
    .filter((session) => session.sessionState === "completed" && !session.restDay && session.durationMinutes)
    .map((session) => session.durationMinutes as number)
    .filter((value) => value > 0)
  if (durations.length > 0) {
    const avg = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    insights.push({
      id: "avg_session",
      label: "Avg session",
      value: `${avg} min`,
      detail: `${durations.length} timed session${durations.length === 1 ? "" : "s"}`,
      tone: "neutral",
    })
  }

  const adherence = input.snapshots
    .map((week) => week.adherence)
    .filter((value): value is number => value !== undefined)
  if (adherence.length < 3) {
    insights.push({
      id: "trend",
      label: "Trend",
      value: "Not enough data",
      detail: "Need three comparable weeks",
      tone: "neutral",
    })
  } else {
    const last = adherence.slice(-3)
    const rising = last[0] < last[1] && last[1] < last[2]
    const falling = last[0] > last[1] && last[1] > last[2]
    insights.push({
      id: "trend",
      label: "Trend",
      value: rising ? "Rising" : falling ? "Mixed" : last[2] === last[1] ? "Stable" : "Mixed",
      detail: rising ? "3 weeks up" : "Latest comparable weeks",
      tone: rising ? "good" : "neutral",
    })
  }

  return insights
}
