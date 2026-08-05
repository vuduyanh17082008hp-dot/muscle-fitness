type RecoveryInput = {
  sleepHours: number
  energyLevel: number
  sorenessLevel: number
  stressLevel: number
}

type AdherenceInput = {
  caloriesConsumed: number
  proteinConsumedG: number
  waterMl: number
  steps: number

  calorieTarget: number
  proteinTargetG: number
  waterTargetMl: number
  stepTarget: number
}

export function clamp(
  value: number,
  minimum = 0,
  maximum = 100,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  )
}

export function calculateRecoveryScore(
  input: RecoveryInput,
) {
  const sleepScore = clamp(
    (input.sleepHours / 8) * 100,
  )

  const energyScore = clamp(
    input.energyLevel * 10,
  )

  const sorenessScore = clamp(
    100 -
      (input.sorenessLevel - 1) *
        (100 / 9),
  )

  const stressScore = clamp(
    100 -
      (input.stressLevel - 1) *
        (100 / 9),
  )

  return Math.round(
    sleepScore * 0.4 +
      energyScore * 0.25 +
      sorenessScore * 0.2 +
      stressScore * 0.15,
  )
}

function calorieCloseness(
  consumed: number,
  target: number,
) {
  if (target <= 0) {
    return 0
  }

  return clamp(
    100 -
      (Math.abs(consumed - target) /
        target) *
        100,
  )
}

function targetCompletion(
  value: number,
  target: number,
) {
  if (target <= 0) {
    return 0
  }

  return clamp(
    (value / target) * 100,
  )
}

export function calculateAdherenceScore(
  input: AdherenceInput,
) {
  const scores = [
    calorieCloseness(
      input.caloriesConsumed,
      input.calorieTarget,
    ),

    targetCompletion(
      input.proteinConsumedG,
      input.proteinTargetG,
    ),

    targetCompletion(
      input.waterMl,
      input.waterTargetMl,
    ),

    targetCompletion(
      input.steps,
      input.stepTarget,
    ),
  ]

  const total = scores.reduce(
    (sum, value) => sum + value,
    0,
  )

  return Math.round(
    total / scores.length,
  )
}

export function getDateInTimezone(
  timezone: string,
  date = new Date(),
) {
  const parts =
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)

  const year = parts.find(
    (part) => part.type === 'year',
  )?.value

  const month = parts.find(
    (part) => part.type === 'month',
  )?.value

  const day = parts.find(
    (part) => part.type === 'day',
  )?.value

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new Error(
      'Unable to calculate the local dashboard date.',
    )
  }

  return `${year}-${month}-${day}`
}

export function progressPercentage(
  value: number,
  target: number,
) {
  if (target <= 0) {
    return 0
  }

  return Math.round(
    clamp(
      (value / target) * 100,
    ),
  )
}