import type { TodaySession, TodaySessionExercise } from "@/lib/training/load-today-session"
import type { RecoveryState } from "@/lib/recovery/recovery-state"
import {
  exerciseHitsArea,
  type CurrentSafetyScope,
} from "@/lib/recovery/workout-safety-scope"

export type WorkoutPrescription = {
  targetSets: number | null
  repMin: number | null
  repMax: number | null
  isSkipped: boolean
}

export type WorkoutChangeAction =
  | "KEEP"
  | "REDUCE_SETS"
  | "REDUCE_LOAD"
  | "REDUCE_RPE"
  | "REPLACE"
  | "REMOVE"
  | "REST"

export type WorkoutChange = {
  changeId: string
  exerciseId?: string
  sessionExerciseId?: string
  exerciseName: string
  action: WorkoutChangeAction
  before?: WorkoutPrescription
  after?: WorkoutPrescription
  reasonCode?: string
  reasonDisplay?: string
  evidenceRefs: string[]
  constraintRefs?: string[]
}

export type AdjustmentStatus =
  | "NO_CHANGE"
  | "MINOR_ADJUSTMENT"
  | "MODERATE_ADJUSTMENT"
  | "REST_RECOMMENDED"

export type ProposalDecisionState = "RESOLVED" | "CONDITIONAL" | "INSUFFICIENT_INFORMATION"

export type WorkoutAdjustmentProposal = {
  proposalId: string
  subjectRef: string
  workoutRef: string
  planVersionRef: string
  recoveryStateRef: string
  safetyEvaluationRef: string
  createdAtRef: string
  expiresAtRef?: string
  status: AdjustmentStatus
  decisionState: ProposalDecisionState
  changes: WorkoutChange[]
  evidenceRefs: string[]
}

function stableId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function prescriptionOf(exercise: TodaySessionExercise): WorkoutPrescription {
  return {
    targetSets: exercise.targetSets,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    isSkipped: exercise.isSkipped,
  }
}

export function buildPlanVersionRef(session: TodaySession): string {
  const fingerprint = session.exercises
    .map(
      (exercise) =>
        `${exercise.sessionExerciseId}:${exercise.targetSets ?? "x"}:${exercise.repMin ?? "x"}:${exercise.repMax ?? "x"}:${exercise.isSkipped ? 1 : 0}`,
    )
    .join("|")
  return [
    session.workoutPlanId ?? "none",
    session.planUpdatedAt ?? "none",
    session.updatedAt ?? "none",
    session.id,
    fingerprint,
  ].join("::")
}

function reduceSets(sets: number | null): number | null {
  if (sets === null || sets <= 1) return sets
  return Math.max(1, sets - 1)
}

function changeId(sessionExerciseId: string, action: WorkoutChangeAction): string {
  return `chg_${stableId(`${sessionExerciseId}:${action}`)}`
}

function relevantToScope(exercise: TodaySessionExercise, scope: CurrentSafetyScope): boolean {
  if (scope.emergency) return true
  if (scope.affectedBodyAreaRefs.length === 0) return false
  return scope.affectedBodyAreaRefs.some((area) =>
    exerciseHitsArea({
      exerciseName: exercise.exerciseName,
      primaryMuscle: exercise.primaryMuscle,
      area,
    }),
  )
}

/**
 * Deterministic proposal from RecoveryState + today's session + scoped
 * safety. LLM is not consulted.
 */
