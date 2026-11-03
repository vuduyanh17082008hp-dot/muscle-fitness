/**
 * MF-S1: how an active plan's week changes when the user's training availability changes. Pure: the plan rows in, the
 * exact per-day weekday assignment out. Nothing about the workouts themselves changes — only which weekday each
 * training day is pinned to (workout_days.scheduled_weekday, read by planned-day.ts and the "This week" strip) and the
 * plan's stated days per week.
 *
 *   workouts == days/week, days named      → pin each workout to a named day, in plan order
 *   workouts == days/week, none named      → keep a schedule that already fits, else a spread week (Mon/Wed/Fri…)
 *   workouts != days/week (or days named that don't fit) → a rotation: every day unpinned, the next workout each time you train
 */

export type ScheduleDay = { dayId: string; name: string; dayOrder: number; weekday: number | null }
export type ScheduleShape = "FIXED" | "ROTATION"
export type ScheduleChange = {
  shape: ScheduleShape
  daysPerWeek: number
  days: Array<{ dayId: string; name: string; before: number | null; after: number | null }>
  /** True when nothing would change (same weekdays and same days/week). */
  unchanged: boolean
}

const SPREAD: Record<number, number[]> = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0] }
/** Monday-first week order for 0..6 (Sunday last). */
export const weekOrder = (day: number) => (day + 6) % 7

export function planScheduleChange(input: { trainingDays: ScheduleDay[]; currentDaysPerWeek: number; daysPerWeek: number; weekdays: number[] | null }): ScheduleChange {
  const days = [...input.trainingDays].sort((a, b) => a.dayOrder - b.dayOrder)
  const n = input.daysPerWeek
  let after: Array<number | null>
  if (days.length === n && input.weekdays && input.weekdays.length === n) {
    after = [...input.weekdays].sort((a, b) => weekOrder(a) - weekOrder(b))
  } else if (days.length === n) {
    const pinned = days.map((day) => day.weekday)
    const fits = pinned.every((day) => day !== null) && new Set(pinned).size === n
    after = fits ? pinned : SPREAD[n]!
  } else {
    after = days.map(() => null)
  }
  const out = days.map((day, index) => ({ dayId: day.dayId, name: day.name, before: day.weekday, after: after[index] ?? null }))
  return {
    shape: after.every((day) => day === null) ? "ROTATION" : "FIXED",
    daysPerWeek: n,
    days: out,
    unchanged: input.currentDaysPerWeek === n && out.every((day) => day.before === day.after),
  }
}

const NAMES = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
} as const

/** "1 day a week" / "3 days a week" / "3 buổi/tuần"; `short` → "3 days/week". */
export const perWeek = (n: number, language: "en" | "vi", short = false) =>
  language === "vi" ? `${n} buổi/tuần` : short ? `${n} day${n === 1 ? "" : "s"}/week` : `${n} day${n === 1 ? "" : "s"} a week`

export const weekdayName =(day: number, language: "en" | "vi") => NAMES[language][day] ?? "?"

/** "Mon Push · Wed Pull · Fri Legs" or "rotation: Push → Pull → Legs". */
export function describeWeek(days: Array<{ name: string; weekday: number | null }>, language: "en" | "vi"): string {
  if (days.length === 0) return language === "vi" ? "chưa có buổi tập" : "no training days"
  const pinned = days.filter((day) => day.weekday !== null).sort((a, b) => weekOrder(a.weekday!) - weekOrder(b.weekday!))
  const loose = days.filter((day) => day.weekday === null)
  const parts: string[] = []
  if (pinned.length) parts.push(pinned.map((day) => `${weekdayName(day.weekday!, language)} ${day.name}`).join(" · "))
  if (loose.length) parts.push(`${language === "vi" ? "xoay vòng" : "rotation"}: ${loose.map((day) => day.name).join(" → ")}`)
  return parts.join(" · ")
}
