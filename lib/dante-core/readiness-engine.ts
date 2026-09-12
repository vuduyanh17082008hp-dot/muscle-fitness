import type {
  MuscleRecoveryEstimate,
  ReadinessEngineInput,
  ReadinessResult,
  SystemicFatigueLevel,
} from "@/lib/dante-core/types";

/**
 * Readiness Engine (spec Part A §3).
 *
 * This is a DETERMINISTIC, explainable estimate — not a medically
 * validated measurement. It combines three already-deterministic
 * signals that exist elsewhere in the codebase:
 *
 *   - lib/recovery/score.ts::computeRecoveryScore     (sleep/stress/
 *     fatigue/soreness/mood — the whole-body recovery score)
 *   - lib/recovery/training-load.ts::computeTrainingLoad (recent
 *     session frequency/RPE/volume -> green/amber/red)
 *   - per-muscle "time since last trained" + this week's effective
 *     volume vs. the lifter's own personal baseline
 *
 * It never invents a number when an input is missing — every branch
 * either derives a value from what's available or explicitly marks
 * the result as unavailable/lower-confidence.
 */

/**
 * Typical recovery windows in hours, per muscle SIZE class. These are
 * rough, widely-used training heuristics (large/compound muscle
 * groups generally need longer than small/isolation ones) — NOT a
 * clinical or individualized measurement. They are deliberately
 * coarse for that reason.
 */
const LARGE_MUSCLE_RECOVERY_HOURS = 72;
const SMALL_MUSCLE_RECOVERY_HOURS = 48;

const LARGE_MUSCLES = new Set([
  "chest",
  "latissimus_dorsi",
  "upper_back",
  "quadriceps",
  "hamstrings",
  "glutes",
  "lower_back",
]);

