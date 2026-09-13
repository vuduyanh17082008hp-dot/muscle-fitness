import "server-only";

import { z } from "zod";

import { loadTodaySession } from "@/lib/training/load-today-session";
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { buildTodayPlan } from "@/lib/daily-plan/build-today-plan";
import type { DanteTool } from "@/lib/dante-core/tools/types";

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
    const { supabase, userId, now } = context;

    const [todaySession, recoveryContext, nutritionContext, todayFoodLog] = await Promise.all([
      loadTodaySession(supabase, userId, now).catch(() => null),
      loadRecoveryContext(supabase, userId).catch(() => null),
      loadNutritionContext(supabase, userId),
      loadFoodLogForDate(supabase, userId),
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
