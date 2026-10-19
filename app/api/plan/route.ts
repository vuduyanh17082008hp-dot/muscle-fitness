import { z } from "zod";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load workout plans." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    plans: data ?? [],
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = z.object({ goal: z.string().trim().min(1).max(200).optional() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan request." }, { status: 400 });
  }

  const { data: fitness, error: fitnessError } = await supabase
    .from("fitness_profiles")
    .select(
      "goal, training_days, experience",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (fitnessError) {
    return NextResponse.json({ error: "Unable to load fitness profile." }, { status: 500 });
  }

  // Canonical targets (lib/nutrition/targets.ts) — same as every other surface.
  const targets = (await loadNutritionContext(supabase, user.id).catch(() => null))?.targets ?? null;

  const goal =
    parsed.data.goal ||
    fitness?.goal ||
    "general fitness";

  return NextResponse.json({
    plan: {
      goal,
      summary:
        "Personalised planning should be created through /dashboard/workouts using your real profile data.",
      trainingDays: fitness?.training_days ?? null,
      experience: fitness?.experience ?? null,
      caloriesTarget: targets?.calories ?? null,
      proteinTarget: targets?.protein ?? null,
      disclaimer:
        "This endpoint no longer returns fake sample workouts as if they belonged to you.",
    },
  });
}
