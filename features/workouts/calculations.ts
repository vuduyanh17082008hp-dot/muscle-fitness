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