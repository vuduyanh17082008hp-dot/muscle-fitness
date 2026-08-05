import { z } from 'zod'

export const workoutExerciseInputSchema = z
  .object({
    exerciseId: z.string().uuid(),

    sets: z.coerce.number().int().min(1).max(12),

    repMin: z.coerce.number().int().min(1).max(100),
    repMax: z.coerce.number().int().min(1).max(100),

    targetRir: z.coerce.number().min(0).max(10),

    targetRpe: z
      .union([
        z.coerce.number().min(1).max(10),
        z.null(),
      ])
      .optional()
      .default(null),

    restSeconds: z.coerce.number().int().min(15).max(900),

    tempo: z.string().trim().max(30).default(''),
    notes: z.string().trim().max(500).default(''),
  })
  .refine((value) => value.repMax >= value.repMin, {
    message: 'Maximum reps must be equal to or greater than minimum reps.',
    path: ['repMax'],
  })

export const workoutDayInputSchema = z.object({
  name: z.string().trim().min(1).max(120),

  scheduledWeekday: z
    .union([
      z.coerce.number().int().min(0).max(6),
      z.null(),
    ])
    .optional()
    .default(null),

  notes: z.string().trim().max(1000).default(''),

  exercises: z
    .array(workoutExerciseInputSchema)
    .min(1, 'Each workout day needs at least one exercise.')
    .max(30),
})

export const workoutPlanInputSchema = z.object({
  clientId: z.string().uuid().optional(),

  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1500).default(''),
  goal: z.string().trim().max(120).default(''),

  allowClientSubstitution: z.boolean().default(true),

  days: z
    .array(workoutDayInputSchema)
    .min(1, 'Add at least one workout day.')
    .max(14),
})

export const saveWorkoutSetSchema = z.object({
  setId: z.string().uuid(),

  weightKg: z
    .union([
      z.coerce.number().min(0).max(1500),
      z.null(),
    ])
    .optional()
    .default(null),

  reps: z
    .union([
      z.coerce.number().int().min(0).max(200),
      z.null(),
    ])
    .optional()
    .default(null),

  rir: z
    .union([
      z.coerce.number().min(0).max(10),
      z.null(),
    ])
    .optional()
    .default(null),

  rpe: z
    .union([
      z.coerce.number().min(1).max(10),
      z.null(),
    ])
    .optional()
    .default(null),

  completed: z.boolean(),

  notes: z.string().trim().max(500).default(''),
})

export const finishWorkoutSchema = z.object({
  sessionId: z.string().uuid(),

  notes: z.string().trim().max(2000).default(''),

  sessionRpe: z
    .union([
      z.coerce.number().min(1).max(10),
      z.null(),
    ])
    .optional()
    .default(null),
})

export const replaceExerciseSchema = z.object({
  sessionExerciseId: z.string().uuid(),
  replacementExerciseId: z.string().uuid(),
})

export type WorkoutPlanInput = z.infer<typeof workoutPlanInputSchema>
export type SaveWorkoutSetInput = z.infer<typeof saveWorkoutSetSchema>
export type FinishWorkoutInput = z.infer<typeof finishWorkoutSchema>