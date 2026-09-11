import type { PersonalBaseline } from "@/lib/training/baseline";
import type { PerformanceTrend } from "@/lib/training/performance";
import { PELLAND_2025_VOLUME_DOSE_RESPONSE } from "@/lib/evidence/registry";

/**
 * Deterministic Recommendation Engine (spec §16-§17).
 *
 * This module NEVER calls an LLM. Dante consumes its output and
 * explains it in natural language — it must not recompute or
 * override these categories/confidence values (see the
 * "TRAINING INTELLIGENCE" section added to DANTE_INSTRUCTIONS in
 * app/api/chatbot/route.ts).
 */

export type RecommendationCategory =
  | "MAINTAIN"
  | "INCREASE_GRADUALLY"
  | "REDUCE_SLIGHTLY"
  | "REDISTRIBUTE"
  | "MONITOR"
  | "INSUFFICIENT_DATA";

export type ConfidenceLevel = "low" | "moderate" | "high";

export type RecoveryStatusInput = "ready" | "good" | "moderate" | "priority" | null;
export type TrainingLoadStateInput = "green" | "amber" | "red" | null;

export type MuscleRecommendationInput = {
  currentEffectiveVolume: number;
  previousVolume: number | null;
  changePercent: number | null;
  baseline: PersonalBaseline;
  frequency: number;
  /** Fraction (0-1) of this week's volume for this muscle done in its single biggest session. Null if unknown. */
  maxSingleSessionShare: number | null;
  performanceTrend: PerformanceTrend;
  recoveryStatus: RecoveryStatusInput;
  trainingLoadState: TrainingLoadStateInput;
  /** Fraction (0-1) of the last 7 days with a recovery check-in logged. */
  recoveryLoggingCompleteness: number | null;
};

export type TrainingRecommendationExplanation = {
  recommendation: RecommendationCategory;
  confidence: ConfidenceLevel;
  inputs: {
    currentEffectiveVolume: number;
    previousVolume: number | null;
    personalBaseline: number | null;
    frequency: number;
    performanceTrend: PerformanceTrend;
    recoveryStatus: RecoveryStatusInput;
  };
  signals: string[];
  limitations: string[];
  evidenceRefs: string[];
  analyticsVersion: number;
};

export const RECOMMENDATION_ANALYTICS_VERSION = 1;

const LARGE_INCREASE_PERCENT = 25;
const STABLE_BAND_PERCENT = 10;
const REDISTRIBUTE_SESSION_SHARE = 0.75;
const MIN_WEEKS_FOR_SUFFICIENT_HISTORY = 4;
const MIN_WEEKS_FOR_HIGH_CONFIDENCE = 8;

function isPoorRecovery(recoveryStatus: RecoveryStatusInput): boolean {
  return recoveryStatus === "priority";
}

function isElevatedLoad(trainingLoadState: TrainingLoadStateInput): boolean {
  return trainingLoadState === "red";
}

