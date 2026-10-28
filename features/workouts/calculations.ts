import type { WorkoutPlayerExercise } from './types'

export type ProgressionInput = {
  previousWeightKg: number
  completedSets: number
  targetSets: number
  minimumReps: number
  repMin: number
  allSetsReachedRepMax: boolean
  averageRir: number | null
  targetRir: number
}

export type ProgressionResult = {
  action: 'increase' | 'hold' | 'reduce' | 'repeat'
  suggestedWeightKg: number
  reason: string
}

export function roundToIncrement(
  value: number,
  increment = 0.5,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.round(value / increment) * increment
}

export function calculateSetVolume(
  weightKg: number | null,
  reps: number | null,
): number {
  if (
    weightKg === null ||
    reps === null ||
    weightKg < 0 ||
    reps < 0
  ) {
    return 0
  }

  return Math.round(weightKg * reps * 100) / 100
}

export function calculateEstimatedOneRepMax(
  weightKg: number | null,
  reps: number | null,
): number | null {
  if (
    weightKg === null ||
    reps === null ||
    weightKg <= 0 ||
    reps < 1 ||
    reps > 12
  ) {
    return null
  }

  const estimated = weightKg * (1 + reps / 30)

  return Math.round(estimated * 100) / 100
}

export function calculateProgression(
  input: ProgressionInput,
): ProgressionResult {
  const currentWeight = Math.max(0, input.previousWeightKg)

  if (input.completedSets < input.targetSets) {
    return {
      action: 'repeat',
      suggestedWeightKg: currentWeight,
      reason:
        'Complete every prescribed working set before increasing the load.',
    }
  }

  if (
    input.allSetsReachedRepMax &&
    (input.averageRir === null ||
      input.averageRir >= input.targetRir)
  ) {
    return {
      action: 'increase',
      suggestedWeightKg: roundToIncrement(
        currentWeight * 1.025,
        0.5,
      ),
      reason:
        'All sets reached the top of the rep range with enough repetitions in reserve.',
    }
  }

  if (
    input.minimumReps < input.repMin ||
    (input.averageRir !== null && input.averageRir < 1)
  ) {
    return {
      action: 'reduce',
      suggestedWeightKg: roundToIncrement(
        currentWeight * 0.95,
        0.5,
      ),
      reason:
        'The previous load produced repetitions below the target range or was too close to failure.',
    }
  }

  return {
    action: 'hold',
    suggestedWeightKg: currentWeight,
    reason:
      'Keep the current load and build more repetitions before increasing.',
  }
}

export type SetSuggestion = {
  weightKg: number | null
  reps: number | null
  /** Where the values came from: an earlier logged set today, the same set last session, or the plan's rep target. */
  source: { kind: 'set'; setNumber: number } | { kind: 'history' } | { kind: 'target' }
}

/**
 * Carry-forward for an unlogged set: the closest earlier logged set of this exercise, else last session's same set
 * (or its last set), else the planned reps. A hint only: the player shows it as a placeholder and never saves it
 * unless the athlete logs the set.
 */
export function suggestSetValues(
  exercise: Pick<WorkoutPlayerExercise, 'sets' | 'previous'>,
  setIndex: number,
): SetSuggestion | null {
  for (let index = setIndex - 1; index >= 0; index -= 1) {
    const earlier = exercise.sets[index]!
    if (earlier.completed && (earlier.weightKg !== null || earlier.reps !== null)) {
      return { weightKg: earlier.weightKg, reps: earlier.reps, source: { kind: 'set', setNumber: earlier.setNumber } }
    }
  }

  const set = exercise.sets[setIndex]
  const history = exercise.previous?.sets ?? []
  const past = history.find((item) => item.setNumber === set?.setNumber) ?? history.at(-1)
  if (past && (past.weightKg !== null || past.reps !== null)) {
    return { weightKg: past.weightKg, reps: past.reps, source: { kind: 'history' } }
  }

  return set?.targetReps != null ? { weightKg: null, reps: set.targetReps, source: { kind: 'target' } } : null
}
