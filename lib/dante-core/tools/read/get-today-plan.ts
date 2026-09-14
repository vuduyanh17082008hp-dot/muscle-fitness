import "server-only";

import { z } from "zod";

import { loadTodaySession, localDateTimeParts } from "@/lib/training/load-today-session";
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { buildTodayPlan } from "@/lib/daily-plan/build-today-plan";
import type { DanteTool } from "@/lib/dante-core/tools/types";
import { cached } from "@/lib/dante-core/tools/request-cache";

const inputSchema = z.object({}).strict();

export type TodayPlanToolOutput = {
  items: Array<{ title: string; status: string; subtitle: string | null }>;
};

/**
 * get_today_plan — wraps the SAME canonical daily-action derivation
 * the Dashboard renders (lib/daily-plan/build-today-plan.ts), never a
 * second/independently-derived schedule. Answers "what should I do
 * today?" (Part 3, Part 5: no Knowledge Brain needed for this).
 */
export const getTodayPlanTool: DanteTool<Record<string, never>, TodayPlanToolOutput> = {
  name: "get_today_plan",
  description: "Get the user's real Today's Plan (scheduled workout, nutrition target, daily check-in) — the same list shown on their Dashboard.",
  inputSchema,
  mode: "read",
  risk: "low",
  requiresConfirmation: false,

  async execute(context) {
    const { supabase, userId, now, timezone } = context;

    // Same user-local calendar day everywhere in this turn (spec: reuse
    // the one local-day convention, never a second UTC-slice version).
    const { localDate } = localDateTimeParts(now, timezone || "UTC");

    const [todaySession, recoveryContext, nutritionContext, todayFoodLog] = await Promise.all([
      cached(context, "todaySession", () => loadTodaySession(supabase, userId, now, timezone)).catch(() => null),
      cached(context, "recoveryContext", () => loadRecoveryContext(supabase, userId)).catch(() => null),
      cached(context, "nutritionContext", () => loadNutritionContext(supabase, userId)),
      cached(context, "foodLog", () => loadFoodLogForDate(supabase, userId, localDate)),
    ]);

    const items = buildTodayPlan({
      todaySession,
      hasCheckinToday: recoveryContext ? recoveryContext.today !== null : false,
      proteinTargetG: nutritionContext.plan?.target.protein ?? null,
      proteinLoggedG: todayFoodLog.totals.protein,
    }).map((action) => ({ title: action.title, status: action.status, subtitle: action.subtitle }));

    return { ok: true, data: { items } };
  },
};
