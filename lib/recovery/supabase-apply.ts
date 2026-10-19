import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  applyErrorMessage,
  type ApplyProposalError,
  type CanonicalCommit,
  type MutationStore,
  type OwnedSession,
  type ProposalStore,
  type SessionWriter,
  type WorkoutMutationRecord,
} from "@/lib/recovery/apply-proposal"
import type { WorkoutAdjustmentProposal, WorkoutPrescription } from "@/lib/recovery/proposal"
import {
  getRecoveryProposalSecret,
  signRecoveryProposal,
  verifyRecoveryProposal,
} from "@/lib/recovery/proposal-issuance"
import type { TodaySessionExercise } from "@/lib/training/load-today-session"

function asExercises(
  rows: Array<{
    id: string
    exercise_id: string | null
    display_name: string | null
    target_sets: number | null
    target_rep_min: number | null
    target_rep_max: number | null
    rest_seconds: number | null
    is_skipped: boolean | null
  }> | null,
): TodaySessionExercise[] {
  return (rows ?? []).map((row) => ({
    sessionExerciseId: row.id,
    exerciseId: row.exercise_id ?? "",
    exerciseName: row.display_name ?? "Exercise",
    targetSets: row.target_sets,
    repMin: row.target_rep_min,
    repMax: row.target_rep_max,
    restSeconds: row.rest_seconds,
    primaryMuscle: null,
    isSkipped: row.is_skipped === true,
  }))
}

async function loadSession(
  supabase: SupabaseClient,
  userId: string,
  workoutRef: string,
): Promise<OwnedSession | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, user_id, name, scheduled_for, duration_minutes, session_state, updated_at, workout_plan_id")
    .eq("id", workoutRef)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null

  const { data: exerciseRows } = await supabase
    .from("workout_session_exercises")
    .select("id, exercise_id, display_name, target_sets, target_rep_min, target_rep_max, rest_seconds, is_skipped")
    .eq("workout_session_id", workoutRef)
    .order("exercise_order", { ascending: true })

  const row = data as {
    id: string
    user_id: string
    name: string | null
    scheduled_for: string | null
    duration_minutes: number | null
    session_state: string | null
    updated_at: string | null
    workout_plan_id: string | null
  }

  // Same version inputs as loadTodaySession (which issued the proposal): the plan's updated_at is part of planVersionRef,
  // so leaving it null here made every apply look like a stale plan.
  let planUpdatedAt: string | null = null
  if (row.workout_plan_id) {
    const { data: planRow } = await supabase.from("workout_plans").select("updated_at").eq("id", row.workout_plan_id).maybeSingle()
    planUpdatedAt = (planRow as { updated_at?: string | null } | null)?.updated_at ?? null
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    scheduledFor: row.scheduled_for,
    durationMinutes: row.duration_minutes,
    sessionState: row.session_state,
    workoutPlanId: row.workout_plan_id,
    updatedAt: row.updated_at,
    planUpdatedAt,
    exercises: asExercises(exerciseRows as never),
  }
}

export function createSupabaseSessionWriter(supabase: SupabaseClient): SessionWriter {
  return {
    loadOwnedSession: (userId, workoutRef) => loadSession(supabase, userId, workoutRef),
    async applyPatches(userId, workoutRef, patches) {
      const owned = await loadSession(supabase, userId, workoutRef)
      if (!owned) {
        throw new Error("Workout session not found.")
      }

      for (const patch of patches) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        const after: WorkoutPrescription = patch.after
        if (after.targetSets !== null) updates.target_sets = after.targetSets
        if (after.repMin !== null) updates.target_rep_min = after.repMin
        if (after.repMax !== null) updates.target_rep_max = after.repMax
        updates.is_skipped = after.isSkipped

        const { error } = await supabase
          .from("workout_session_exercises")
          .update(updates)
          .eq("id", patch.sessionExerciseId)
          .eq("workout_session_id", workoutRef)

        if (error) throw new Error(error.message)
      }

      await supabase
        .from("workout_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", workoutRef)
        .eq("user_id", userId)

      const next = await loadSession(supabase, userId, workoutRef)
      if (!next) throw new Error("Workout session not found after apply.")
      return next
    },
  }
}

