import type { TodaySession } from "@/lib/training/load-today-session"
import {
  buildPlanVersionRef,
  prescriptionsMatch,
  type WorkoutAdjustmentProposal,
  type WorkoutChange,
  type WorkoutPrescription,
} from "@/lib/recovery/proposal"

export type WorkoutMutationRecord = {
  mutationId: string
  subjectRef: string
  proposalRef: string
  workoutBeforeRef: string
  workoutAfterRef: string
  previousPlanVersionRef: string
  newPlanVersionRef: string
  appliedAt: string
  appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL"
  changeRefs: string[]
}

export type ApplyProposalError =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_APPLIED"
  | "EXPIRED"
  | "STALE_PLAN"
  | "INVALID_PATCH"
  | "NO_MUTATION"

export type ApplyProposalResult =
  | {
      ok: true
      alreadyApplied: boolean
      mutation: WorkoutMutationRecord
      session: TodaySession
    }
  | { ok: false; error: ApplyProposalError; message: string }

export type MutationStore = {
  findByProposalId: (proposalId: string) => Promise<WorkoutMutationRecord | null>
  insert: (record: WorkoutMutationRecord) => Promise<"inserted" | "already_applied">
}

export type OwnedSession = TodaySession & { userId: string }

export type SessionWriter = {
  loadOwnedSession: (userId: string, workoutRef: string) => Promise<OwnedSession | null>
  applyPatches: (
    userId: string,
    workoutRef: string,
    patches: Array<{ sessionExerciseId: string; after: WorkoutPrescription }>,
  ) => Promise<OwnedSession>
}

const APPLY_MESSAGES: Record<ApplyProposalError, string> = {
  UNAUTHENTICATED: "You must be signed in to apply a plan change.",
  FORBIDDEN: "That adjustment does not belong to your account.",
  NOT_FOUND: "This workout is no longer available.",
  ALREADY_APPLIED: "This adjustment has already been applied.",
  EXPIRED: "This suggestion has expired. Refresh the recommendation before applying it.",
  STALE_PLAN: "Your workout changed after this suggestion was created. Refresh the recommendation before applying it.",
  INVALID_PATCH: "This suggestion no longer matches today's workout.",
  NO_MUTATION: "There is nothing to apply.",
}

export function applyErrorMessage(error: ApplyProposalError): string {
  return APPLY_MESSAGES[error]
}

function mutatingChanges(proposal: WorkoutAdjustmentProposal): WorkoutChange[] {
  return proposal.changes.filter(
    (change) => change.action !== "KEEP" && change.sessionExerciseId && change.after,
  )
}

function sessionMatchesAfter(session: TodaySession, changes: WorkoutChange[]): boolean {
  return changes.every((change) => {
    const current = session.exercises.find((exercise) => exercise.sessionExerciseId === change.sessionExerciseId)
    if (!current || !change.after) return false
    return prescriptionsMatch(
      {
        targetSets: current.targetSets,
        repMin: current.repMin,
        repMax: current.repMax,
        isSkipped: current.isSkipped,
      },
      change.after,
    )
  })
}

function sessionMatchesBefore(session: TodaySession, changes: WorkoutChange[]): boolean {
  return changes.every((change) => {
    const current = session.exercises.find((exercise) => exercise.sessionExerciseId === change.sessionExerciseId)
    if (!current || !change.before) return false
    return prescriptionsMatch(
      {
        targetSets: current.targetSets,
        repMin: current.repMin,
        repMax: current.repMax,
        isSkipped: current.isSkipped,
      },
      change.before,
    )
  })
}

/**
 * Pure apply contract. Preview never calls this. Double-apply is
 * idempotent via proposalId uniqueness + after-state detection.
 */