export function generateWorkoutAdjustmentProposal(input: {
  subjectRef: string
  recoveryState: RecoveryState
  safetyScope: CurrentSafetyScope
  session: TodaySession | null
  createdAt?: string
}): WorkoutAdjustmentProposal {
  const createdAt = input.createdAt ?? input.recoveryState.derivedAtRef
  const evidenceRefs = [...input.recoveryState.sourceRefs]
  const workoutRef = input.session?.id ?? "none"
  const planVersionRef = input.session ? buildPlanVersionRef(input.session) : "none"

  const base = {
    subjectRef: input.subjectRef,
    workoutRef,
    planVersionRef,
    recoveryStateRef: input.recoveryState.recoveryStateId,
    safetyEvaluationRef: input.safetyScope.safetyEvaluationRef,
    createdAtRef: createdAt,
    expiresAtRef: new Date(Date.parse(createdAt) + 12 * 60 * 60 * 1000).toISOString(),
    evidenceRefs,
  }

  if (input.safetyScope.emergency) {
    const changes =
      input.session?.exercises
        .filter((exercise) => !exercise.isSkipped)
        .map((exercise) => ({
          changeId: changeId(exercise.sessionExerciseId, "REST"),
          exerciseId: exercise.exerciseId,
          sessionExerciseId: exercise.sessionExerciseId,
          exerciseName: exercise.exerciseName,
          action: "REST" as const,
          before: prescriptionOf(exercise),
          after: { ...prescriptionOf(exercise), isSkipped: true },
          reasonCode: "EMERGENCY_DOMINANCE",
          reasonDisplay: "An unresolved emergency signal takes priority over today's session.",
          evidenceRefs: [...evidenceRefs, input.safetyScope.safetyEvaluationRef],
          constraintRefs: input.safetyScope.constraintRefs,
        })) ?? []

    return finalize({
      ...base,
      status: "REST_RECOMMENDED",
      decisionState: "RESOLVED",
      changes,
    })
  }

  if (input.recoveryState.digest.dataCompleteness === "INSUFFICIENT") {
    return finalize({
      ...base,
      status: "NO_CHANGE",
      decisionState: "INSUFFICIENT_INFORMATION",
      changes: keepAll(input.session, evidenceRefs, "INSUFFICIENT_RECOVERY", "Not enough check-in data to change the session."),
    })
  }

  if (!input.session) {
    return finalize({
      ...base,
      status: "NO_CHANGE",
      decisionState: "RESOLVED",
      changes: [],
    })
  }

  const changes: WorkoutChange[] = []
  const scoped = input.safetyScope.affectedBodyAreaRefs.length > 0
  const low = input.recoveryState.digest.readiness === "LOW"
  const moderate = input.recoveryState.digest.readiness === "MODERATE"
  const fatigueLow =
    input.recoveryState.digest.fatigue === "LOW" || input.recoveryState.digest.soreness === "LOW"

  for (const exercise of input.session.exercises) {
    if (exercise.isSkipped) {
      changes.push(keep(exercise, evidenceRefs, "ALREADY_SKIPPED", "Already out of today's session."))
      continue
    }

    const hits = relevantToScope(exercise, input.safetyScope)
    if (scoped && hits) {
      const afterSets = reduceSets(exercise.targetSets)
      const action: WorkoutChangeAction =
        exercise.targetSets !== null && afterSets !== null && afterSets < exercise.targetSets
          ? "REDUCE_SETS"
          : "KEEP"
      changes.push({
        changeId: changeId(exercise.sessionExerciseId, action),
        exerciseId: exercise.exerciseId,
        sessionExerciseId: exercise.sessionExerciseId,
        exerciseName: exercise.exerciseName,
        action,
        before: prescriptionOf(exercise),
        after:
          action === "REDUCE_SETS"
            ? { ...prescriptionOf(exercise), targetSets: afterSets }
            : prescriptionOf(exercise),
        reasonCode: "SCOPED_SAFETY",
        reasonDisplay: "This movement loads the area you flagged. Keep it conservative; the rest of the session stays.",
        evidenceRefs: [...evidenceRefs, input.safetyScope.safetyEvaluationRef],
        constraintRefs: input.safetyScope.constraintRefs,
      })
      continue
    }

    if (scoped && !hits) {
      changes.push(keep(exercise, evidenceRefs, "OUT_OF_SCOPE", "Unrelated to the current safety scope — leave as planned."))
      continue
    }

    if (low || (moderate && fatigueLow)) {
      const afterSets = reduceSets(exercise.targetSets)
      if (exercise.targetSets !== null && afterSets !== null && afterSets < exercise.targetSets) {
        changes.push({
          changeId: changeId(exercise.sessionExerciseId, "REDUCE_SETS"),
          exerciseId: exercise.exerciseId,
          sessionExerciseId: exercise.sessionExerciseId,
          exerciseName: exercise.exerciseName,
          action: "REDUCE_SETS",
          before: prescriptionOf(exercise),
          after: { ...prescriptionOf(exercise), targetSets: afterSets },
          reasonCode: low ? "LOW_RECOVERY" : "MODERATE_FATIGUE",
          reasonDisplay: low
            ? "Recovery is a priority today — trim a set and keep the session."
            : "Recovery is a little lower today. I'd keep the session, but reduce some fatigue.",
          evidenceRefs,
        })
        continue
      }
    }

    changes.push(keep(exercise, evidenceRefs, "NO_SIGNAL", "No structured signal to change this lift."))
  }

  const mutating = changes.filter((change) => change.action !== "KEEP")
  const decisionState: ProposalDecisionState =
    input.recoveryState.digest.dataCompleteness === "PARTIAL" && mutating.length > 0
      ? "CONDITIONAL"
      : "RESOLVED"

  return finalize({
    ...base,
    status:
      mutating.length === 0
        ? "NO_CHANGE"
        : low
          ? "MODERATE_ADJUSTMENT"
          : "MINOR_ADJUSTMENT",
    decisionState,
    changes,
  })
}

function keep(
  exercise: TodaySessionExercise,
  evidenceRefs: string[],
  reasonCode: string,
  reasonDisplay: string,
): WorkoutChange {
  return {
    changeId: changeId(exercise.sessionExerciseId, "KEEP"),
    exerciseId: exercise.exerciseId,
    sessionExerciseId: exercise.sessionExerciseId,
    exerciseName: exercise.exerciseName,
    action: "KEEP",
    before: prescriptionOf(exercise),
    after: prescriptionOf(exercise),
    reasonCode,
    reasonDisplay,
    evidenceRefs,
  }
}

function keepAll(
  session: TodaySession | null,
  evidenceRefs: string[],
  reasonCode: string,
  reasonDisplay: string,
): WorkoutChange[] {
  return (session?.exercises ?? []).map((exercise) => keep(exercise, evidenceRefs, reasonCode, reasonDisplay))
}

function finalize(
  proposal: Omit<WorkoutAdjustmentProposal, "proposalId">,
): WorkoutAdjustmentProposal {
  const proposalId = `wap_${stableId(
    JSON.stringify({
      subjectRef: proposal.subjectRef,
      workoutRef: proposal.workoutRef,
      planVersionRef: proposal.planVersionRef,
      recoveryStateRef: proposal.recoveryStateRef,
      safetyEvaluationRef: proposal.safetyEvaluationRef,
      status: proposal.status,
      decisionState: proposal.decisionState,
      changes: proposal.changes.map((change) => ({
        changeId: change.changeId,
        action: change.action,
        after: change.after,
      })),
    }),
  )}`

  return { proposalId, ...proposal }
}

export function proposalMutatesWorkout(proposal: WorkoutAdjustmentProposal): boolean {
  return proposal.changes.some((change) => change.action !== "KEEP")
}

export function prescriptionsMatch(left?: WorkoutPrescription, right?: WorkoutPrescription): boolean {
  if (!left || !right) return left === right
  return (
    left.targetSets === right.targetSets &&
    left.repMin === right.repMin &&
    left.repMax === right.repMax &&
    left.isSkipped === right.isSkipped
  )
}
