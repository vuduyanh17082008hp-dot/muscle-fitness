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
  | "PROPOSAL_NOT_FOUND"
  | "ALREADY_APPLIED"
  | "EXPIRED"
  | "STALE_PLAN"
  | "INVALID_PATCH"
  | "NO_MUTATION"
  | "APPLY_FAILED"

export type ApplyProposalResult =
  | {
      ok: true
      alreadyApplied: boolean
      mutation: WorkoutMutationRecord
      session: TodaySession
    }
  | { ok: false; error: ApplyProposalError; message: string }

export type ProposalStore = {
  save: (proposal: WorkoutAdjustmentProposal) => Promise<void>
  load: (proposalId: string, userId: string) => Promise<WorkoutAdjustmentProposal | null>
}

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
  replaceOwnedSession?: (session: OwnedSession) => Promise<void>
}

export type CanonicalCommit = {
  commit: (input: {
    userId: string
    proposal: WorkoutAdjustmentProposal
    session: OwnedSession
    changes: WorkoutChange[]
    now: Date
  }) => Promise<ApplyProposalResult>
}

const APPLY_MESSAGES: Record<ApplyProposalError, string> = {
  UNAUTHENTICATED: "You must be signed in to apply a plan change.",
  FORBIDDEN: "That adjustment does not belong to your account.",
  NOT_FOUND: "This workout is no longer available.",
  PROPOSAL_NOT_FOUND: "This adjustment is no longer available.",
  ALREADY_APPLIED: "This adjustment has already been applied.",
  EXPIRED: "This suggestion has expired. Refresh the recommendation before applying it.",
  STALE_PLAN: "Your workout changed after this suggestion was created. Refresh the recommendation before applying it.",
  INVALID_PATCH: "This suggestion no longer matches today's workout.",
  NO_MUTATION: "There is nothing to apply.",
  APPLY_FAILED: "The plan change could not be recorded. Nothing was applied.",
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
 * Pure apply contract. Preview never calls this. The stored snapshot
 * is the only prescription source — client `after` never reaches here.
 * Double-apply is idempotent via proposalId uniqueness + after-state detection.
 */
export async function applyWorkoutAdjustment(input: {
  actorUserId: string | null
  proposalId: string
  now?: Date
  sessions: SessionWriter
  mutations: MutationStore
  proposals: ProposalStore
  commit?: CanonicalCommit
}): Promise<ApplyProposalResult> {
  if (!input.actorUserId) {
    return { ok: false, error: "UNAUTHENTICATED", message: APPLY_MESSAGES.UNAUTHENTICATED }
  }

  const proposal = await input.proposals.load(input.proposalId, input.actorUserId)
  if (!proposal) {
    return { ok: false, error: "PROPOSAL_NOT_FOUND", message: APPLY_MESSAGES.PROPOSAL_NOT_FOUND }
  }
  if (proposal.subjectRef !== input.actorUserId) {
    return { ok: false, error: "FORBIDDEN", message: APPLY_MESSAGES.FORBIDDEN }
  }

  const existing = await input.mutations.findByProposalId(proposal.proposalId)
  if (existing) {
    const session = await input.sessions.loadOwnedSession(input.actorUserId, proposal.workoutRef)
    if (!session) {
      return { ok: false, error: "NOT_FOUND", message: APPLY_MESSAGES.NOT_FOUND }
    }
    return { ok: true, alreadyApplied: true, mutation: existing, session }
  }

  const now = input.now ?? new Date()
  if (proposal.expiresAtRef && Date.parse(proposal.expiresAtRef) < now.getTime()) {
    return { ok: false, error: "EXPIRED", message: APPLY_MESSAGES.EXPIRED }
  }

  const session = await input.sessions.loadOwnedSession(input.actorUserId, proposal.workoutRef)
  if (!session) {
    return { ok: false, error: "NOT_FOUND", message: APPLY_MESSAGES.NOT_FOUND }
  }
  if (session.userId !== input.actorUserId) {
    return { ok: false, error: "FORBIDDEN", message: APPLY_MESSAGES.FORBIDDEN }
  }

  const changes = mutatingChanges(proposal)
  if (changes.length === 0) {
    return { ok: false, error: "NO_MUTATION", message: APPLY_MESSAGES.NO_MUTATION }
  }

  const currentVersion = buildPlanVersionRef(session)
  if (currentVersion !== proposal.planVersionRef) {
    if (sessionMatchesAfter(session, changes)) {
      const committer = input.commit ?? createLocalCanonicalCommit(input.sessions, input.mutations)
      return committer.commit({
        userId: input.actorUserId,
        proposal,
        session,
        changes,
        now,
      })
    }
    return { ok: false, error: "STALE_PLAN", message: APPLY_MESSAGES.STALE_PLAN }
  }

  if (!sessionMatchesBefore(session, changes)) {
    return { ok: false, error: "INVALID_PATCH", message: APPLY_MESSAGES.INVALID_PATCH }
  }

  const committer = input.commit ?? createLocalCanonicalCommit(input.sessions, input.mutations)
  return committer.commit({
    userId: input.actorUserId,
    proposal,
    session,
    changes,
    now,
  })
}

function createLocalCanonicalCommit(sessions: SessionWriter, mutations: MutationStore): CanonicalCommit {
  return {
    async commit({ userId, proposal, session, changes, now }) {
      const previous = structuredClone(session)
      let next: OwnedSession
      try {
        next = await sessions.applyPatches(
          userId,
          proposal.workoutRef,
          changes.map((change) => ({
            sessionExerciseId: change.sessionExerciseId as string,
            after: change.after as WorkoutPrescription,
          })),
        )
      } catch {
        if (sessions.replaceOwnedSession) await sessions.replaceOwnedSession(previous)
        return { ok: false, error: "APPLY_FAILED", message: APPLY_MESSAGES.APPLY_FAILED }
      }

      const mutation: WorkoutMutationRecord = {
        mutationId: `mut_${proposal.proposalId}`,
        subjectRef: userId,
        proposalRef: proposal.proposalId,
        workoutBeforeRef: session.id,
        workoutAfterRef: next.id,
        previousPlanVersionRef: proposal.planVersionRef,
        newPlanVersionRef: buildPlanVersionRef(next),
        appliedAt: now.toISOString(),
        appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL",
        changeRefs: changes.map((change) => change.changeId),
      }

      try {
        const insert = await mutations.insert(mutation)
        if (insert === "already_applied") {
          const recorded = (await mutations.findByProposalId(proposal.proposalId)) ?? mutation
          return { ok: true, alreadyApplied: true, mutation: recorded, session: next }
        }
        return { ok: true, alreadyApplied: false, mutation, session: next }
      } catch {
        if (sessions.replaceOwnedSession) await sessions.replaceOwnedSession(previous)
        return { ok: false, error: "APPLY_FAILED", message: APPLY_MESSAGES.APPLY_FAILED }
      }
    },
  }
}

export function createMemoryProposalStore(
  seed: WorkoutAdjustmentProposal[] = [],
): ProposalStore & { snapshots: WorkoutAdjustmentProposal[] } {
  const snapshots = seed.map((proposal) => structuredClone(proposal))
  return {
    snapshots,
    async save(proposal) {
      const copy = structuredClone(proposal)
      const index = snapshots.findIndex((row) => row.proposalId === proposal.proposalId)
      if (index >= 0) snapshots[index] = copy
      else snapshots.push(copy)
    },
    async load(proposalId, userId) {
      const row = snapshots.find((proposal) => proposal.proposalId === proposalId)
      if (!row || row.subjectRef !== userId) return null
      return structuredClone(row)
    },
  }
}

export function createMemoryMutationStore(
  seed: WorkoutMutationRecord[] = [],
): MutationStore & { records: WorkoutMutationRecord[]; failNextInsert: boolean } {
  const records = [...seed]
  const store = {
    records,
    failNextInsert: false,
    async findByProposalId(proposalId: string) {
      return records.find((record) => record.proposalRef === proposalId) ?? null
    },
    async insert(record: WorkoutMutationRecord) {
      if (store.failNextInsert) {
        store.failNextInsert = false
        throw new Error("audit write failed")
      }
      if (records.some((existing) => existing.proposalRef === record.proposalRef)) {
        return "already_applied" as const
      }
      records.push(record)
      return "inserted" as const
    },
  }
  return store
}
