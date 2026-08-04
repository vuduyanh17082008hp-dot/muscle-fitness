"use server";

import { revalidatePath } from "next/cache";
import {
  createPlanSchema,
  logSetSchema,
  replaceExerciseSchema,
  startSessionSchema,
  workoutPlanSchema,
} from "./schema";
import {
  completeSession,
  createPlan,
  deletePlan,
  listExercises,
  listPlans,
  listSessions,
  logSet,
  replaceExercise,
  savePlan,
  skipExercise,
  startSession,
} from "./store";
import { buildNextSessionRecommendation } from "./calculations";

export async function createPlanAction(input: {
  name: string;
  description?: string;
}) {
  const parsed = createPlanSchema.parse(input);
  const plan = await createPlan(parsed);
  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/workouts");
  return { plan };
}

export async function savePlanAction(input: unknown) {
  const plan = workoutPlanSchema.parse(input);
  const saved = await savePlan(plan);
  revalidatePath(`/dashboard/plans/${saved.id}`);
  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/workouts");
  return { plan: saved };
}

export async function deletePlanAction(planId: string) {
  await deletePlan(planId);
  revalidatePath("/dashboard/plans");
  return { ok: true };
}

export async function startWorkoutAction(input: {
  planId: string;
  dayId: string;
}) {
  const parsed = startSessionSchema.parse(input);
  const session = await startSession(parsed);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/workouts");
  revalidatePath("/dashboard/history");
  return { session };
}

export async function logSetAction(input: {
  sessionId: string;
  sessionExerciseId: string;
  setId: string;
  weightKg: number;
  reps: number;
  rir?: number;
}) {
  const parsed = logSetSchema.parse(input);
  const session = await logSet(parsed);
  revalidatePath(`/dashboard/workout/${session.id}`);
  return { session };
}

export async function skipExerciseAction(input: {
  sessionId: string;
  sessionExerciseId: string;
}) {
  const session = await skipExercise(input);
  revalidatePath(`/dashboard/workout/${session.id}`);
  return { session };
}

export async function replaceExerciseAction(input: {
  sessionId: string;
  sessionExerciseId: string;
  newExerciseId: string;
}) {
  const parsed = replaceExerciseSchema.parse(input);
  const session = await replaceExercise(parsed);
  revalidatePath(`/dashboard/workout/${session.id}`);
  return { session };
}

export async function completeWorkoutAction(sessionId: string) {
  const session = await completeSession(sessionId);
  const [sessions, exercises] = await Promise.all([
    listSessions(),
    listExercises(),
  ]);
  const recommendation = buildNextSessionRecommendation(
    session,
    sessions,
    exercises,
  );
  revalidatePath(`/dashboard/workout/${session.id}`);
  revalidatePath("/dashboard/history");
  revalidatePath("/dashboard/progress");
  revalidatePath("/dashboard");
  return { session, recommendation };
}

export async function listPlansAction() {
  return { plans: await listPlans() };
}