export async function applyWorkoutAdjustment(input: {
  actorUserId: string | null
  proposal: WorkoutAdjustmentProposal
  now?: Date
  sessions: SessionWriter
  mutations: MutationStore
}): Promise<ApplyProposalResult> {
  if (!input.actorUserId) {
    return { ok: false, error: "UNAUTHENTICATED", message: APPLY_MESSAGES.UNAUTHENTICATED }
  }
  if (input.proposal.subjectRef !== input.actorUserId) {
    return { ok: false, error: "FORBIDDEN", message: APPLY_MESSAGES.FORBIDDEN }
  }

  const existing = await input.mutations.findByProposalId(input.proposal.proposalId)
  if (existing) {
    const session = await input.sessions.loadOwnedSession(input.actorUserId, input.proposal.workoutRef)
    if (!session) {
      return { ok: false, error: "NOT_FOUND", message: APPLY_MESSAGES.NOT_FOUND }
    }
    return { ok: true, alreadyApplied: true, mutation: existing, session }
  }

  const now = input.now ?? new Date()
  if (input.proposal.expiresAtRef && Date.parse(input.proposal.expiresAtRef) < now.getTime()) {
    return { ok: false, error: "EXPIRED", message: APPLY_MESSAGES.EXPIRED }
  }

  const session = await input.sessions.loadOwnedSession(input.actorUserId, input.proposal.workoutRef)
  if (!session) {
    return { ok: false, error: "NOT_FOUND", message: APPLY_MESSAGES.NOT_FOUND }
  }
  if (session.userId !== input.actorUserId) {
    return { ok: false, error: "FORBIDDEN", message: APPLY_MESSAGES.FORBIDDEN }
  }

  const changes = mutatingChanges(input.proposal)
  if (changes.length === 0) {
    return { ok: false, error: "NO_MUTATION", message: APPLY_MESSAGES.NO_MUTATION }
  }

  const currentVersion = buildPlanVersionRef(session)
  if (currentVersion !== input.proposal.planVersionRef) {
    if (sessionMatchesAfter(session, changes)) {
      const mutation: WorkoutMutationRecord = {
        mutationId: `mut_${input.proposal.proposalId}`,
        subjectRef: input.actorUserId,
        proposalRef: input.proposal.proposalId,
        workoutBeforeRef: input.proposal.workoutRef,
        workoutAfterRef: session.id,
        previousPlanVersionRef: input.proposal.planVersionRef,
        newPlanVersionRef: currentVersion,
        appliedAt: existingAppliedAt(now),
        appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL",
        changeRefs: changes.map((change) => change.changeId),
      }
      await input.mutations.insert(mutation)
      return { ok: true, alreadyApplied: true, mutation, session }
    }
    return { ok: false, error: "STALE_PLAN", message: APPLY_MESSAGES.STALE_PLAN }
  }

  if (!sessionMatchesBefore(session, changes)) {
    return { ok: false, error: "INVALID_PATCH", message: APPLY_MESSAGES.INVALID_PATCH }
  }

  const next = await input.sessions.applyPatches(
    input.actorUserId,
    input.proposal.workoutRef,
    changes.map((change) => ({
      sessionExerciseId: change.sessionExerciseId as string,
      after: change.after as WorkoutPrescription,
    })),
  )

  const mutation: WorkoutMutationRecord = {
    mutationId: `mut_${input.proposal.proposalId}`,
    subjectRef: input.actorUserId,
    proposalRef: input.proposal.proposalId,
    workoutBeforeRef: session.id,
    workoutAfterRef: next.id,
    previousPlanVersionRef: input.proposal.planVersionRef,
    newPlanVersionRef: buildPlanVersionRef(next),
    appliedAt: now.toISOString(),
    appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL",
    changeRefs: changes.map((change) => change.changeId),
  }

  const insert = await input.mutations.insert(mutation)
  if (insert === "already_applied") {
    const recorded = (await input.mutations.findByProposalId(input.proposal.proposalId)) ?? mutation
    return { ok: true, alreadyApplied: true, mutation: recorded, session: next }
  }

  return { ok: true, alreadyApplied: false, mutation, session: next }
}

function existingAppliedAt(now: Date): string {
  return now.toISOString()
}

export function createMemoryMutationStore(
  seed: WorkoutMutationRecord[] = [],
): MutationStore & { records: WorkoutMutationRecord[] } {
  const records = [...seed]
  return {
    records,
    async findByProposalId(proposalId) {
      return records.find((record) => record.proposalRef === proposalId) ?? null
    },
    async insert(record) {
      if (records.some((existing) => existing.proposalRef === record.proposalRef)) {
        return "already_applied"
      }
      records.push(record)
      return "inserted"
    },
  }
}
