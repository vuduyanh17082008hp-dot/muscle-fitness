import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { addDaysIso } from "@/lib/nutrition/date-utils"
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadProgressRecords } from "@/lib/progress/load-journey"
import { buildMuscleFocus } from "@/lib/progress/muscle-focus"
import {
  bodyMassIndex,
  buildProgressPageModel,
  type ProgressNutritionModel,
  type ProgressPageModel,
} from "@/lib/progress/page-model"
import { buildPersonalRecords, estimateSet1Rm, type PersonalRecordPoint } from "@/lib/progress/personal-records"
import { localDateOfSession } from "@/lib/progress/streak"

export async function loadProgressPageModel(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProgressPageModel> {
  const records = await loadProgressRecords(supabase, userId, now)
  const [nutrition, body, muscle, personalRecords] = await Promise.all([
    loadNutritionModel(supabase, userId, records.today),
    loadBodyModel(supabase, userId),
    loadMuscleFocus(supabase, records.sessions, records.timezone, records.today),
    loadPersonalRecords(supabase, records.sessions),
  ])

  return buildProgressPageModel({
    journey: records.journey,
    sessions: records.sessions,
    timezone: records.timezone,
    localDate: records.today,
    muscle,
    nutrition,
    body,
    personalRecords,
  })
}

async function loadNutritionModel(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<ProgressNutritionModel> {
  try {
    const [foodLog, fitness] = await Promise.all([
      loadFoodLogForDate(supabase, userId, today),
      supabase
        .from("fitness_profiles")
        .select("calories_target, protein_target_g, carbs_target_g, fat_target_g")
        .eq("user_id", userId)
        .maybeSingle(),
    ])
    const targets = fitness.data as {
      calories_target: number | null
      protein_target_g: number | null
      carbs_target_g: number | null
      fat_target_g: number | null
    } | null
    const totals = foodLog.totals
    const hasLog = foodLog.entries.length > 0
    return {
      available: hasLog,
      unavailable: foodLog.unavailable === true,
      rings: [
        { label: "Calories", consumed: totals.calories, target: targets?.calories_target ?? null, unit: "kcal" },
        { label: "Protein", consumed: totals.protein, target: targets?.protein_target_g ?? null, unit: "g" },
        { label: "Carbs", consumed: totals.carbs, target: targets?.carbs_target_g ?? null, unit: "g" },
        { label: "Fat", consumed: totals.fat, target: targets?.fat_target_g ?? null, unit: "g" },
      ],
    }
  } catch {
    return { available: false, unavailable: true, rings: [] }
  }
}

async function loadBodyModel(supabase: SupabaseClient, userId: string) {
  try {
    const { data } = await supabase
      .from("fitness_profiles")
      .select("weight_kg, height_cm, goal")
      .eq("user_id", userId)
      .maybeSingle()
    const row = data as { weight_kg: number | null; height_cm: number | null; goal: string | null } | null
    return {
      weightKg: row?.weight_kg ?? null,
      heightCm: row?.height_cm ?? null,
      bmi: bodyMassIndex(row?.weight_kg ?? null, row?.height_cm ?? null),
      goal: row?.goal ?? null,
    }
  } catch {
    return { weightKg: null, heightCm: null, bmi: null, goal: null }
  }
}

async function loadMuscleFocus(
  supabase: SupabaseClient,
  sessions: { id: string; sessionState: string; restDay: boolean; scheduledFor: string | null; completedAt: string | null }[],
  timezone: string,
  today: string,
) {
  try {
    const from = addDaysIso(today, -29)
    const weekIds = sessions
      .filter((session) => {
        const date = localDateOfSession(session, timezone)
        return (
          date !== null &&
          date >= from &&
          date <= today &&
          session.sessionState === "completed" &&
          !session.restDay
        )
      })
      .map((session) => session.id)
    if (weekIds.length === 0) return null

    const { data: exerciseRows, error } = await supabase
      .from("workout_session_exercises")
      .select("exercise_id")
      .in("workout_session_id", weekIds)
    if (error) return null

    const exerciseIds = Array.from(
      new Set(
        ((exerciseRows as Array<{ exercise_id: string | null }> | null) ?? [])
          .map((row) => row.exercise_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    if (exerciseIds.length === 0) return null

    const { data: libraryRows, error: libraryError } = await supabase
      .from("exercise_library")
      .select("primary_muscle")
      .in("id", exerciseIds)
    if (libraryError) return null

    const muscles = ((libraryRows as Array<{ primary_muscle: string | null }> | null) ?? [])
      .map((row) => row.primary_muscle)
      .filter((value): value is string => Boolean(value))
    return buildMuscleFocus(muscles)
  } catch {
    return null
  }
}

async function loadPersonalRecords(
  supabase: SupabaseClient,
  sessions: { id: string; sessionState: string }[],
) {
  try {
    const completedIds = sessions.filter((session) => session.sessionState === "completed").map((session) => session.id)
    if (completedIds.length === 0) return []

    const { data: exerciseRows, error } = await supabase
      .from("workout_session_exercises")
      .select("id, exercise_id, exercise_name")
      .in("workout_session_id", completedIds)
    if (error) return []

    const sessionExercises =
      (exerciseRows as Array<{ id: string; exercise_id: string | null; exercise_name: string | null }> | null) ?? []
    if (sessionExercises.length === 0) return []

    const { data: setRows, error: setError } = await supabase
      .from("exercise_sets")
      .select("session_exercise_id, weight_kg, reps, completed, completed_at, estimated_1rm_kg")
      .in(
        "session_exercise_id",
        sessionExercises.map((row) => row.id),
      )
      .eq("completed", true)
    if (setError) return []

    const nameById = new Map(sessionExercises.map((row) => [row.id, row]))
    const points: PersonalRecordPoint[] = []
    for (const row of (setRows as Array<{
      session_exercise_id: string
      weight_kg: number | null
      reps: number | null
      completed_at: string | null
      estimated_1rm_kg?: number | null
    }> | null) ?? []) {
      const parent = nameById.get(row.session_exercise_id)
      const e1rm = estimateSet1Rm(row.weight_kg, row.reps, row.estimated_1rm_kg)
      if (!parent?.exercise_id || !e1rm || !row.completed_at) continue
      points.push({
        exerciseId: parent.exercise_id,
        exerciseName: parent.exercise_name ?? "Exercise",
        date: row.completed_at.slice(0, 10),
        estimated1RmKg: e1rm,
      })
    }
    return buildPersonalRecords(points)
  } catch {
    return []
  }
}