function baseRecoveryWindowHours(muscle: string): number {
  return LARGE_MUSCLES.has(muscle)
    ? LARGE_MUSCLE_RECOVERY_HOURS
    : SMALL_MUSCLE_RECOVERY_HOURS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Estimates recovery% for one muscle from time-since-trained, scaled
 * by how much volume was actually done relative to the lifter's own
 * typical week (more volume than usual -> the recovery window is
 * extended proportionally, capped at 1.5x, since this is a coarse
 * heuristic, not a dose-response model).
 */
function estimateMuscleRecovery(
  muscle: string,
  lastTrainedDate: string | null,
  recentEffectiveSets: number | null,
  typicalWeeklyVolume: number | null,
  now: Date,
): MuscleRecoveryEstimate {
  if (!lastTrainedDate) {
    return {
      muscle: muscle as MuscleRecoveryEstimate["muscle"],
      recoveryPercent: null,
      daysSinceTrained: null,
      basis: "no_training_history",
    };
  }

  const trainedAt = new Date(`${lastTrainedDate}T12:00:00Z`).getTime();

  if (Number.isNaN(trainedAt)) {
    return {
      muscle: muscle as MuscleRecoveryEstimate["muscle"],
      recoveryPercent: null,
      daysSinceTrained: null,
      basis: "no_recent_training_data",
    };
  }

  const hoursSinceTrained = (now.getTime() - trainedAt) / (1000 * 60 * 60);
  const daysSinceTrained = Math.max(0, Math.round(hoursSinceTrained / 24));

  let windowHours = baseRecoveryWindowHours(muscle);

  if (
    recentEffectiveSets !== null &&
    typicalWeeklyVolume !== null &&
    typicalWeeklyVolume > 0
  ) {
    const loadRatio = clamp(recentEffectiveSets / typicalWeeklyVolume, 0.5, 1.5);
    windowHours = windowHours * loadRatio;
  }

  const recoveryPercent = round(
    clamp((hoursSinceTrained / windowHours) * 100, 0, 100),
  );

  return {
    muscle: muscle as MuscleRecoveryEstimate["muscle"],
    recoveryPercent,
    daysSinceTrained,
    basis: "time_since_trained",
  };
}

function deriveSystemicFatigue(
  input: ReadinessEngineInput,
): SystemicFatigueLevel {
  const { recoveryScore, trainingLoad } = input;

  if (recoveryScore.status === "priority" || trainingLoad?.state === "red") {
    return "high";
  }

  if (recoveryScore.status === "moderate" || trainingLoad?.state === "amber") {
    return "moderate";
  }

  if (
    (recoveryScore.status === "good" || recoveryScore.status === "ready") &&
    (trainingLoad === null || trainingLoad.state === "green")
  ) {
    return "low";
  }

  return "unknown";
}

/**
 * readinessScore priority:
 *   1. The whole-body recovery score (0-100) when available — this is
 *      the richest, most direct signal.
 *   2. A coarse fallback derived only from training-load state, used
 *      only when no recovery check-in exists at all. Explicitly
 *      lower-confidence (see `confidence` below).
 *   3. null when neither exists — never fabricated.
 */
function deriveReadinessScore(
  input: ReadinessEngineInput,
): { score: number | null; method: string } {
  if (input.recoveryScore.score !== null) {
    return {
      score: input.recoveryScore.score,
      method:
        "Derived directly from today's recovery check-in score (sleep/stress/fatigue/soreness/mood).",
    };
  }

  if (input.trainingLoad !== null) {
    const fallback: Record<string, number> = { green: 70, amber: 50, red: 30 };
    return {
      score: fallback[input.trainingLoad.state],
      method:
        "No recovery check-in was logged today; this is a coarse fallback based only on recent training-load state (sessions/RPE/volume), which is a much weaker signal than a real check-in.",
    };
  }

  return {
    score: null,
    method: "No recovery check-in and no training-load data were available.",
  };
}

function buildLimitingFactors(
  input: ReadinessEngineInput,
  muscleRecovery: MuscleRecoveryEstimate[],
): string[] {
  const factors: string[] = [];

  for (const driver of input.recoveryScore.drivers) {
    if (!driver.available) {
      continue;
    }

    if (driver.key === "sleep" && driver.score < 60) {
      factors.push("sleep_below_baseline");
    }

    if (driver.key === "soreness" && driver.score < 50) {
      factors.push("soreness_high");
    }

    if (driver.key === "stress" && driver.score < 50) {
      factors.push("stress_high");
    }

    if (driver.key === "fatigue" && driver.score < 50) {
      factors.push("fatigue_high");
    }
  }

  if (input.trainingLoad?.state === "red") {
    factors.push("training_load_high");
  }

  if (input.trainingLoad?.restDaysLast7Days === 0) {
    factors.push("no_rest_days_last_7_days");
  }

  for (const estimate of muscleRecovery) {
    if (estimate.recoveryPercent !== null && estimate.recoveryPercent < 60) {
      factors.push(`${estimate.muscle}_recovery_low`);
    }
  }

  return factors;
}

/**
 * confidence: 0-1, purely a function of how much real input this
 * result had — NOT a claim about biological accuracy.
 */
function deriveConfidence(
  input: ReadinessEngineInput,
  muscleRecovery: MuscleRecoveryEstimate[],
): number {
  let points = 0;
  let maxPoints = 0;

  maxPoints += 2;
  if (input.recoveryScore.score !== null) {
    points += 2;
  }

  maxPoints += 1;
  if (input.trainingLoad !== null) {
    points += 1;
  }

  maxPoints += 1;
  const musclesWithData = muscleRecovery.filter(
    (m) => m.recoveryPercent !== null,
  ).length;
  if (muscleRecovery.length > 0) {
    points += musclesWithData / muscleRecovery.length;
  } else {
    maxPoints -= 1;
  }

  if (maxPoints === 0) {
    return 0;
  }

  return round(clamp(points / maxPoints, 0, 1), 2);
}

export function evaluateReadiness(input: ReadinessEngineInput): ReadinessResult {
  const now = input.now ?? new Date();

  const muscleRecovery = input.muscles.map((entry) =>
    estimateMuscleRecovery(
      entry.muscle,
      entry.lastTrainedDate,
      entry.recentEffectiveSets,
      entry.typicalWeeklyVolume,
      now,
    ),
  );

  const { score: readinessScore, method } = deriveReadinessScore(input);
  const systemicFatigue = deriveSystemicFatigue(input);
  const limitingFactors = buildLimitingFactors(input, muscleRecovery);
  const confidence = deriveConfidence(input, muscleRecovery);

  return {
    readinessScore,
    systemicFatigue,
    muscleRecovery,
    limitingFactors,
    confidence,
    method,
  };
}
