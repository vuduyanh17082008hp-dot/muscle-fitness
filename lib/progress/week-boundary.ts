import { startOfWeekMonday, weekKey } from "@/lib/training/week-bucketing"
import { localDateTimeParts } from "@/lib/training/load-today-session"
import { addDaysIso } from "@/lib/nutrition/date-utils"

export const WEEK_START_CONVENTION = "monday" as const

export function localDateInZone(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) return "1970-01-01"
  return localDateTimeParts(date, timeZone).localDate
}

export function mondayOf(localDate: string): string {
  return weekKey(startOfWeekMonday(new Date(`${localDate}T00:00:00.000Z`)))
}

export function sundayOf(weekStart: string): string {
  return addDaysIso(weekStart, 6)
}

export function enumerateDates(periodStart: string, periodEnd: string): string[] {
  const dates: string[] = []
  for (let cursor = periodStart; cursor <= periodEnd; cursor = addDaysIso(cursor, 1)) {
    dates.push(cursor)
  }
  return dates
}

export function weekIndexFromOrigin(weekStart: string, originWeekStart: string): number {
  const start = Date.parse(`${weekStart}T00:00:00.000Z`)
  const origin = Date.parse(`${originWeekStart}T00:00:00.000Z`)
  return Math.floor((start - origin) / (7 * 24 * 60 * 60 * 1000)) + 1
}
