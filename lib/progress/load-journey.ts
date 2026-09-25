import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { addDaysIso } from "@/lib/nutrition/date-utils"
import { buildProgressJourney } from "@/lib/progress/aggregator"
import type { ProgressJourney, ProgressNutritionRow, ProgressSessionRow } from "@/lib/progress/types"
import { localDateTimeParts, resolveUserTimeZone } from "@/lib/training/load-today-session"

export type ProgressRecords = {
  timezone: string
  today: string
  sessions: ProgressSessionRow[]
  journey: ProgressJourney
}

export async function loadProgressJourney(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProgressJourney> {
  return (await loadProgressRecords(supabase, userId, now)).journey
}

export async function loadProgressRecords(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProgressRecords> {
  const timezone = await resolveUserTimeZone(supabase, userId)
  const today = localDateTimeParts(now, timezone).localDate
  const fromDate = addDaysIso(today, -83)

  const [planResponse, sessionResponse, checkinResponse, foodResponse, fitnessResponse] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("id, created_at, days_per_week, weeks, name")
      .eq("client_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_sessions")
      .select("id, name, scheduled_for, completed_at, session_state, workout_day_id, total_volume_kg, duration_minutes")
      .eq("user_id", userId)
      .or(`scheduled_for.gte.${fromDate},completed_at.gte.${fromDate}T00:00:00.000Z`)
      .limit(200),
    supabase
      .from("recovery_checkins")
      .select("checkin_date, recovery_score")
      .eq("user_id", userId)
      .gte("checkin_date", fromDate)
      .lte("checkin_date", today)
      .limit(90),
    supabase
      .from("food_logs")
      .select("log_date, protein_g")
      .eq("user_id", userId)
      .gte("log_date", fromDate)
      .lte("log_date", today)
      .limit(400),
    supabase.from("fitness_profiles").select("protein_target_g").eq("user_id", userId).maybeSingle(),
  ])

  const planRow = planResponse.data as {
    id: string
    created_at: string
    days_per_week: number | null
    weeks: number | null
    name: string | null
  } | null

  const sessionRows =
    (sessionResponse.data as Array<{
      id: string
      name?: string | null
      scheduled_for: string | null
      completed_at: string | null
      session_state: string
      workout_day_id: string | null
      total_volume_kg?: number | null
      duration_minutes?: number | null
    }> | null) ?? []

  const dayIds = Array.from(
    new Set(sessionRows.map((row) => row.workout_day_id).filter((id): id is string => Boolean(id))),
  )
  const restByDay = new Map<string, boolean>()
  const focusByDay = new Map<string, string | null>()
  if (dayIds.length > 0) {
    const { data: dayRows } = await supabase.from("workout_days").select("id, rest_day, name, focus").in("id", dayIds)
    for (const row of (dayRows as Array<{
      id: string
      rest_day: boolean | null
      name: string | null
      focus: string | null
    }> | null) ?? []) {
      restByDay.set(row.id, row.rest_day === true)
      focusByDay.set(row.id, row.focus ?? row.name)
    }
  }

  const proteinTarget = (fitnessResponse.data as { protein_target_g: number | null } | null)?.protein_target_g ?? null
  const foodRows =
    (foodResponse.data as Array<{ log_date: string; protein_g: number | null }> | null) ?? []
  const nutritionByDate = new Map<string, { entryCount: number; proteinG: number }>()
  for (const row of foodRows) {
    const current = nutritionByDate.get(row.log_date) ?? { entryCount: 0, proteinG: 0 }
    current.entryCount += 1
    current.proteinG += row.protein_g ?? 0
    nutritionByDate.set(row.log_date, current)
  }
  const nutritionDays: ProgressNutritionRow[] = [...nutritionByDate.entries()].map(([date, totals]) => ({
    date,
    entryCount: totals.entryCount,
    proteinPercent:
      proteinTarget && proteinTarget > 0 ? Math.round((totals.proteinG / proteinTarget) * 100) : null,
  }))

  const sessions: ProgressSessionRow[] = sessionRows.map((row) => ({
    id: row.id,
    scheduledFor: row.scheduled_for,
    completedAt: row.completed_at,
    sessionState: row.session_state,
    restDay: row.workout_day_id ? restByDay.get(row.workout_day_id) === true : false,
    name: row.name ?? null,
    focus: row.workout_day_id ? focusByDay.get(row.workout_day_id) ?? null : null,
    volumeKg: row.total_volume_kg ?? null,
    durationMinutes: row.duration_minutes ?? null,
  }))

  return {
    timezone,
    today,
    sessions,
    journey: buildProgressJourney({
      subjectRef: userId,
      timezone,
      now,
      plan: planRow
        ? {
            id: planRow.id,
            createdAt: planRow.created_at,
            daysPerWeek: planRow.days_per_week ?? 0,
            weeks: planRow.weeks ?? 0,
            name: planRow.name,
          }
        : null,
      sessions,
      checkins:
        ((checkinResponse.data as Array<{ checkin_date: string; recovery_score: number | null }> | null) ?? []).map(
          (row) => ({
            date: row.checkin_date,
            score: row.recovery_score,
          }),
        ),
      nutritionDays,
    }),
  }
}
