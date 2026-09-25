import type { ConsistencyDayStatus } from "@/lib/progress/types"

export const CONSISTENCY_STATUS_LABEL: Record<ConsistencyDayStatus, string> = {
  TRAINING_COMPLETE: "Planned workout completed",
  RECOVERY_COMPLETE: "Planned rest / recovery day",
  CHECKIN_COMPLETE: "Recovery check-in logged",
  MISSED: "Planned session missed",
  NO_REQUIREMENT: "No planned action",
}

export function formatKg(value: number): string {
  return `${new Intl.NumberFormat("en-US").format(Math.round(value))} kg`
}

export function formatPoints(delta: number): string {
  const sign = delta > 0 ? "+" : ""
  return `${sign}${delta} pts`
}

export function formatGoal(value: string | null | undefined): string | null {
  if (!value) return null
  return value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase())
}
