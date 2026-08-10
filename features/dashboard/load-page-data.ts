import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/features/dashboard/queries";
import type { DashboardData } from "@/features/dashboard/types";

function emptyTodayMetrics() {
  return {
    caloriesConsumed: 0,
    proteinConsumedG: 0,
    waterMl: 0,
    steps: 0,
    sleepHours: null as number | null,
    energyLevel: null as number | null,
    sorenessLevel: null as number | null,
    stressLevel: null as number | null,
    workoutCompleted: false,
    recoveryScore: null as number | null,
    adherenceScore: null as number | null,
  };
}

export async function loadDashboardPageData(): Promise<{
  data: DashboardData;
  source: "rpc" | "fallback";
}> {
  try {
    const data = await getDashboardData();
    return { data, source: "rpc" };
  } catch (error) {
    console.error("Dashboard RPC unavailable, using profile fallback:", error);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unable to load dashboard data.");
  }

  const [profileResult, fitnessResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, timezone, onboarding_completed",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("fitness_profiles")
      .select(
        `
          goal,
          weight_kg,
          calories_target,
          protein_target_g,
          carbs_target_g,
          fat_target_g
        `,
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  const fitness = fitnessResult.data;

  const data: DashboardData = {
    dashboardDate: new Date().toISOString().slice(0, 10),
    profile: {
      fullName: profile?.full_name ?? null,
      timezone: profile?.timezone || "Asia/Singapore",
      onboardingCompleted: Boolean(profile?.onboarding_completed),
    },
    fitness: {
      goal: fitness?.goal ?? null,
      currentWeightKg: fitness?.weight_kg ?? null,
      targetWeightKg: null,
      calorieTarget: fitness?.calories_target ?? null,
      proteinTargetG: fitness?.protein_target_g ?? null,
      carbTargetG: fitness?.carbs_target_g ?? null,
      fatTargetG: fitness?.fat_target_g ?? null,
      waterTargetMl: null,
      stepTarget: null,
    },
    todayMetrics: emptyTodayMetrics(),
    todayWorkouts: [],
    weightTrend: [],
    weeklyAdherence: null,
    coachMessage: null,
    userEmail: user.email ?? null,
  };

  return { data, source: "fallback" };
}
