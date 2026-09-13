import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ACTION_BUDGET_CONFIG } from "@/lib/dante-core/autonomy/config";

/**
 * Action Budgets (mission Part 13): "Dante becoming smarter should
 * result in LESS noise." Every check here is a pure function over
 * already-loaded counts/timestamps — the only I/O is the one loader
 * at the bottom, which reads the existing dante_action_log table
 * (no new table needed for budget state).
 */

export type BudgetCheckResult = { allowed: boolean; reason?: string };

export function checkCycleBudget(actionsAlreadyThisCycle: number): BudgetCheckResult {
  if (actionsAlreadyThisCycle >= ACTION_BUDGET_CONFIG.maxActionsPerCycle) {
    return { allowed: false, reason: "Reached the maximum number of actions for this cycle." };
  }
  return { allowed: true };
}

export function checkCooldown(lastAppliedAt: string | null, now: Date = new Date()): BudgetCheckResult {
  if (!lastAppliedAt) return { allowed: true };

  const hoursSince = (now.getTime() - new Date(lastAppliedAt).getTime()) / (1000 * 60 * 60);

  if (hoursSince < ACTION_BUDGET_CONFIG.cooldownHours) {
    return {
      allowed: false,
      reason: `This exact adjustment was already applied ${Math.round(hoursSince)}h ago — cooling down before repeating it.`,
    };
  }

  return { allowed: true };
}

export function checkConsecutiveAutoAdaptations(consecutiveAutoCount: number): BudgetCheckResult {
  if (consecutiveAutoCount >= ACTION_BUDGET_CONFIG.maxConsecutiveAutoAdaptations) {
    return {
      allowed: false,
      reason: "Several adjustments were auto-applied in a row — asking for confirmation this time.",
    };
  }
  return { allowed: true };
}

export function checkNotificationBudget(notificationsSentToday: number): BudgetCheckResult {
  if (notificationsSentToday >= ACTION_BUDGET_CONFIG.notificationBudgetPerDay) {
    return { allowed: false, reason: "Reached today's proactive notification budget." };
  }
  return { allowed: true };
}

export type ActionBudgetState = {
  lastAppliedAtForActionType: string | null;
  consecutiveAutoCount: number;
};

/**
 * Reads just enough of the last 48h of dante_action_log to evaluate
 * cooldown + consecutive-auto-adaptation budgets for one action type
 * — always scoped to `userId` (RLS enforces this independently too).
 */
export async function loadActionBudgetState(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  now: Date = new Date(),
): Promise<ActionBudgetState> {
  const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("dante_action_log")
    .select("action_type, auto_applied, created_at")
    .eq("user_id", userId)
    .eq("status", "applied")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[DANTE AUTONOMY] Unable to load action budget state:", error.message);
    return { lastAppliedAtForActionType: null, consecutiveAutoCount: 0 };
  }

  const rows = (data as Array<{ action_type: string; auto_applied: boolean | null; created_at: string }> | null) ?? [];

  const lastAppliedAtForActionType = rows.find((row) => row.action_type === actionType)?.created_at ?? null;

  let consecutiveAutoCount = 0;
  for (const row of rows) {
    if (row.auto_applied) {
      consecutiveAutoCount += 1;
    } else {
      break;
    }
  }

  return { lastAppliedAtForActionType, consecutiveAutoCount };
}
