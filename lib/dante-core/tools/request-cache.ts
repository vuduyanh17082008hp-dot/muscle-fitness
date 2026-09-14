import "server-only";

import type { ToolContext } from "@/lib/dante-core/tools/types";

/**
 * Request-local memoization for the handful of shared loaders several
 * tools independently need (buildAthleteState, loadTrainingContext,
 * loadTodaySession, loadRecoveryContext, loadNutritionContext,
 * loadFoodLogForDate) — Part 6/15/Q of the integration audit: within
 * ONE Dante turn, get_today_plan, get_current_workout,
 * get_adaptive_recommendation etc. can all be called across different
 * rounds of the same tool loop, and previously each re-ran its own
 * loaders from scratch even when an earlier tool call in the SAME
 * turn had already loaded the identical data.
 *
 * Keyed by a plain string (userId is already fixed per ToolContext —
 * one context is always exactly one authenticated request), and
 * caches the in-flight PROMISE rather than the resolved value so two
 * tools awaited concurrently (e.g. inside one tool's own
 * Promise.all) still only trigger one underlying load.
 *
 * `context.cache` is optional — omitting it (e.g. a hand-built test
 * context, or a one-shot confirm execution where only one tool ever
 * runs) simply disables memoization; correctness never depends on it.
 */
export function cached<T>(context: ToolContext, key: string, loader: () => Promise<T>): Promise<T> {
  if (!context.cache) {
    return loader();
  }

  const existing = context.cache.get(key);

  if (existing) {
    return existing as Promise<T>;
  }

  const promise = loader();
  context.cache.set(key, promise);
  return promise;
}

export function createToolRequestCache(): Map<string, Promise<unknown>> {
  return new Map();
}
