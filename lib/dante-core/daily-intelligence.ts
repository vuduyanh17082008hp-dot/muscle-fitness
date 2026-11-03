import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { callDanteLlm } from "@/lib/dante-core/llm-client";
import { sessionStateToActionStatus } from "@/lib/daily-plan/types";
import type { AppEventType } from "@/lib/events/types";
import {
  localDateTimeParts,
  localDayRangeUtc,
  resolveUserTimeZone,
} from "@/lib/training/load-today-session";

export type DailyIntelligenceClock = {
  now?: Date;
  timeZoneOverride?: string | null;
};

/**
 * Profile-local calendar day + UTC session range.
 * Delegates to load-today-session helpers — no second date math.
 */
export function resolveDailyIntelligenceDay(
  now: Date,
  timeZone: string,
): { localDate: string; startIso: string; endIso: string } {
  const { localDate } = localDateTimeParts(now, timeZone);
  const { startIso, endIso } = localDayRangeUtc(now, timeZone);
  return { localDate, startIso, endIso };
}

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

function round(value: number): number {
  return Math.round(value);
}

async function resolveTrainingFocus(
  supabase: SupabaseClient,
  userId: string,
  range: { startIso: string; endIso: string },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("name, scheduled_for, completed_at, session_state")
    .eq("user_id", userId)
    .gte("scheduled_for", range.startIso)
    .lte("scheduled_for", range.endIso)
    .order("scheduled_for", { ascending: true })
    .limit(5);

  if (error || !data || data.length === 0) {
    return null;
  }

  // Only a session still to do (planned or in progress) is a training focus: a finished or cancelled
  // one must never come back as "proceed with today's planned … session".
  const open = (data as Array<{ name: string | null; session_state: string | null }>).find((row) => {
    const status = sessionStateToActionStatus(row.session_state);
    return status === "planned" || status === "active";
  });
  return open?.name ?? null;
}

/**
 * Always read live, never from the cached row: food-log edits/deletes don't
 * trigger a recompute, and a failed current read must surface as null, not
 * as the last cached percentage.
 */
async function resolveNutritionAdherence(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const loaded = await Promise.all([
    loadNutritionContext(supabase, userId),
    loadFoodLogForDate(supabase, userId),
  ]).catch(() => null);
  if (!loaded) return null;
  const [nutritionContext, foodLog] = loaded;

  const targetCalories = nutritionContext.targets.calories;

  if (foodLog.unavailable || !targetCalories || targetCalories <= 0) {
    return null;
  }

  return round((foodLog.totals.calories / targetCalories) * 100);
}

const NARRATIVE_INTAKE_CLAIM = /%|calori|kcal|nutrition|intake|protein|carb|eaten|meal/i;
const SESSION_DIRECTIVE = /\b(session|workout|train(ing)?|proceed|lift(ing)?)\b/i;

function deterministicNarrative(
  intel: Omit<DailyIntelligence, "narrative" | "generatedAt" | "nutritionAdherencePercent">,
): string {
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

  // No intake sentence: the narrative is cached for the day and would outlive
  // food-log edits and failed reads. Live nutrition is shown by its own card.
  return parts.join(" ");
}

async function generateNarrative(
  intel: Omit<DailyIntelligence, "narrative" | "generatedAt" | "nutritionAdherencePercent">,
): Promise<string> {
  const fallback = deterministicNarrative(intel);

  const prompt = `You are Dante. Given this data, write ONE short sentence (max 25 words) summarizing today's performance conditions for the user, in the style of "Performance conditions are favorable." Do not invent any number not given here. Do not add a disclaimer. ${
    intel.trainingFocus
      ? `You may mention today's planned "${intel.trainingFocus}" session.`
      : "There is no session left to do today: do not mention or suggest any workout or session."
  }

DATA:
${JSON.stringify(intel, null, 2)}

Reply with ONLY the sentence, nothing else.`;

  try {
    const result = await callDanteLlm(prompt);
    const reply = result?.reply.trim();
    // The prose may not invent a session the data doesn't have.
    if (!reply || (!intel.trainingFocus && SESSION_DIRECTIVE.test(reply))) return fallback;
    return reply;
  } catch {
    return fallback;
  }
}

export async function buildDailyIntelligence(
  supabase: SupabaseClient,
  userId: string,
  clock: DailyIntelligenceClock = {},
): Promise<DailyIntelligence> {
  const now = clock.now ?? new Date();
  const timeZone = await resolveUserTimeZone(supabase, userId, clock.timeZoneOverride);
  const day = resolveDailyIntelligenceDay(now, timeZone);

  const [{ readiness, recoveryContext }, trainingFocus, nutritionAdherencePercent] =
    await Promise.all([
      loadReadinessForUser(supabase, userId),
      resolveTrainingFocus(supabase, userId, day),
      resolveNutritionAdherence(supabase, userId),
    ]);

  const base = {
    summaryDate: day.localDate,
    readinessScore: readiness.readinessScore,
    trainingFocus,
    recoveryStatus: recoveryContext.todayScoreResult.status,
  };

  const narrative = await generateNarrative(base);

  return { ...base, nutritionAdherencePercent, narrative, generatedAt: now.toISOString() };
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
  clock: DailyIntelligenceClock = {},
): Promise<DailyIntelligence> {
  const intelligence = await buildDailyIntelligence(supabase, userId, clock);

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
  clock: DailyIntelligenceClock = {},
): Promise<DailyIntelligence> {
  const now = clock.now ?? new Date();
  const timeZone = await resolveUserTimeZone(supabase, userId, clock.timeZoneOverride);
  const { localDate } = resolveDailyIntelligenceDay(now, timeZone);

  const { data } = await supabase
    .from("dante_daily_intelligence")
    .select(
      "summary_date, readiness_score, training_focus, nutrition_adherence_percent, recovery_status, narrative, generated_at",
    )
    .eq("user_id", userId)
    .eq("summary_date", localDate)
    .maybeSingle();

  if (data) {
    // The cached focus can predate a finished, cancelled or newly added session (e.g. a completion that
    // never emitted WORKOUT_COMPLETED): re-read it live — one small query — and re-phrase when it moved.
    const liveFocus = await resolveTrainingFocus(supabase, userId, resolveDailyIntelligenceDay(now, timeZone));
    const cached = {
      summaryDate: data.summary_date,
      readinessScore: data.readiness_score,
      trainingFocus: liveFocus,
      recoveryStatus: data.recovery_status,
    };
    const stale = liveFocus !== data.training_focus || NARRATIVE_INTAKE_CLAIM.test(data.narrative ?? "");
    return {
      ...cached,
      nutritionAdherencePercent: await resolveNutritionAdherence(supabase, userId),
      // Rows cached before intake left the narrative may still state a (now stale) intake figure.
      narrative: stale ? deterministicNarrative(cached) : data.narrative,
      generatedAt: data.generated_at,
    };
  }

  return recomputeDailyIntelligence(supabase, userId, "initial_load", {
    now,
    timeZoneOverride: timeZone,
  });
}