const APPLY_RPC_ERRORS: ApplyProposalError[] = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PROPOSAL_NOT_FOUND",
  "EXPIRED",
  "STALE_PLAN",
  "INVALID_PATCH",
  "NO_MUTATION",
  "APPLY_FAILED",
]

function mapApplyRpcError(message: string): ApplyProposalError {
  return APPLY_RPC_ERRORS.find((code) => message.includes(code)) ?? "APPLY_FAILED"
}

function asMutationPayload(data: unknown): WorkoutMutationRecord | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  if (typeof row.proposalRef !== "string" || typeof row.subjectRef !== "string") return null
  return {
    mutationId: String(row.mutationId ?? ""),
    subjectRef: String(row.subjectRef),
    proposalRef: String(row.proposalRef),
    workoutBeforeRef: String(row.workoutBeforeRef ?? ""),
    workoutAfterRef: String(row.workoutAfterRef ?? ""),
    previousPlanVersionRef: String(row.previousPlanVersionRef ?? ""),
    newPlanVersionRef: String(row.newPlanVersionRef ?? ""),
    appliedAt: String(row.appliedAt ?? ""),
    appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL",
    changeRefs: Array.isArray(row.changeRefs) ? row.changeRefs.map((item) => String(item)) : [],
  }
}

/**
 * True when an adjustment was already applied to this session (workout_before_ref is the session id). One adjustment per
 * session: a second proposal issued against the already-trimmed session would stack another cut. null = read failed.
 */
export async function hasAppliedAdjustment(supabase: SupabaseClient, userId: string, sessionId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("workout_mutation_records")
    .select("proposal_id")
    .eq("user_id", userId)
    .eq("workout_before_ref", sessionId)
    .limit(1)
  if (error) return null
  return (data ?? []).length > 0
}

export function createSupabaseCanonicalCommit(supabase: SupabaseClient): CanonicalCommit {
  return {
    async commit({ userId, proposal, session }) {
      if (!userId || proposal.subjectRef !== userId) {
        return { ok: false, error: "FORBIDDEN", message: applyErrorMessage("FORBIDDEN") }
      }
      // Same-proposal replays never reach here (applyWorkoutAdjustment returns the existing record first).
      const applied = await hasAppliedAdjustment(supabase, userId, proposal.workoutRef)
      if (applied !== false) {
        const code = applied === null ? "APPLY_FAILED" : "ALREADY_APPLIED"
        return { ok: false, error: code, message: applyErrorMessage(code) }
      }
      const { data, error } = await supabase.rpc("apply_recovery_workout_proposal", {
        p_proposal_id: proposal.proposalId,
        p_actor_user_id: userId,
      })
      if (error) {
        const code = mapApplyRpcError(error.message)
        return { ok: false, error: code, message: applyErrorMessage(code) }
      }
      const mutation = asMutationPayload(data)
      if (!mutation) {
        return { ok: false, error: "APPLY_FAILED", message: applyErrorMessage("APPLY_FAILED") }
      }
      const next = (await loadSession(supabase, userId, proposal.workoutRef)) ?? session
      const payload = data as { alreadyApplied?: boolean }
      return {
        ok: true,
        alreadyApplied: payload.alreadyApplied === true,
        mutation,
        session: next,
      }
    },
  }
}

