import type { ProgressComparison, WeeklyProgressSnapshot } from "@/lib/progress/types"

function comparable(
  thenWeek: WeeklyProgressSnapshot | undefined,
  nowWeek: WeeklyProgressSnapshot | undefined,
  read: (week: WeeklyProgressSnapshot) => number | undefined,
): { then: number; now: number } | null {
  if (!thenWeek || !nowWeek || thenWeek.snapshotId === nowWeek.snapshotId) return null
  const then = read(thenWeek)
  const now = read(nowWeek)
  if (then === undefined || now === undefined) return null
  return { then, now }
}

export function buildThenVsNow(snapshots: WeeklyProgressSnapshot[]): ProgressComparison[] {
  if (snapshots.length < 2) return []
  const thenWeek = snapshots[0]
  const nowWeek = snapshots[snapshots.length - 1]
  const comparisons: ProgressComparison[] = []

  const seriesFor = (read: (week: WeeklyProgressSnapshot) => number | undefined) =>
    snapshots.map((week) => read(week)).filter((value): value is number => value !== undefined)

  const adherence = comparable(thenWeek, nowWeek, (week) => week.adherence)
  if (adherence) {
    comparisons.push({
      metricId: "training_adherence",
      label: "Training adherence",
      thenLabel: `Week ${thenWeek.weekIndex}`,
      nowLabel: `Week ${nowWeek.weekIndex}`,
      thenValue: adherence.then,
      nowValue: adherence.now,
      unit: "%",
      delta: adherence.now - adherence.then,
      deltaKind: "points",
      series: seriesFor((week) => week.adherence),
      evidenceRefs: [...thenWeek.sourceRefs, ...nowWeek.sourceRefs],
    })
  }

  const checkins = comparable(thenWeek, nowWeek, (week) => week.recoveryCheckins)
  if (checkins) {
    comparisons.push({
      metricId: "recovery_checkins",
      label: "Recovery check-ins",
      thenLabel: `Week ${thenWeek.weekIndex}`,
      nowLabel: `Week ${nowWeek.weekIndex}`,
      thenValue: checkins.then,
      nowValue: checkins.now,
      delta: checkins.now - checkins.then,
      deltaKind: "absolute",
      series: seriesFor((week) => week.recoveryCheckins),
      evidenceRefs: [...thenWeek.sourceRefs, ...nowWeek.sourceRefs],
    })
  }

  const nutrition = comparable(thenWeek, nowWeek, (week) => week.nutritionAdherence)
  if (nutrition) {
    comparisons.push({
      metricId: "nutrition_adherence",
      label: "Nutrition adherence",
      thenLabel: `Week ${thenWeek.weekIndex}`,
      nowLabel: `Week ${nowWeek.weekIndex}`,
      thenValue: nutrition.then,
      nowValue: nutrition.now,
      unit: "%",
      delta: nutrition.now - nutrition.then,
      deltaKind: "points",
      series: seriesFor((week) => week.nutritionAdherence),
      evidenceRefs: [...thenWeek.sourceRefs, ...nowWeek.sourceRefs],
    })
  }

  const volume = comparable(thenWeek, nowWeek, (week) => week.trainingVolume)
  if (volume && volume.then > 0) {
    comparisons.push({
      metricId: "training_volume",
      label: "Training volume",
      thenLabel: `Week ${thenWeek.weekIndex}`,
      nowLabel: `Week ${nowWeek.weekIndex}`,
      thenValue: volume.then,
      nowValue: volume.now,
      unit: "kg",
      delta: Math.round(((volume.now - volume.then) / volume.then) * 100),
      deltaKind: "percent",
      series: seriesFor((week) => week.trainingVolume),
      evidenceRefs: [...thenWeek.sourceRefs, ...nowWeek.sourceRefs],
    })
  }

  return comparisons
}
