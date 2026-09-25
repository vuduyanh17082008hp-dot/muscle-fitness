import type { ConsistencyDay, ConsistencyDayStatus } from "@/lib/progress/types"

export type ConsistencyLevel = {
  level: number
  title: string
  currentXp: number
  nextLevelXp: number
  progressPercent: number
}

const XP: Record<ConsistencyDayStatus, number> = {
  TRAINING_COMPLETE: 100,
  RECOVERY_COMPLETE: 60,
  CHECKIN_COMPLETE: 20,
  MISSED: 0,
  NO_REQUIREMENT: 0,
}

const TIERS = [
  { level: 1, title: "Starting", minXp: 0 },
  { level: 2, title: "Building rhythm", minXp: 300 },
  { level: 3, title: "Consistency builder", minXp: 800 },
  { level: 4, title: "Routine established", minXp: 1500 },
  { level: 5, title: "Locked in", minXp: 2500 },
] as const

const MILESTONE_BONUS = 50

export function buildConsistencyLevel(input: {
  days: ConsistencyDay[]
  milestoneCount: number
}): ConsistencyLevel {
  const seen = new Set<string>()
  let xp = 0
  for (const day of input.days) {
    if (seen.has(day.date)) continue
    seen.add(day.date)
    xp += XP[day.status]
  }
  xp += Math.max(0, input.milestoneCount) * MILESTONE_BONUS

  const current = [...TIERS].reverse().find((tier) => xp >= tier.minXp) ?? TIERS[0]
  const next = TIERS.find((tier) => tier.level === current.level + 1)
  const nextLevelXp = next?.minXp ?? current.minXp
  const span = Math.max(1, nextLevelXp - current.minXp)
  const progressPercent = next
    ? Math.min(100, Math.round(((xp - current.minXp) / span) * 100))
    : 100

  return {
    level: current.level,
    title: current.title,
    currentXp: xp,
    nextLevelXp,
    progressPercent,
  }
}
