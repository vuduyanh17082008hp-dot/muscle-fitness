import { NextResponse } from "next/server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/* =========================================================
   SCHEMA
========================================================= */

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

const preferenceSchema =
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
              .min(1)
              .max(50),

          muscles:
            z.array(
              muscleSchema
            ),
        })
      ),

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
        z.string()
      ),

    targetSessionMinutes:
      z.number()
        .int()
        .min(30)
        .max(180),
  });

const requestSchema =
  z.object({
    preferences:
      preferenceSchema,

    generatedProgram:
      z.unknown()
        .nullable()
        .optional(),
  });

/* =========================================================
   GET
========================================================= */

export async function GET() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "training_preferences"
      )
      .select("*")
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    data,
  });
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: Request
) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON.",
      },
      {
        status: 400,
      }
    );
  }

  const parsed =
    requestSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid training configuration.",

        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      }
    );
  }

  const {
    preferences,
    generatedProgram,
  } =
    parsed.data;

  const {
    error,
  } =
    await supabase
      .from(
        "training_preferences"
      )
      .upsert(
        {
          user_id:
            user.id,

          split_type:
            preferences.splitType,

          training_days:
            preferences.trainingDays,

          custom_split:
            preferences.customSplit,

          priority_muscles:
            preferences.priorityMuscles,

          intensity_style:
            preferences.intensityStyle,

          volume_style:
            preferences.volumeStyle,

          failure_style:
            preferences.failureStyle,

          exercise_style:
            preferences.exerciseStyle,

          excluded_exercises:
            preferences.excludedExercises,

          target_session_minutes:
            preferences.targetSessionMinutes,

          generated_program:
            generatedProgram ??
            null,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "user_id",
        }
      );

  if (error) {
    console.error(
      "[TRAINING PREFERENCES]",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    success: true,
  });
}