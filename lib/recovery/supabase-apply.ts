import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  createMemoryMutationStore,
  type MutationStore,
  type OwnedSession,
  type SessionWriter,
  type WorkoutMutationRecord,
} from "@/lib/recovery/apply-proposal"
import type { WorkoutPrescription } from "@/lib/recovery/proposal"
import type { TodaySessionExercise } from "@/lib/training/load-today-session"

function asExercises(
  rows: Array<{
    id: string
    exercise_id: string | null
    exercise_name: string | null
    target_sets: number | null
    rep_min: number | null
    rep_max: number | null
    rest_seconds: number | null
    is_skipped: boolean | null
  }> | null,
): TodaySessionExercise[] {
  return (rows ?? []).map((row) => ({
    sessionExerciseId: row.id,
    exerciseId: row.exercise_id ?? "",
    exerciseName: row.exercise_name ?? "Exercise",
    targetSets: row.target_sets,
    repMin: row.rep_min,
    repMax: row.rep_max,
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
    .select("id, exercise_id, exercise_name, target_sets, rep_min, rep_max, rest_seconds, is_skipped")
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

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    scheduledFor: row.scheduled_for,
    durationMinutes: row.duration_minutes,
    sessionState: row.session_state,
    workoutPlanId: row.workout_plan_id,
    updatedAt: row.updated_at,
    planUpdatedAt: null,
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
        if (after.repMin !== null) updates.rep_min = after.repMin
        if (after.repMax !== null) updates.rep_max = after.repMax
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

const memoryFallback = createMemoryMutationStore()

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
        return memoryFallback.findByProposalId(proposalId)
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
        return memoryFallback.insert(record)
      }
      return "inserted"
    },
  }
}
