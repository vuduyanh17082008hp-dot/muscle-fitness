import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";
import { computeMuscleVolume } from "@/lib/training/volume-engine";
import type { DatedExerciseSetLog } from "@/lib/training/weekly-analytics";
import {
  WEEK_MS,
  currentWeekStart,
  startOfWeekMonday,
  toLocalDate,
  weekKey,
} from "@/lib/training/week-bucketing";

/**
 * Personal Baseline Engine (spec §15): learns the user's own normal
 * training pattern per muscle from rolling windows of their own
 * history, rather than any external "ideal volume" table.
 */
export type PersonalBaseline = {
  muscle: CanonicalMuscle;
  /** Weeks of history actually available (excludes the current, possibly partial, week). */
  sampleWeeks: number;
  /** Average total effective sets/week over the available window. Null if no complete weeks logged. */
  typicalWeeklyVolume: number | null;
  /** Min/max total effective sets/week over the available window. */
  recentRange: { min: number; max: number } | null;
  /** Coefficient of variation-based label — a rough signal, not a statistical claim. */
  variability: "low" | "moderate" | "high" | null;
};

const MAX_BASELINE_WINDOW_WEEKS = 12;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Computes a personal baseline per muscle from completed prior weeks
 * (the current, possibly-in-progress week is excluded so it can't
 * skew "typical" volume downward).
 */
export function computePersonalBaseline(
  sets: DatedExerciseSetLog[],
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]>,
  options: { now?: Date; timeZoneOffsetMinutes?: number } = {},
): Map<CanonicalMuscle, PersonalBaseline> {
  const timeZoneOffsetMinutes = options.timeZoneOffsetMinutes ?? 0;
  const now = options.now ?? new Date();

  const thisWeekStart = currentWeekStart(now, timeZoneOffsetMinutes);
  const thisWeekKey = weekKey(thisWeekStart);

  const breakdownByWeek = new Map<
    string,
    ReturnType<typeof computeMuscleVolume>
  >();

  const byWeek = new Map<string, DatedExerciseSetLog[]>();

  for (const set of sets) {
    const localDate = toLocalDate(set.completedAt, timeZoneOffsetMinutes);
    const key = weekKey(startOfWeekMonday(localDate));

    if (key === thisWeekKey) {
      continue; // exclude the current in-progress week
    }

    const existing = byWeek.get(key);

    if (existing) {
      existing.push(set);
    } else {
      byWeek.set(key, [set]);
    }
  }

  for (const [key, weekSets] of byWeek) {
    breakdownByWeek.set(key, computeMuscleVolume(weekSets, contributionsByExercise));
  }

  // Only consider weeks within the last MAX_BASELINE_WINDOW_WEEKS
  // that actually have logged data — no zero-filling for weeks the
  // user simply didn't log (spec: missing data stays missing, never 0).
  const consideredKeys: string[] = [];

  for (let i = 1; i <= MAX_BASELINE_WINDOW_WEEKS; i += 1) {
    const start = new Date(thisWeekStart.getTime() - i * WEEK_MS);
    const key = weekKey(start);

    if (breakdownByWeek.has(key)) {
      consideredKeys.push(key);
    }
  }

  const muscles = new Set<CanonicalMuscle>();

  for (const breakdown of breakdownByWeek.values()) {
    for (const muscle of breakdown.keys()) {
      muscles.add(muscle);
    }
  }

  const result = new Map<CanonicalMuscle, PersonalBaseline>();

  for (const muscle of muscles) {
    const weeklyTotals = consideredKeys.map(
      (key) => breakdownByWeek.get(key)?.get(muscle)?.totalEffectiveSets ?? 0,
    );

    if (weeklyTotals.length === 0) {
      result.set(muscle, {
        muscle,
        sampleWeeks: 0,
        typicalWeeklyVolume: null,
        recentRange: null,
        variability: null,
      });

      continue;
    }

    const sum = weeklyTotals.reduce((a, b) => a + b, 0);
    const mean = sum / weeklyTotals.length;
    const min = Math.min(...weeklyTotals);
    const max = Math.max(...weeklyTotals);

    const variance =
      weeklyTotals.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
      weeklyTotals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

    let variability: PersonalBaseline["variability"] = "low";

    if (coefficientOfVariation > 0.5) {
      variability = "high";
    } else if (coefficientOfVariation > 0.25) {
      variability = "moderate";
    }

    result.set(muscle, {
      muscle,
      sampleWeeks: weeklyTotals.length,
      typicalWeeklyVolume: round(mean),
      recentRange: { min: round(min), max: round(max) },
      variability,
    });
  }

  return result;
}
