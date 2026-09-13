import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { loadTodaySession } from "@/lib/training/load-today-session";
import { buildDailyDecision } from "@/lib/dante-core/daily-decision-engine";
import { loadClientPolicy } from "@/lib/dante-core/policy/load-client-policy";
import { runDanteCycle } from "@/lib/dante-core/orchestrator/index";
import type { GatedAction, OrchestratorResult } from "@/lib/dante-core/orchestrator/types";
import {
  checkCooldown,
  checkConsecutiveAutoAdaptations,
  checkCycleBudget,
  loadActionBudgetState,
} from "@/lib/dante-core/autonomy/budgets";
import { applyDanteAction } from "@/lib/dante-core/actions/apply-action";
import { classifyActionRisk } from "@/lib/dante-core/autonomy/classify";

/**
 * The FRESH-CONTEXT LOOP (mission Part 10.D) for one Dante cycle: load
 * current canonical state -> decide (pure orchestrator) -> act
 * (auto-apply within budget) -> persist (audit log, already inside
 * applyDanteAction) -> terminate. Nothing here holds state between
 * calls — the next call starts over from Supabase, not from this
 * function's return value.
 */

async function loadPreviousSnapshot(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("dante_daily_intelligence")
    .select("readiness_score, training_focus, recovery_status")
    .eq("user_id", userId)
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    readinessScore: data.readiness_score as number | null,
    trainingFocus: data.training_focus as string | null,
    recoveryStatus: data.recovery_status as string | null,
  };
}

async function applyBudgetAndAutoApply(
  supabase: SupabaseClient,
  userId: string,
  gated: GatedAction,
): Promise<GatedAction> {
  if (gated.autonomyDecision !== "auto") {
    return gated;
  }

  const budgetState = await loadActionBudgetState(supabase, userId, gated.action.payload.type);

  const cooldown = checkCooldown(budgetState.lastAppliedAtForActionType);
  const consecutive = checkConsecutiveAutoAdaptations(budgetState.consecutiveAutoCount);

  if (!cooldown.allowed) {
    return { ...gated, autonomyDecision: "confirm", budgetAllowed: false, budgetReason: cooldown.reason ?? null };
  }

  if (!consecutive.allowed) {
    return { ...gated, autonomyDecision: "confirm", budgetAllowed: false, budgetReason: consecutive.reason ?? null };
  }

  const result = await applyDanteAction(supabase, userId, {
    payload: gated.action.payload,
    reason: gated.action.reason,
    confidence: 0.7,
    intent: "auto",
    domain: gated.action.domain,
    riskLevel: classifyActionRisk(gated.action.payload),
    evidence: gated.action.evidence,
    limits: gated.action.limits,
    provenance: gated.action.provenance,
  });

  return {
    ...gated,
    budgetAllowed: result.ok,
    budgetReason: result.ok ? null : ("error" in result ? result.error : null),
  };
}

export async function runDanteCycleForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrchestratorResult> {
  const [athleteState, trainingContext, todaySession, policy, previousSnapshot] = await Promise.all([
    buildAthleteState(supabase, userId),
    loadTrainingContext(supabase, userId),
    loadTodaySession(supabase, userId),
    loadClientPolicy(supabase, userId),
    loadPreviousSnapshot(supabase, userId),
  ]);

  const { decision: dailyDecision, proposedActions } = buildDailyDecision(
    athleteState,
    trainingContext,
    todaySession,
  );

  const result = runDanteCycle({
    athleteState,
    policy,
    dailyDecision,
    proposedActions,
    previousSnapshot,
  });

  const cycleBudget = checkCycleBudget(0);
  if (!cycleBudget.allowed) {
    return {
      ...result,
      gatedActions: result.gatedActions.map((gated) => ({
        ...gated,
        autonomyDecision: gated.autonomyDecision === "auto" ? "confirm" : gated.autonomyDecision,
        budgetAllowed: false,
        budgetReason: cycleBudget.reason ?? null,
      })),
    };
  }

  const gatedActions = await Promise.all(
    result.gatedActions.map((gated) => applyBudgetAndAutoApply(supabase, userId, gated)),
  );

  return { ...result, gatedActions };
}
