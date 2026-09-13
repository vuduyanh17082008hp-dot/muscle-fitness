import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import type { PerformanceTrend } from "@/lib/training/performance";
import type { MuscleRecoveryEstimate, SystemicFatigueLevel } from "@/lib/dante-core/types";

/**
 * Muscle Recovery Map — an EXPLAINABLE layer built on top of the
 * existing per-muscle time-based estimate
 * (lib/dante-core/readiness-engine.ts's MuscleRecoveryEstimate),
 * never a second independent computation of "how recovered is this
 * muscle". It adds the other signals the estimate alone doesn't
 * carry (soreness, whole-body recovery state, performance trend) as
 * explicit, human-readable `drivers` — text a user or Dante can
 * actually point to, not a black-box score.
 *
 * Deliberately conservative language: this is a training-readiness
 * ESTIMATE, never a claim about actual tissue/biological recovery.
 */

export type MuscleRecoveryState =
  | "well_recovered"
  | "recovering"
  | "needs_recovery"
  | "insufficient_data";

export type MuscleRecoveryMapEntry = {
  muscle: CanonicalMuscle;
  muscleLabel: string;
  recoveryState: MuscleRecoveryState;
  /** 0-100 estimated training readiness — the SAME number as MuscleRecoveryEstimate.recoveryPercent. Null when there's no basis for one. */
  score: number | null;
  /** 0-1. Reflects how many of the available signals actually had data, not biological certainty. */
  confidence: number;
  /** Short, human-readable reasons behind this entry — always at least one, even when the state is "insufficient_data". */
  drivers: string[];
};

function classifyRecoveryState(recoveryPercent: number | null): MuscleRecoveryState {
  if (recoveryPercent === null) return "insufficient_data";
  if (recoveryPercent >= 80) return "well_recovered";
  if (recoveryPercent >= 50) return "recovering";
  return "needs_recovery";
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type MuscleRecoveryMapInput = {
  muscleRecovery: MuscleRecoveryEstimate[];
  systemicFatigue: SystemicFatigueLevel;
  /** Today's soreness driver score (0-100), when a check-in exists. Whole-body, not per-muscle — the codebase doesn't track per-muscle soreness. */
  sorenessScoreToday: number | null;
  /** Per-muscle e1RM/strength trend, when enough history exists for that muscle's best-tracked exercise. */
  performanceTrendByMuscle: Map<CanonicalMuscle, PerformanceTrend>;
};

export function buildMuscleRecoveryMap(input: MuscleRecoveryMapInput): MuscleRecoveryMapEntry[] {
  return input.muscleRecovery.map((estimate) => {
    const drivers: string[] = [];
    let confidencePoints = 0;
    let confidenceMax = 0;

    confidenceMax += 1;
    if (estimate.recoveryPercent !== null) {
      confidencePoints += 1;

      if (estimate.daysSinceTrained !== null) {
        drivers.push(
          estimate.daysSinceTrained === 0
            ? "Trained today"
            : `${estimate.daysSinceTrained} day${estimate.daysSinceTrained === 1 ? "" : "s"} since last trained`,
        );
      }
    } else if (estimate.basis === "no_training_history") {
      drivers.push("No logged training history for this muscle yet");
    } else {
      drivers.push("No recent training data available for this muscle");
    }

    confidenceMax += 1;
    if (input.sorenessScoreToday !== null) {
      confidencePoints += 1;

      if (input.sorenessScoreToday < 50) {
        drivers.push("High soreness reported today (whole-body check-in)");
      }
    }

    confidenceMax += 1;
    if (input.systemicFatigue !== "unknown") {
      confidencePoints += 1;

      if (input.systemicFatigue === "high") {
        drivers.push("Overall recovery is currently low");
      } else if (input.systemicFatigue === "moderate") {
        drivers.push("Overall recovery is moderate today");
      }
    }

    confidenceMax += 1;
    const performanceTrend = input.performanceTrendByMuscle.get(estimate.muscle) ?? "insufficient_data";
    if (performanceTrend !== "insufficient_data") {
      confidencePoints += 1;

      if (performanceTrend === "declining") {
        drivers.push("Recent strength trend is declining — a possible sign of accumulated fatigue");
      } else if (performanceTrend === "improving") {
        drivers.push("Recent strength trend is improving");
      }
    }

    if (drivers.length === 0) {
      drivers.push("Not enough data yet to explain this estimate");
    }

    return {
      muscle: estimate.muscle,
      muscleLabel: MUSCLE_DISPLAY_NAME[estimate.muscle],
      recoveryState: classifyRecoveryState(estimate.recoveryPercent),
      score: estimate.recoveryPercent,
      confidence: confidenceMax > 0 ? round(confidencePoints / confidenceMax) : 0,
      drivers,
    };
  });
}
