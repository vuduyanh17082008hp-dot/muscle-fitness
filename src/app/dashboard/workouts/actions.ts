"use server";

import { revalidatePath } from "next/cache";
import { createClient, requirePermission } from "@/lib/supabase/server";
import {
  createPlan,
  startSession as startLocalSession,
  listPlans,
  listSessions,
} from "@/features/workout/store";

type PlanExerciseInput = {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir?: number;
  targetRpe?: number;
  restSeconds?: number;
  tempo?: string;
  coachNotes?: string;
};

export type CreateClientPlanInput = {
  name: string;
  description?: string;
  clientId?: string;
  days?: Array<{
    name: string;
    exercises: PlanExerciseInput[];
  }>;
};

/**
 * Typed Supabase workout actions.
 * Root cause of the Problems panel errors: Database types only listed
 * profiles/coach_clients/… and omitted workout_* tables + can_manage_workout_client.
 */
export async function createWorkoutPlanForClient(input: CreateClientPlanInput) {
  const name = input.name?.trim();
  if (!name) {
    return { error: "Plan name is required" as const };
  }

  const supabase = await createClient();

  if (!supabase) {
    const plan = await createPlan({
      name,
      description: input.description,
    });
    revalidatePath("/dashboard/workouts");
    revalidatePath("/dashboard/plans");
    return { planId: plan.id };
  }

  const { supabase: db, user } = await requirePermission(
    "can_manage_workout_client",
  );

  const { data: plan, error: planError } = await db
    .from("workout_plans")
    .insert({
      name,
      description: input.description ?? "",
      user_id: user.id,
      coach_id: user.id,
      client_id: input.clientId ?? null,
    })
    .select("id")
    .single();

  if (planError || !plan) {
    return { error: planError?.message ?? "Could not create plan" };
  }

  const days =
    input.days && input.days.length > 0
      ? input.days
      : [{ name: "Day 1", exercises: [] as PlanExerciseInput[] }];

  for (const [dayIndex, day] of days.entries()) {
    const { data: workoutDay, error: dayError } = await db
      .from("workout_days")
      .insert({
        workout_plan_id: plan.id,
        name: day.name,
        day_order: dayIndex,
      })
      .select("id")
      .single();

    if (dayError || !workoutDay) {
      return { error: dayError?.message ?? "Could not create workout day" };
    }

    if (!day.exercises.length) continue;

    const rows = day.exercises.map((ex, exerciseOrder) => ({
      workout_day_id: workoutDay.id,
      exercise_id: ex.exerciseId,
      exercise_order: exerciseOrder,
      sets: ex.sets,
      rep_min: ex.repMin,
      rep_max: ex.repMax,
      target_rir: ex.targetRir ?? null,
      target_rpe: ex.targetRpe ?? null,
      rest_seconds: ex.restSeconds ?? 90,
      tempo: ex.tempo ?? null,
      coach_notes: ex.coachNotes ?? null,
    }));

    const { error: exerciseError } = await db
      .from("workout_exercises")
      .insert(rows);

    if (exerciseError) {
      return { error: exerciseError.message };
    }
  }

  if (input.clientId) {
    const { data: existing } = await db
      .from("coach_clients")
      .select("id")
      .eq("coach_id", user.id)
      .eq("client_id", input.clientId)
      .maybeSingle();

    if (!existing) {
      await db.from("coach_clients").insert({
        coach_id: user.id,
        client_id: input.clientId,
        status: "active",
      });
    }
  }

  revalidatePath("/dashboard/workouts");
  revalidatePath("/dashboard/plans");
  return { planId: plan.id };
}

export async function listWorkoutPlansAction() {
  const supabase = await createClient();
  if (!supabase) {
    return { plans: await listPlans() };
  }

  const { data, error } = await supabase
    .from("workout_plans")
    .select("id, name, description, created_at, updated_at, client_id")
    .order("updated_at", { ascending: false });

  if (error) {
    return { plans: [], error: error.message };
  }

  return { plans: data ?? [] };
}

export async function startWorkoutFromPlanAction(input: {
  planId: string;
  dayId: string;
}) {
  const supabase = await createClient();
  if (!supabase) {
    const session = await startLocalSession(input);
    revalidatePath("/dashboard/workouts");
    return { sessionId: session.id };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const };

  const { data: day, error: dayError } = await supabase
    .from("workout_days")
    .select(
      "id, name, workout_plan_id, workout_exercises(id, exercise_id, exercise_order, sets, rep_min, rep_max, target_rir, target_rpe, rest_seconds, tempo, coach_notes)",
    )
    .eq("id", input.dayId)
    .eq("workout_plan_id", input.planId)
    .single();

  if (dayError || !day) {
    return { error: dayError?.message ?? "Workout day not found" };
  }

  const { data: plan } = await supabase
    .from("workout_plans")
    .select("name")
    .eq("id", input.planId)
    .single();

  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: user.id,
      workout_plan_id: input.planId,
      workout_day_id: input.dayId,
      name: `${plan?.name ?? "Workout"} — ${day.name}`,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { error: sessionError?.message ?? "Could not start session" };
  }

  type DayExercise = {
    exercise_id: string;
    exercise_order: number;
    sets: number;
    rep_min: number;
    rep_max: number;
    target_rir: number | null;
    target_rpe: number | null;
    rest_seconds: number;
    tempo: string | null;
    coach_notes: string | null;
  };

  const exercises = (
    (day.workout_exercises ?? []) as unknown as DayExercise[]
  )
    .slice()
    .sort((a, b) => a.exercise_order - b.exercise_order);

  if (exercises.length) {
    const { error: seError } = await supabase.from("session_exercises").insert(
      exercises.map((ex) => ({
        session_id: session.id,
        exercise_id: ex.exercise_id,
        exercise_order: ex.exercise_order,
        planned_sets: ex.sets,
        rep_min: ex.rep_min,
        rep_max: ex.rep_max,
        target_rir: ex.target_rir,
        target_rpe: ex.target_rpe,
        rest_seconds: ex.rest_seconds,
        tempo: ex.tempo,
        coach_notes: ex.coach_notes,
        skipped: false,
      })),
    );
    if (seError) return { error: seError.message };
  }

  revalidatePath("/dashboard/workouts");
  revalidatePath(`/dashboard/workout/${session.id}`);
  return { sessionId: session.id };
}

export async function getRecentSessionsAction() {
  const supabase = await createClient();
  if (!supabase) {
    return { sessions: await listSessions() };
  }

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, name, status, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return { sessions: [], error: error.message };
  return { sessions: data ?? [] };
}
