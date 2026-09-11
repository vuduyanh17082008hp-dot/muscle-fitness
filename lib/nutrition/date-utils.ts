/** Plain date helpers shared by client and server — no "server-only" import here on purpose. */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
