/** Plain date helpers shared by client and server — no "server-only" import here on purpose. */

/**
 * "Today" as the viewer's own LOCAL calendar date — deliberately uses
 * `Date`'s local getters (getFullYear/getMonth/getDate), never
 * `.toISOString()` (always UTC). `.toISOString().slice(0, 10)` here
 * silently showed YESTERDAY's date for any timezone ahead of UTC
 * during the early morning (e.g. Asia/Singapore, UTC+8, from
 * midnight to 8am local). On the client there's no persisted profile
 * timezone to look up (that's a server-side concern, see
 * lib/nutrition/food-log/load-food-log-context.ts::resolveLocalToday)
 * — the browser's own local clock is already the correct source here.
 */
export function todayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function addDaysIso(dateIso: string, delta: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function formatDateLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`)
  const isToday = dateIso === todayIso()
  const isYesterday = dateIso === addDaysIso(todayIso(), -1)

  if (isToday) return "Today"
  if (isYesterday) return "Yesterday"

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/** Reject rolled-over dates such as February 30 before sending them to Postgres. */
export function isValidDateIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
