import { z } from "zod";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

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
      "goal, training_days, experience, calories_target, protein_target_g",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (fitnessError) {
    return NextResponse.json({ error: "Unable to load fitness profile." }, { status: 500 });
  }

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
      caloriesTarget: fitness?.calories_target ?? null,
      proteinTarget: fitness?.protein_target_g ?? null,
      disclaimer:
        "This endpoint no longer returns fake sample workouts as if they belonged to you.",
    },
  });
}
