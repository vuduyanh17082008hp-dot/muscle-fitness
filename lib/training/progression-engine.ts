import type {
  RecoveryStatusInput,
  TrainingLoadStateInput,
} from "@/lib/training/recommendations";

/**
 * Exercise-level Adaptive Progression Engine (spec §7b / §16 "double
 * progression"). This is separate from the muscle-level Recommendation
 * Engine (lib/training/recommendations.ts): that engine asks "how much
 * volume for this muscle", this one asks "should THIS exercise's load
 * go up for the next session".
 *
 * Double progression: within a prescribed rep range, progress reps
 * before progressing load. Once every working set hits the top of the
 * range at an acceptable effort level, suggest a small load increase
 * and (implicitly, on the next session) resetting to the bottom of
 * the range at the new load.
 *
 * Safety gates always take priority over performance signals — this
 * engine will never suggest a load increase when a pain flag or a
 * poor recovery/training-load signal is present, regardless of how
 * well the lifter performed.
 */

export type ProgressionAction =
  | "INCREASE_LOAD"
  | "HOLD"
  | "DECREASE_LOAD"
  | "INSUFFICIENT_DATA";

export type LoggedSetForProgression = {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
};

export type ProgressionInput = {
  targetRepMin: number;
  targetRepMax: number;
  targetRir: number | null;
  /** The most recent completed session's working sets for this exercise. */
  lastSessionSets: LoggedSetForProgression[];
  /**
   * True if a recent recovery check-in flagged pain/illness ('yes'),
   * or a 'minor' flag combined with a declining recovery trend. The
   * caller (load-training-context) is responsible for that judgment;
   * this engine just enforces the gate.
   */
  recentPainFlag: boolean;
  recoveryStatus: RecoveryStatusInput;
  trainingLoadState: TrainingLoadStateInput;
  /** Load increment to suggest, in kg. Defaults to a conservative 2.5kg. */
  loadIncrementKg?: number;
};

export type ProgressionResult = {
  action: ProgressionAction;
  suggestedWeightKg: number | null;
  reason: string;
  /** True when a safety gate suppressed what performance alone would have suggested. */
  gated: boolean;
};

const DEFAULT_LOAD_INCREMENT_KG = 2.5;

/** RIR tolerance below target before we say effort was "too hard" to trust the top-of-range reps. */
const RIR_TOLERANCE = 1;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isSafetyGated(input: ProgressionInput): { gated: boolean; reason: string | null } {
  if (input.recentPainFlag) {
    return {
      gated: true,
      reason:
        "A recent pain/illness flag was logged, so no load increase is suggested regardless of performance.",
    };
  }

  if (input.recoveryStatus === "priority") {
    return {
      gated: true,
      reason: "Recovery status is currently in the 'priority' range, so load progression is held.",
    };
  }

  if (input.trainingLoadState === "red") {
    return {
      gated: true,
      reason: "Training load is currently elevated (red), so load progression is held.",
    };
  }

  return { gated: false, reason: null };
}

/**
 * Computes the double-progression suggestion for one exercise,
 * applying pain/recovery safety gates. Never guesses when data is
 * missing or incomplete.
 */
export function computeExerciseProgression(
  input: ProgressionInput,
): ProgressionResult {
  const completedSets = input.lastSessionSets.filter(
    (set) => set.completed && set.weightKg !== null && set.reps !== null,
  );

  if (completedSets.length === 0) {
    return {
      action: "INSUFFICIENT_DATA",
      suggestedWeightKg: null,
      reason: "No completed sets with recorded weight and reps were found for this exercise.",
      gated: false,
    };
  }

  const gate = isSafetyGated(input);

  const allHitTopOfRange = completedSets.every(
    (set) => (set.reps as number) >= input.targetRepMax,
  );

  const effortAcceptable =
    input.targetRir === null ||
    completedSets.every(
      (set) => set.rir === null || set.rir >= input.targetRir! - RIR_TOLERANCE,
    );

  const readyToIncreaseLoad = allHitTopOfRange && effortAcceptable;

  if (gate.gated) {
    return {
      action: "HOLD",
      suggestedWeightKg: null,
      reason: gate.reason ?? "Progression held for safety.",
      gated: true,
    };
  }

  if (readyToIncreaseLoad) {
    const averageWeight =
      completedSets.reduce((sum, set) => sum + (set.weightKg as number), 0) /
      completedSets.length;

    const increment = input.loadIncrementKg ?? DEFAULT_LOAD_INCREMENT_KG;

    return {
      action: "INCREASE_LOAD",
      suggestedWeightKg: round(averageWeight + increment),
      reason: `All working sets reached the top of the ${input.targetRepMin}-${input.targetRepMax} rep range at an acceptable effort level — suggesting a small load increase and resetting to the bottom of the range next session.`,
      gated: false,
    };
  }

  const belowRepRange = completedSets.some((set) => (set.reps as number) < input.targetRepMin);

  if (belowRepRange) {
    return {
      action: "DECREASE_LOAD",
      suggestedWeightKg: null,
      reason: `At least one working set fell below the target ${input.targetRepMin}-${input.targetRepMax} rep range.`,
      gated: false,
    };
  }

  return {
    action: "HOLD",
    suggestedWeightKg: null,
    reason: `Reps are within the ${input.targetRepMin}-${input.targetRepMax} rep range but have not yet reached the top at an acceptable effort — keep working within the range before increasing load.`,
    gated: false,
  };
}
