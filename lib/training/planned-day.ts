import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Hackathon repair F-05: a training day of the active plan has no session row until the user starts it, so "no row today"
 * is not "rest day". This resolves what the plan says about today, for a 1-tap Start (start_workout begins or creates it):
 *   SCHEDULED = a plan day is assigned to today's weekday;
 *   FLEXIBLE  = the plan has unscheduled days: the next one in rotation (after the last completed plan day);
 *   REST      = the plan assigns weekdays and none is today;
 *   null      = no active plan, or the read failed (the caller keeps its existing empty state).
 */
export type PlannedDay = { kind: "SCHEDULED" | "FLEXIBLE"; dayId: string; name: string; exerciseCount: number } | { kind: "REST" }

type DayRow = { id: string; name: string | null; day_order: number; scheduled_weekday: number | null; rest_day: boolean | null; workout_exercises: Array<{ id: string }> | null }

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function resolvePlannedDay(days: DayRow[], weekday: number, lastCompletedDayId: string | null): PlannedDay | null {
  const training = days.filter((day) => day.rest_day !== true && (day.workout_exercises?.length ?? 0) > 0).sort((a, b) => a.day_order - b.day_order)
  if (training.length === 0) return null
  const pick = (day: DayRow, kind: "SCHEDULED" | "FLEXIBLE"): PlannedDay => ({ kind, dayId: day.id, name: day.name ?? "Workout", exerciseCount: day.workout_exercises?.length ?? 0 })
  const today = training.find((day) => day.scheduled_weekday === weekday)
  if (today) return pick(today, "SCHEDULED")
  const flexible = training.filter((day) => day.scheduled_weekday === null)
  if (flexible.length === 0) return { kind: "REST" }
  const last = flexible.findIndex((day) => day.id === lastCompletedDayId)
  return pick(flexible[(last + 1) % flexible.length]!, "FLEXIBLE")
}

export async function loadPlannedDay(supabase: SupabaseClient, userId: string, now: Date, timeZone: string): Promise<PlannedDay | null> {
  const { data: plan, error } = await supabase.from("workout_plans").select("id").eq("client_id", userId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle()
  if (error || !plan) return null
  const [{ data: days, error: daysError }, { data: last }] = await Promise.all([
    supabase.from("workout_days").select("id, name, day_order, scheduled_weekday, rest_day, workout_exercises(id)").eq("workout_plan_id", plan.id),
    supabase.from("workout_sessions").select("workout_day_id").eq("user_id", userId).eq("workout_plan_id", plan.id).eq("session_state", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (daysError || !days) return null
  const weekday = WEEKDAY[new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now)] ?? now.getUTCDay()
  return resolvePlannedDay(days as DayRow[], weekday, (last as { workout_day_id?: string | null } | null)?.workout_day_id ?? null)
}
