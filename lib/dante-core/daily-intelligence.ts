import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { callGroqWithFallback } from "@/lib/dante-core/llm-client";
import type { AppEventType } from "@/lib/events/types";

/**
 * Dante Daily Intelligence (spec Part B §15).
 *
 * A single, cached, per-day summary object — deterministically
 * computed from real data FIRST, with a short narrative sentence
 * (optionally LLM-phrased, always falls back to a deterministic
 * template) appended last. Recomputed by lib/events/emit.ts when a
 * meaningful event fires, not on every dashboard render.
 */

export type DailyIntelligence = {
  summaryDate: string;
  readinessScore: number | null;
  trainingFocus: string | null;
  nutritionAdherencePercent: number | null;
  recoveryStatus: string | null;
  narrative: string;
  generatedAt: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value);
}

async function resolveTrainingFocus(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const startOfDay = `${todayIso()}T00:00:00.000Z`;
  const endOfDay = `${todayIso()}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("name, scheduled_for, completed_at")
    .eq("user_id", userId)
    .gte("scheduled_for", startOfDay)
    .lte("scheduled_for", endOfDay)
    .order("scheduled_for", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return (data[0] as { name: string | null }).name;
}

async function resolveNutritionAdherence(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const [nutritionContext, foodLog] = await Promise.all([
    loadNutritionContext(supabase, userId),
    loadFoodLogForDate(supabase, userId),
  ]);

  const targetCalories = nutritionContext.plan?.target.calories ?? null;

  if (!targetCalories || targetCalories <= 0) {
    return null;
  }

  return round((foodLog.totals.calories / targetCalories) * 100);
}

function deterministicNarrative(intel: Omit<DailyIntelligence, "narrative" | "generatedAt">): string {
  const parts: string[] = [];

  if (intel.readinessScore !== null) {
    if (intel.readinessScore >= 70) {
      parts.push("Performance conditions are favorable.");
    } else if (intel.readinessScore >= 50) {
      parts.push("Performance conditions are moderate today.");
    } else {
      parts.push("Recovery signals suggest going easier today.");
    }
  } else {
    parts.push("No recovery check-in yet today, so readiness is unknown.");
  }

  if (intel.trainingFocus) {
    parts.push(
      intel.readinessScore !== null && intel.readinessScore < 50
        ? `Consider modifying today's planned ${intel.trainingFocus} session.`
        : `Proceed with today's planned ${intel.trainingFocus} session.`,
    );
  }

  if (intel.nutritionAdherencePercent !== null) {
    parts.push(`Nutrition is at ${intel.nutritionAdherencePercent}% of today's calorie target so far.`);
  }

  return parts.join(" ");
}

async function generateNarrative(
  intel: Omit<DailyIntelligence, "narrative" | "generatedAt">,
): Promise<string> {
  const fallback = deterministicNarrative(intel);

  const prompt = `You are Dante. Given this data, write ONE short sentence (max 25 words) summarizing today's performance conditions for the user, in the style of "Performance conditions are favorable. Proceed with the planned session." Do not invent any number not given here. Do not add a disclaimer.

DATA:
${JSON.stringify(intel, null, 2)}

Reply with ONLY the sentence, nothing else.`;

  try {
    const result = await callGroqWithFallback(prompt);
    return result?.reply.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function buildDailyIntelligence(
  supabase: SupabaseClient,
  userId: string,
): Promise<DailyIntelligence> {
  const [{ readiness, recoveryContext }, trainingFocus, nutritionAdherencePercent] =
    await Promise.all([
      loadReadinessForUser(supabase, userId),
      resolveTrainingFocus(supabase, userId),
      resolveNutritionAdherence(supabase, userId),
    ]);

  const base = {
    summaryDate: todayIso(),
    readinessScore: readiness.readinessScore,
    trainingFocus,
    nutritionAdherencePercent,
    recoveryStatus: recoveryContext.todayScoreResult.status,
  };

  const narrative = await generateNarrative(base);

  return { ...base, narrative, generatedAt: new Date().toISOString() };
}

/**
 * Called by lib/events/emit.ts after a meaningful event. Computes a
 * fresh DailyIntelligence and upserts it into
 * dante_daily_intelligence (one row per user per day) — this is the
 * "cache" the rest of the app reads from, so a dashboard render never
 * has to redo the readiness/nutrition/training-focus aggregation.
 */
export async function recomputeDailyIntelligence(
  supabase: SupabaseClient,
  userId: string,
  triggeredBy: AppEventType | "initial_load",
): Promise<DailyIntelligence> {
  const intelligence = await buildDailyIntelligence(supabase, userId);

  const { error } = await supabase.from("dante_daily_intelligence").upsert(
    {
      user_id: userId,
      summary_date: intelligence.summaryDate,
      readiness_score: intelligence.readinessScore,
      training_focus: intelligence.trainingFocus,
      nutrition_adherence_percent: intelligence.nutritionAdherencePercent,
      recovery_status: intelligence.recoveryStatus,
      narrative: intelligence.narrative,
      generated_at: intelligence.generatedAt,
      triggered_by_event_type: triggeredBy,
    },
    { onConflict: "user_id,summary_date" },
  );

  if (error) {
    console.error("[DAILY INTELLIGENCE] failed to cache", error);
  }

  return intelligence;
}

/**
 * Reads today's cached snapshot if one exists (fast path — no
 * recomputation); falls back to computing fresh (and caching it) if
 * none exists yet today, e.g. the very first request of the day
 * before any event has fired.
 */
export async function getOrBuildDailyIntelligence(
  supabase: SupabaseClient,
  userId: string,
): Promise<DailyIntelligence> {
  const { data } = await supabase
    .from("dante_daily_intelligence")
    .select(
      "summary_date, readiness_score, training_focus, nutrition_adherence_percent, recovery_status, narrative, generated_at",
    )
    .eq("user_id", userId)
    .eq("summary_date", todayIso())
    .maybeSingle();

  if (data) {
    return {
      summaryDate: data.summary_date,
      readinessScore: data.readiness_score,
      trainingFocus: data.training_focus,
      nutritionAdherencePercent: data.nutrition_adherence_percent,
      recoveryStatus: data.recovery_status,
      narrative: data.narrative,
      generatedAt: data.generated_at,
    };
  }

  return recomputeDailyIntelligence(supabase, userId, "initial_load");
}
