import "server-only"

import { createClient } from "@/lib/supabase/server"

type UnknownRecord = Record<string, unknown>

type LooseSupabase = {
  from: (table: string) => {
    select: (
      columns: string,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{
            data: UnknownRecord | null
            error: { message: string } | null
          }>
        }
        maybeSingle: () => Promise<{
          data: UnknownRecord | null
          error: { message: string } | null
        }>
      }
    }
    update: (
      values: UnknownRecord,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{
          error: { message: string } | null
        }>
        then?: unknown
      } & PromiseLike<{
        error: { message: string } | null
      }>
    }
  }
  rpc: (
    fn: string,
    args: UnknownRecord,
  ) => Promise<{
    data: unknown
    error: { message: string } | null
  }>
  auth: {
    getUser: () => Promise<{
      data: {
        user: { id: string } | null
      }
      error: { message: string } | null
    }>
  }
}

export type SessionMutationResult = {
  success: boolean
  message: string
  data?: unknown
}

function isRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }

  return null
}

async function getLooseClient() {
  const supabase = (await createClient()) as unknown as LooseSupabase

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      supabase,
      userId: null as string | null,
      errorMessage: "You must be signed in to update a workout.",
    }
  }

  return {
    supabase,
    userId: user.id,
    errorMessage: null as string | null,
  }
}

async function assertSessionOwned(
  supabase: LooseSupabase,
  sessionId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error("Workout session not found.")
  }
}

