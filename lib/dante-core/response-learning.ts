import type { ContextKey, InterventionType, ObservedOutcome } from "@/lib/dante-core/memory-hierarchy/types";

/**
 * Client Response Learning (mission Part 5): CONTEXT -> INTERVENTION
 * -> OUTCOME. `classifyContext` is the ONE place a situation is
 * reduced to a small, stable, explainable bucket — deterministic
 * rules over already-computed AthleteState signals, never an LLM's
 * free-text read of the situation and never a statistical clustering
 * step that would be hard to explain to the athlete.
 */

export type ContextSignals = {
  sleepHours: number | null;
  stress: number | null;
  soreness: number | null;
  recoveryScore: number | null;
  trainingLoadState: "green" | "amber" | "red" | null;
};

const POOR_SLEEP_THRESHOLD_HOURS = 6.5;
const HIGH_STRESS_THRESHOLD = 7;
const HIGH_SORENESS_THRESHOLD = 7;
const LOW_RECOVERY_THRESHOLD = 55;

/**
 * Builds a stable context key such as "poor_sleep_high_stress" or
 * "low_recovery" from whichever signals are actually present. Returns
 * "insufficient_data" rather than guessing when nothing meaningful is
 * available — that context key is never eligible for pattern
 * consolidation (see load-patterns.ts).
 */
export function classifyContext(signals: ContextSignals): ContextKey {
  const tags: string[] = [];

  if (signals.sleepHours !== null && signals.sleepHours < POOR_SLEEP_THRESHOLD_HOURS) {
    tags.push("poor_sleep");
  }

  if (signals.stress !== null && signals.stress >= HIGH_STRESS_THRESHOLD) {
    tags.push("high_stress");
  }

  if (signals.soreness !== null && signals.soreness >= HIGH_SORENESS_THRESHOLD) {
    tags.push("high_soreness");
  }

  if (signals.trainingLoadState === "red") {
    tags.push("high_training_load");
  }

  if (tags.length === 0 && signals.recoveryScore !== null && signals.recoveryScore < LOW_RECOVERY_THRESHOLD) {
    tags.push("low_recovery");
  }

  if (tags.length === 0) {
    const hasAnySignal = Object.values(signals).some((value) => value !== null);
    return hasAnySignal ? "normal_conditions" : "insufficient_data";
  }

  return tags.join("_");
}

export type ResponseOutcomeInput = {
  /** Real, already-computed metric — e.g. next-day recovery score, or a performance metric like session RPE vs. planned. */
  before: number | null;
  after: number | null;
  /** Positive means "the metric moved the direction that's good for this signal" — the caller decides direction (e.g. for recovery score, higher is better; for RPE at fixed load, lower is better). */
  higherIsBetter: boolean;
  /** How much of a change counts as meaningfully different from noise. */
  meaningfulChangeThreshold: number;
};

/**
 * Reduces a real before/after comparison to one of the three honest
 * outcome buckets. Returns "unknown" whenever either side is missing
 * — never guesses an outcome from incomplete data.
 */
export function resolveObservedOutcome(input: ResponseOutcomeInput): ObservedOutcome {
  if (input.before === null || input.after === null) return "unknown";

  const delta = input.after - input.before;
  const signedDelta = input.higherIsBetter ? delta : -delta;

  if (Math.abs(signedDelta) < input.meaningfulChangeThreshold) return "maintained";
  return signedDelta > 0 ? "improved" : "worsened";
}

/** Whether an outcome should count as "positive evidence" for consolidate.ts's confidence math. Maintained counts as positive — the goal of most recovery-driven interventions is to avoid a worse outcome, not necessarily to improve a number that was never the target. */
export function outcomeIsPositive(outcome: ObservedOutcome): boolean | null {
  if (outcome === "unknown") return null;
  return outcome === "improved" || outcome === "maintained";
}

export const RECURRING_INTERVENTION_TYPES: InterventionType[] = [
  "reduce_volume",
  "reduce_load",
  "modify_session",
  "postpone_exercise",
  "increase_load",
  "hold_load",
  "macro_adjustment",
  "meal_timing_adjustment",
  "no_change",
];
