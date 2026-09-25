import type {
  RecoveryCheckinInput,
  RecoveryCheckinRow,
  RecoveryScoreResult,
  RecoveryStatus,
} from "@/lib/recovery/types"

export type RecoveryLevel = "HIGH" | "MODERATE" | "LOW" | "UNKNOWN"

export type RecoveryDataCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT"

export type RecoveryDigest = {
  readiness: RecoveryLevel
  fatigue: RecoveryLevel
  sleep: RecoveryLevel
  soreness: RecoveryLevel
  stress: RecoveryLevel
  relevantBodyAreaRefs: string[]
  dataCompleteness: RecoveryDataCompleteness
  status: RecoveryStatus | null
  score: number | null
}

export type RecoveryState = {
  recoveryStateId: string
  subjectRef: string
  checkinRef: string
  scopeRef: string
  derivedAtRef: string
  digest: RecoveryDigest
  constraintRefs: string[]
  sourceRefs: string[]
}

function stableId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function toCheckinInput(row: RecoveryCheckinRow | null): RecoveryCheckinInput {
  return {
    sleepHours: row?.sleep_hours ?? null,
    sleepQuality: row?.sleep_quality ?? null,
    stress: row?.stress ?? null,
    fatigue: row?.fatigue ?? null,
    soreness: row?.soreness ?? null,
    mood: row?.mood ?? null,
    readiness: row?.readiness ?? null,
    restingHr: row?.resting_hr ?? null,
    steps: row?.steps ?? null,
    painIllness: row?.pain_illness ?? "no",
    notes: row?.notes ?? null,
  }
}

function driverLevel(
  result: RecoveryScoreResult,
  key: RecoveryScoreResult["drivers"][number]["key"],
): RecoveryLevel {
  const driver = result.drivers.find((item) => item.key === key)
  if (!driver?.available) return "UNKNOWN"
  if (driver.score >= 70) return "HIGH"
  if (driver.score >= 50) return "MODERATE"
  return "LOW"
}

function statusLevel(status: RecoveryStatus | null): RecoveryLevel {
  if (status === "ready" || status === "good") return "HIGH"
  if (status === "moderate") return "MODERATE"
  if (status === "priority") return "LOW"
  return "UNKNOWN"
}

function completeness(result: RecoveryScoreResult): RecoveryDataCompleteness {
  if (result.score === null) return "INSUFFICIENT"
  return result.missingInputs.length === 0 ? "COMPLETE" : "PARTIAL"
}

/**
 * Derived projection of an immutable check-in + the existing
 * computeRecoveryScore() result. Never invents fields the score
 * engine did not already compute.
 */
export function deriveRecoveryState(input: {
  subjectRef: string
  checkin: RecoveryCheckinRow | null
  scoreResult: RecoveryScoreResult
  derivedAt?: string
  bodyAreaRefs?: string[]
  constraintRefs?: string[]
}): RecoveryState {
  const derivedAt = input.derivedAt ?? new Date().toISOString()
  const checkinRef = input.checkin?.id ?? "none"
  const sourceRefs = [
    input.checkin ? `VERIFIED_LOG:recovery_checkins:${input.checkin.id}` : "UNKNOWN:recovery_checkins:missing",
    "INFERRED:computeRecoveryScore",
  ]
  if (input.checkin?.notes) {
    sourceRefs.push("USER_EXPLICIT:recovery_checkins.notes")
  }

  const digest: RecoveryDigest = {
    readiness: statusLevel(input.scoreResult.status),
    fatigue: driverLevel(input.scoreResult, "fatigue"),
    sleep: driverLevel(input.scoreResult, "sleep"),
    soreness: driverLevel(input.scoreResult, "soreness"),
    stress: driverLevel(input.scoreResult, "stress"),
    relevantBodyAreaRefs: input.bodyAreaRefs ?? [],
    dataCompleteness: completeness(input.scoreResult),
    status: input.scoreResult.status,
    score: input.scoreResult.score,
  }

  const recoveryStateId = `rs_${stableId(
    JSON.stringify({
      subjectRef: input.subjectRef,
      checkinRef,
      updatedAt: input.checkin?.updated_at ?? null,
      score: digest.score,
      status: digest.status,
      missing: input.scoreResult.missingInputs,
    }),
  )}`

  return {
    recoveryStateId,
    subjectRef: input.subjectRef,
    checkinRef,
    scopeRef: `recovery:${input.subjectRef}:${input.checkin?.checkin_date ?? "none"}`,
    derivedAtRef: derivedAt,
    digest,
    constraintRefs: input.constraintRefs ?? [],
    sourceRefs,
  }
}