export async function mutateSaveSet(
  sessionId: string,
  payload: UnknownRecord,
): Promise<SessionMutationResult> {
  try {
    const { supabase, userId, errorMessage } =
      await getLooseClient()

    if (!userId) {
      return {
        success: false,
        message: errorMessage ?? "Unauthorized",
      }
    }

    await assertSessionOwned(supabase, sessionId, userId)

    const setId =
      asString(payload.setId) ?? asString(payload.set_id)

    if (!setId) {
      return {
        success: false,
        message: "Missing set ID.",
      }
    }

    const weightKg = asNumber(
      payload.weightKg ?? payload.weight_kg,
    )
    const reps = asNumber(payload.reps)
    const rir = asNumber(payload.rir)
    const rpe = asNumber(payload.rpe)
    const completed = asBoolean(payload.completed)
    const notes = asString(payload.notes)

    const { error } = await supabase
      .from("exercise_sets")
      .update({
        weight_kg: weightKg,
        reps: reps === null ? null : Math.round(reps),
        rir,
        rpe,
        completed: completed ?? false,
        completed_at:
          completed === true
            ? new Date().toISOString()
            : null,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", setId)

    if (error) {
      return {
        success: false,
        message: error.message,
      }
    }

    return {
      success: true,
      message: "Set saved.",
      data: { setId, sessionId },
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save set.",
    }
  }
}

export async function mutateSkipExercise(
  sessionId: string,
  payload: UnknownRecord,
): Promise<SessionMutationResult> {
  try {
    const { supabase, userId, errorMessage } =
      await getLooseClient()

    if (!userId) {
      return {
        success: false,
        message: errorMessage ?? "Unauthorized",
      }
    }

    await assertSessionOwned(supabase, sessionId, userId)

    const sessionExerciseId =
      asString(payload.sessionExerciseId) ??
      asString(payload.session_exercise_id) ??
      asString(payload.arg0)

    if (!sessionExerciseId) {
      return {
        success: false,
        message: "Missing session exercise ID.",
      }
    }

    const skipped =
      asBoolean(payload.isSkipped) ??
      asBoolean(payload.is_skipped) ??
      asBoolean(payload.arg1) ??
      true

    const { error } = await supabase
      .from("workout_session_exercises")
      .update({
        is_skipped: skipped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionExerciseId)
      .eq("workout_session_id", sessionId)

    if (error) {
      return {
        success: false,
        message: error.message,
      }
    }

    return {
      success: true,
      message: skipped
        ? "Exercise skipped."
        : "Exercise restored.",
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to skip exercise.",
    }
  }
}

export async function mutateReplaceExercise(
  sessionId: string,
  payload: UnknownRecord,
): Promise<SessionMutationResult> {
  try {
    const { supabase, userId, errorMessage } =
      await getLooseClient()

    if (!userId) {
      return {
        success: false,
        message: errorMessage ?? "Unauthorized",
      }
    }

    await assertSessionOwned(supabase, sessionId, userId)

    const sessionExerciseId =
      asString(payload.sessionExerciseId) ??
      asString(payload.session_exercise_id)

    const replacementExerciseId =
      asString(payload.replacementExerciseId) ??
      asString(payload.replacement_exercise_id) ??
      asString(payload.newExerciseId)

    if (!sessionExerciseId || !replacementExerciseId) {
      return {
        success: false,
        message: "Missing exercise replacement fields.",
      }
    }

    const { data: libraryExercise, error: libraryError } =
      await supabase
        .from("exercise_library")
        .select("id, name")
        .eq("id", replacementExerciseId)
        .maybeSingle()

    if (libraryError || !libraryExercise) {
      return {
        success: false,
        message:
          libraryError?.message ??
          "Replacement exercise not found.",
      }
    }

    const exerciseName = asString(libraryExercise.name) ?? "Exercise"

    const { error } = await supabase
      .from("workout_session_exercises")
      .update({
        exercise_id: replacementExerciseId,
        exercise_name: exerciseName,
        display_name: exerciseName,
        replacement_exercise_id: replacementExerciseId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionExerciseId)
      .eq("workout_session_id", sessionId)

    if (error) {
      return {
        success: false,
        message: error.message,
      }
    }

    return {
      success: true,
      message: `Replaced with ${exerciseName}.`,
      data: {
        sessionExerciseId,
        replacementExerciseId,
      },
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to replace exercise.",
    }
  }
}

export async function mutateFinishWorkout(
  sessionId: string,
  payload: UnknownRecord,
): Promise<SessionMutationResult> {
  try {
    const { supabase, userId, errorMessage } =
      await getLooseClient()

    if (!userId) {
      return {
        success: false,
        message: errorMessage ?? "Unauthorized",
      }
    }

    await assertSessionOwned(supabase, sessionId, userId)

    const notes =
      asString(payload.notes) ??
      asString(payload.sessionNotes)

    const sessionRpe = asNumber(
      payload.sessionRpe ?? payload.session_rpe,
    )

    const { data, error } = await supabase.rpc(
      "finish_workout",
      {
        p_session_id: sessionId,
        p_notes: notes,
        p_session_rpe: sessionRpe,
      },
    )

    if (error) {
      return {
        success: false,
        message: error.message,
      }
    }

    return {
      success: true,
      message: "Workout completed.",
      data,
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to finish workout.",
    }
  }
}

export async function handleSessionAction(
  sessionId: string,
  actionName: string,
  payload: UnknownRecord,
): Promise<SessionMutationResult> {
  const normalized = actionName
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")

  if (
    normalized === "save_set" ||
    normalized === "log_set" ||
    normalized === "update_set"
  ) {
    return mutateSaveSet(sessionId, payload)
  }

  if (
    normalized === "skip_exercise" ||
    normalized === "skip"
  ) {
    return mutateSkipExercise(sessionId, payload)
  }

  if (
    normalized === "replace_exercise" ||
    normalized === "replace"
  ) {
    return mutateReplaceExercise(sessionId, payload)
  }

  if (
    normalized === "finish_workout" ||
    normalized === "complete" ||
    normalized === "finish"
  ) {
    return mutateFinishWorkout(sessionId, payload)
  }

  return {
    success: false,
    message: `Unknown workout action: ${actionName}`,
  }
}

export function parseActionPayload(body: unknown): {
  actionName: string
  payload: UnknownRecord
} {
  if (!isRecord(body)) {
    return {
      actionName: "",
      payload: {},
    }
  }

  const actionName =
    asString(body.action) ??
    asString(body.type) ??
    ""

  return {
    actionName,
    payload: body,
  }
}
