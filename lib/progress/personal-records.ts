import { addDaysIso } from "@/lib/nutrition/date-utils"
import { epley1RM } from "@/lib/training/performance"

export type PersonalRecordPoint = {
  exerciseId: string
  exerciseName: string
  date: string
  estimated1RmKg: number
}

export type PersonalRecord = {
  exerciseId: string
  exerciseName: string
  metric: "Estimated 1RM"
  achievedAt: string
  previousKg: number | null
  currentKg: number
  deltaKg: number | null
}

export function estimateSet1Rm(weightKg: number | null, reps: number | null, stored?: number | null): number | null {
  if (stored !== null && stored !== undefined && stored > 0) return stored
  if (weightKg === null || reps === null) return null
  return epley1RM(weightKg, reps)
}

export function buildPersonalRecords(points: PersonalRecordPoint[]): PersonalRecord[] {
  const byExercise = new Map<string, PersonalRecordPoint[]>()
  for (const point of points) {
    if (point.estimated1RmKg <= 0 || !point.date) continue
    const bucket = byExercise.get(point.exerciseId) ?? []
    bucket.push(point)
    byExercise.set(point.exerciseId, bucket)
  }

  const records: PersonalRecord[] = []
  for (const [exerciseId, history] of byExercise) {
    const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date) || a.estimated1RmKg - b.estimated1RmKg)
    const current = [...ordered].sort((a, b) => b.estimated1RmKg - a.estimated1RmKg || b.date.localeCompare(a.date))[0]
    if (!current) continue
    const earlier = ordered.filter(
      (point) => point.date < current.date || (point.date === current.date && point.estimated1RmKg < current.estimated1RmKg),
    )
    const previous = earlier.length > 0 ? earlier.reduce((best, point) => (point.estimated1RmKg > best.estimated1RmKg ? point : best)) : null
    records.push({
      exerciseId,
      exerciseName: current.exerciseName,
      metric: "Estimated 1RM",
      achievedAt: current.date,
      previousKg: previous?.estimated1RmKg ?? null,
      currentKg: current.estimated1RmKg,
      deltaKg: previous ? Math.round((current.estimated1RmKg - previous.estimated1RmKg) * 10) / 10 : null,
    })
  }

  return records.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)).slice(0, 6)
}

export function isRecentPr(records: PersonalRecord[], today: string, windowDays = 14): boolean {
  return records.some((record) => record.achievedAt >= addDaysIso(today, -windowDays))
}
