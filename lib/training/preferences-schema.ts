import { z } from "zod";

const muscleSchema =
  z.enum([
    "Chest",
    "Upper Chest",
    "Back Width",
    "Back Thickness",
    "Side Delts",
    "Rear Delts",
    "Quads",
    "Hamstrings",
    "Glutes",
    "Biceps",
    "Triceps",
    "Calves",
    "Abs",
  ]);

export const preferenceSchema =
  z.object({
    splitType:
      z.enum([
        "auto",
        "full_body",
        "upper_lower",
        "push_pull_legs",
        "ppl_upper_lower",
        "arnold",
        "torso_limbs",
        "body_part",
        "custom",
      ]),

    trainingDays:
      z.number()
        .int()
        .min(2)
        .max(7),

    customSplit:
      z.array(
        z.object({
          name:
            z.string()
              .trim()
              .min(1)
              .max(50),

          muscles:
            z.array(
              muscleSchema
            ).min(1).max(13),
        })
      ).max(7),

    priorityMuscles:
      z.array(
        muscleSchema
      ).max(3),

    intensityStyle:
      z.enum([
        "conservative",
        "moderate",
        "hard",
        "very_hard",
      ]),

    volumeStyle:
      z.enum([
        "low",
        "moderate",
        "high",
      ]),

    failureStyle:
      z.enum([
        "rare",
        "isolation_only",
        "selected_last_sets",
      ]),

    exerciseStyle:
      z.enum([
        "mixed",
        "machine",
        "free_weights",
      ]),

    excludedExercises:
      z.array(
        z.string().trim().min(1).max(200)
      ).max(200),

    targetSessionMinutes:
      z.number()
        .int()
        .min(30)
        .max(180),
  }).superRefine((preferences, ctx) => {
    if (preferences.splitType === "custom" && preferences.customSplit.length !== preferences.trainingDays) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customSplit"], message: "Provide one custom day per training day." });
    }
    for (const [index, day] of preferences.customSplit.entries()) {
      if (new Set(day.muscles).size !== day.muscles.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customSplit", index, "muscles"], message: "Muscles must be unique within a day." });
      }
    }
  });


const text = z.string().max(2000);
const sourceUrl = z.string().url().refine((url) => /^https?:\/\//i.test(url)).nullable();

export const generatedProgramSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  splitType: z.enum(["auto", "full_body", "upper_lower", "push_pull_legs", "ppl_upper_lower", "arnold", "torso_limbs", "body_part", "custom"]),
  goal: text,
  intensityStyle: z.enum(["conservative", "moderate", "hard", "very_hard"]),
  volumeStyle: z.enum(["low", "moderate", "high"]),
  failureStyle: z.enum(["rare", "isolation_only", "selected_last_sets"]),
  priorityMuscles: z.array(muscleSchema).max(3),
  trainingDays: z.number().int().min(2).max(7),
  sessionMinutes: z.number().int().min(30).max(180),
  days: z.array(z.object({
    day: z.number().int().min(1).max(7),
    title: text,
    focus: z.array(muscleSchema).max(13),
    exercises: z.array(z.object({
      id: z.string().min(1).max(200),
      name: text,
      targetMuscle: muscleSchema,
      muscles: z.array(text).max(30),
      secondaryMuscles: z.array(text).max(30),
      equipment: z.array(text).max(30),
      sets: z.number().int().min(1).max(20),
      reps: text,
      rir: text,
      rest: text,
      failureInstruction: text,
      exerciseReason: text,
      source: text,
      sourceUrl,
      license: text.nullable(),
    })).max(30),
  })).min(2).max(7),
  externalSourceUsed: z.boolean(),
  externalExerciseCount: z.number().int().min(0).max(210),
}).superRefine((program, ctx) => {
  if (program.days.length !== program.trainingDays || program.days.some((day, index) => day.day !== index + 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Program days must match its schedule." });
  }
});
