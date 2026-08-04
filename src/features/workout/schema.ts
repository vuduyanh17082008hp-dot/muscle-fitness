import { z } from "zod";

export const muscleGroupSchema = z.enum([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "forearms",
  "traps",
]);

export const equipmentSchema = z.enum([
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
]);

export const difficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export const planExerciseSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  order: z.number().int().nonnegative(),
  sets: z.number().int().positive(),
  repMin: z.number().int().positive(),
  repMax: z.number().int().positive(),
  targetRir: z.number().min(0).max(5).optional(),
  targetRpe: z.number().min(1).max(10).optional(),
  restSeconds: z.number().int().nonnegative(),
  tempo: z.string().optional(),
  coachNotes: z.string().optional(),
});

export const workoutDaySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().nonnegative(),
  exercises: z.array(planExerciseSchema),
});

export const workoutPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  days: z.array(workoutDaySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createPlanSchema = z.object({
  name: z.string().trim().min(1, "Tên plan bắt buộc"),
  description: z.string().optional(),
});

export const startSessionSchema = z.object({
  planId: z.string().min(1),
  dayId: z.string().min(1),
});

export const logSetSchema = z.object({
  sessionId: z.string().min(1),
  sessionExerciseId: z.string().min(1),
  setId: z.string().min(1),
  weightKg: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  rir: z.number().min(0).max(5).optional(),
});

export const replaceExerciseSchema = z.object({
  sessionId: z.string().min(1),
  sessionExerciseId: z.string().min(1),
  newExerciseId: z.string().min(1),
});
