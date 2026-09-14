import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runDanteCycleForUser } from "@/lib/dante-core/orchestrator/run-cycle-for-user";
import type { ProactiveCycleTrigger } from "@/lib/dante-core/proactive/types";

/**
 * The FRESH-CONTEXT LOOP (mission Part 10.D), run for many users at
 * once instead of one authenticated session (mission Part 12). This is
 * the ONLY place in the codebase that calls `runDanteCycleForUser` with
 * a service-role client instead of a request-scoped one — it must stay
 * that way; every safety rail below is the reason it's still safe to do
 * so:
 *
 *  - Per-user autonomy level (GUIDE/ASSIST/AUTOPILOT), action budgets
 *    (cooldown, max actions/cycle, max consecutive auto-adaptations),
 *    and the decision sandbox all run unchanged inside
 *    `runDanteCycleForUser` — a GUIDE-level user gets nothing
 *    auto-applied by this path any more than by the session-scoped one.
 *  - Only `onboarding_completed = true` profiles are eligible — a user
 *    who never finished onboarding has no AthleteState worth cycling.
 *  - Non-client roles (coach/business/admin accounts) are excluded —
 *    this is an athlete training loop, not a staff notification system.
 *  - One user's failure never aborts the batch or is retried
 *    automatically — repeated cron invocations rely on the existing
 *    cooldown/budget checks for idempotency, exactly as a retried
 *    single-user cycle would.
 */

export type ScheduledCycleUserResult =
  | { userId: string; ok: true; decisionCode: string; gatedActionCount: number; autoAppliedCount: number }
  | { userId: string; ok: false; error: string };

export type ScheduledCycleSummary = {
  trigger: ProactiveCycleTrigger;
  ranAt: string;
  userCount: number;
  succeeded: number;
  failed: number;
  results: ScheduledCycleUserResult[];
};

/** Bounds one run's worst case; a real scale-out would page this rather than raise it. */
const MAX_USERS_PER_RUN = 500;
/** How many users' cycles run concurrently — bounded so one run can't hammer Postgres with 500 simultaneous connections. */
const CONCURRENCY = 10;

async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  fn: (item: TIn) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function runScheduledDanteCycles(
  adminSupabase: SupabaseClient,
  trigger: ProactiveCycleTrigger,
): Promise<ScheduledCycleSummary> {
  const ranAt = new Date().toISOString();

  const { data: profileRows, error: profilesError } = await adminSupabase
    .from("profiles")
    .select("user_id")
    .eq("onboarding_completed", true)
    .limit(MAX_USERS_PER_RUN);

  if (profilesError) {
    console.error("[DANTE PROACTIVE CYCLE] Unable to load eligible profiles:", profilesError.message);
    return { trigger, ranAt, userCount: 0, succeeded: 0, failed: 0, results: [] };
  }

  const candidateUserIds = ((profileRows ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);

  if (candidateUserIds.length === 0) {
    return { trigger, ranAt, userCount: 0, succeeded: 0, failed: 0, results: [] };
  }

  const { data: roleRows, error: rolesError } = await adminSupabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", candidateUserIds);

  if (rolesError) {
    console.warn(
      "[DANTE PROACTIVE CYCLE] Unable to load roles, proceeding as if all candidates are clients:",
      rolesError.message,
    );
  }

  const nonClientUserIds = new Set(
    ((roleRows ?? []) as Array<{ user_id: string; role: string | null }>)
      .filter((row) => row.role !== null && row.role !== "client" && row.role !== "user")
      .map((row) => row.user_id),
  );

  const eligibleUserIds = candidateUserIds.filter((id) => !nonClientUserIds.has(id));

  const results = await mapWithConcurrency(eligibleUserIds, CONCURRENCY, async (userId): Promise<ScheduledCycleUserResult> => {
    try {
      const result = await runDanteCycleForUser(adminSupabase, userId);
      return {
        userId,
        ok: true,
        decisionCode: result.decisionCode,
        gatedActionCount: result.gatedActions.length,
        autoAppliedCount: result.gatedActions.filter(
          (gated) => gated.autonomyDecision === "auto" && gated.budgetAllowed,
        ).length,
      };
    } catch (error) {
      return {
        userId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error running this user's cycle.",
      };
    }
  });

  return {
    trigger,
    ranAt,
    userCount: eligibleUserIds.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}