function computeConfidence(input: MuscleRecommendationInput): ConfidenceLevel {
  let score = 0;

  if (input.baseline.sampleWeeks >= MIN_WEEKS_FOR_HIGH_CONFIDENCE) {
    score += 2;
  } else if (input.baseline.sampleWeeks >= MIN_WEEKS_FOR_SUFFICIENT_HISTORY) {
    score += 1;
  }

  if (input.performanceTrend !== "insufficient_data") {
    score += 1;
  }

  if (input.recoveryStatus !== null) {
    score += 1;
  }

  if (input.recoveryLoggingCompleteness !== null && input.recoveryLoggingCompleteness >= 4 / 7) {
    score += 1;
  }

  if (input.changePercent !== null) {
    score += 1;
  }

  if (score >= 4) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

function buildDataCompletenessSignals(input: MuscleRecommendationInput): string[] {
  const signals: string[] = [];

  signals.push(
    input.baseline.sampleWeeks >= MIN_WEEKS_FOR_SUFFICIENT_HISTORY
      ? `${input.baseline.sampleWeeks} weeks of workout history available`
      : `Only ${input.baseline.sampleWeeks} week(s) of workout history available`,
  );

  signals.push(
    input.performanceTrend === "insufficient_data"
      ? "Not enough comparable performance data for this muscle's exercises yet"
      : `Comparable performance trend: ${input.performanceTrend}`,
  );

  if (input.recoveryLoggingCompleteness !== null) {
    const daysLogged = Math.round(input.recoveryLoggingCompleteness * 7);
    signals.push(`Recovery logged ${daysLogged}/7 days`);
  } else {
    signals.push("No recovery check-in data available");
  }

  return signals;
}

/**
 * Computes the muscle-level recommendation, confidence and a fully
 * inspectable explanation object. Every branch is deterministic —
 * there is no hidden reasoning here for an LLM to obscure.
 */
export function computeMuscleRecommendation(
  input: MuscleRecommendationInput,
): TrainingRecommendationExplanation {
  const confidence = computeConfidence(input);
  const dataCompletenessSignals = buildDataCompletenessSignals(input);
  const limitations: string[] = [];

  if (input.baseline.sampleWeeks < MIN_WEEKS_FOR_SUFFICIENT_HISTORY) {
    limitations.push(
      "Limited personal history means the baseline comparison is only a rough signal.",
    );
  }

  if (input.performanceTrend === "insufficient_data") {
    limitations.push(
      "No comparable same-exercise performance data was available for this muscle.",
    );
  }

  if (input.recoveryStatus === null) {
    limitations.push("No recent recovery check-in data was available.");
  }

  function finalize(
    recommendation: RecommendationCategory,
    signals: string[],
    evidenceRefs: string[] = [],
  ): TrainingRecommendationExplanation {
    return {
      recommendation,
      confidence,
      inputs: {
        currentEffectiveVolume: input.currentEffectiveVolume,
        previousVolume: input.previousVolume,
        personalBaseline: input.baseline.typicalWeeklyVolume,
        frequency: input.frequency,
        performanceTrend: input.performanceTrend,
        recoveryStatus: input.recoveryStatus,
      },
      signals: [...signals, ...dataCompletenessSignals],
      limitations,
      evidenceRefs,
      analyticsVersion: RECOMMENDATION_ANALYTICS_VERSION,
    };
  }

  // INSUFFICIENT_DATA: no meaningful history to compare against at all.
  if (input.baseline.sampleWeeks < 2 && input.previousVolume === null) {
    return finalize(
      "INSUFFICIENT_DATA",
      ["Not enough logged history yet to compare this week against a personal pattern."],
    );
  }

  // REDUCE_SLIGHTLY: large recent increase + declining performance and/or poor recovery.
  if (
    input.changePercent !== null &&
    input.changePercent >= LARGE_INCREASE_PERCENT &&
    (input.performanceTrend === "declining" ||
      isPoorRecovery(input.recoveryStatus) ||
      isElevatedLoad(input.trainingLoadState))
  ) {
    return finalize(
      "REDUCE_SLIGHTLY",
      [
        `Volume increased ${input.changePercent}% versus last week.`,
        "This coincided with a decline in performance and/or recovery signals.",
      ],
      [PELLAND_2025_VOLUME_DOSE_RESPONSE.id],
    );
  }

  // REDISTRIBUTE: heavy concentration into a single session.
  if (
    input.maxSingleSessionShare !== null &&
    input.maxSingleSessionShare >= REDISTRIBUTE_SESSION_SHARE &&
    input.frequency <= 2
  ) {
    return finalize("REDISTRIBUTE", [
      `About ${Math.round(input.maxSingleSessionShare * 100)}% of this week's volume for this muscle came from a single session.`,
      "Spreading similar volume across more sessions is an option to consider.",
    ]);
  }

  // MONITOR: volume high relative to personal baseline, but performance/recovery still acceptable.
  if (
    input.baseline.recentRange !== null &&
    input.currentEffectiveVolume > input.baseline.recentRange.max &&
    input.performanceTrend !== "declining" &&
    !isPoorRecovery(input.recoveryStatus)
  ) {
    return finalize("MONITOR", [
      `Current volume (${input.currentEffectiveVolume}) is above your recent personal range (${input.baseline.recentRange.min}-${input.baseline.recentRange.max}).`,
      "Performance and recovery signals remain acceptable for now.",
    ]);
  }

  // INCREASE_GRADUALLY: stable volume, sufficient history, plateaued performance, good recovery, no fatigue flags.
  if (
    input.changePercent !== null &&
    Math.abs(input.changePercent) <= STABLE_BAND_PERCENT &&
    input.baseline.sampleWeeks >= MIN_WEEKS_FOR_SUFFICIENT_HISTORY &&
    input.performanceTrend === "stable" &&
    (input.recoveryStatus === "ready" || input.recoveryStatus === "good") &&
    input.trainingLoadState !== "red" &&
    input.trainingLoadState !== "amber"
  ) {
    return finalize(
      "INCREASE_GRADUALLY",
      [
        "Volume has been stable and performance has plateaued across enough sessions to consider a small increase.",
        "Recovery signals do not show meaningful fatigue right now.",
      ],
      [PELLAND_2025_VOLUME_DOSE_RESPONSE.id],
    );
  }

  // REDUCE_SLIGHTLY (secondary path): poor recovery/high load regardless of volume trend.
  if (isPoorRecovery(input.recoveryStatus) || isElevatedLoad(input.trainingLoadState)) {
    return finalize("REDUCE_SLIGHTLY", [
      "Recent recovery and/or training-load signals suggest easing volume for this muscle rather than adding more.",
    ]);
  }

  // Default: MAINTAIN when volume is reasonable and nothing else flagged.
  return finalize(
    "MAINTAIN",
    [
      "Current volume, performance and recovery signals look reasonable together.",
      "There is currently insufficient evidence from your own history to justify a change either way.",
    ],
    [PELLAND_2025_VOLUME_DOSE_RESPONSE.id],
  );
}