export function createSupabaseMutationStore(supabase: SupabaseClient): MutationStore {
  return {
    async findByProposalId(proposalId) {
      const { data, error } = await supabase
        .from("workout_mutation_records")
        .select(
          "id, user_id, proposal_id, workout_before_ref, workout_after_ref, previous_plan_version_ref, new_plan_version_ref, applied_at, applied_by, change_refs",
        )
        .eq("proposal_id", proposalId)
        .maybeSingle()

      if (error) {
        return null
      }
      if (!data) return null
      const row = data as {
        id: string
        user_id: string
        proposal_id: string
        workout_before_ref: string
        workout_after_ref: string
        previous_plan_version_ref: string
        new_plan_version_ref: string
        applied_at: string
        applied_by: WorkoutMutationRecord["appliedBy"]
        change_refs: string[] | null
      }
      return {
        mutationId: row.id,
        subjectRef: row.user_id,
        proposalRef: row.proposal_id,
        workoutBeforeRef: row.workout_before_ref,
        workoutAfterRef: row.workout_after_ref,
        previousPlanVersionRef: row.previous_plan_version_ref,
        newPlanVersionRef: row.new_plan_version_ref,
        appliedAt: row.applied_at,
        appliedBy: row.applied_by,
        changeRefs: row.change_refs ?? [],
      }
    },
    async insert(record) {
      const { error } = await supabase.from("workout_mutation_records").insert({
        id: record.mutationId.startsWith("mut_") ? undefined : record.mutationId,
        user_id: record.subjectRef,
        proposal_id: record.proposalRef,
        workout_before_ref: record.workoutBeforeRef,
        workout_after_ref: record.workoutAfterRef,
        previous_plan_version_ref: record.previousPlanVersionRef,
        new_plan_version_ref: record.newPlanVersionRef,
        applied_at: record.appliedAt,
        applied_by: record.appliedBy,
        change_refs: record.changeRefs,
      })

      if (error) {
        if (error.code === "23505") return "already_applied"
        throw new Error(error.message)
      }
      return "inserted"
    },
  }
}

function asProposal(value: unknown): WorkoutAdjustmentProposal | null {
  if (!value || typeof value !== "object") return null
  const row = value as WorkoutAdjustmentProposal
  if (typeof row.proposalId !== "string" || typeof row.subjectRef !== "string") return null
  if (!Array.isArray(row.changes)) return null
  return row
}

async function loadTrustedProposal(
  supabase: SupabaseClient,
  proposalId: string,
  userId: string,
): Promise<WorkoutAdjustmentProposal | null> {
  const secret = getRecoveryProposalSecret()
  if (!secret) return null

  const { data, error } = await supabase
    .from("recovery_workout_proposals")
    .select("snapshot, user_id, issuance_mac")
    .eq("proposal_id", proposalId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) return null
  const row = data as { snapshot: unknown; user_id: string; issuance_mac: unknown }
  if (row.user_id !== userId) return null
  const proposal = asProposal(row.snapshot)
  if (!proposal || proposal.subjectRef !== userId || proposal.proposalId !== proposalId) return null
  if (!verifyRecoveryProposal(proposal, row.issuance_mac, secret)) return null
  return proposal
}

export async function persistWorkoutProposal(
  supabase: SupabaseClient,
  proposal: WorkoutAdjustmentProposal,
): Promise<{ ok: true } | { ok: false }> {
  const secret = getRecoveryProposalSecret()
  if (!secret) {
    console.error("[RECOVERY PROPOSAL] persist failed: missing RECOVERY_PROPOSAL_SECRET")
    return { ok: false }
  }

  const { error } = await supabase.from("recovery_workout_proposals").insert({
    proposal_id: proposal.proposalId,
    user_id: proposal.subjectRef,
    workout_ref: proposal.workoutRef,
    plan_version_ref: proposal.planVersionRef,
    expires_at:
      proposal.expiresAtRef ??
      new Date(Date.parse(proposal.createdAtRef) + 12 * 60 * 60 * 1000).toISOString(),
    snapshot: proposal,
    issuance_mac: signRecoveryProposal(proposal, secret),
  })
  if (error) {
    if (error.code === "23505") {
      const existing = await loadTrustedProposal(supabase, proposal.proposalId, proposal.subjectRef)
      return existing ? { ok: true } : { ok: false }
    }
    console.error("[RECOVERY PROPOSAL] persist failed", error)
    return { ok: false }
  }
  return { ok: true }
}

export function createSupabaseProposalStore(supabase: SupabaseClient): ProposalStore {
  return {
    async save(proposal) {
      const result = await persistWorkoutProposal(supabase, proposal)
      if (!result.ok) {
        throw new Error("Unable to store the adjustment proposal.")
      }
    },
    async load(proposalId, userId) {
      return loadTrustedProposal(supabase, proposalId, userId)
    },
  }
}
