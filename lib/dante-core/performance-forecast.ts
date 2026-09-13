import type { AthleteState } from "@/lib/athlete-state/types";
import type { ConfidenceLevel, TraceableDecision } from "@/lib/dante-core/types";

/**
 * Performance Forecast (spec Part "5. PERFORMANCE FORECAST").
 *
 * Deliberately rule-based over the lifter's OWN historical baseline
 * (lib/dante-core/personal-baseline.ts) — never a machine-learning
 * model, and never presented as certainty. Every output carries its
 * own confidence and explicit limitations so a low-confidence forecast
 * reads as "we don't know yet", not as a hedge-worded guess.
 */

export type ReadinessWindow = "high" | "moderate" | "low" | "unknown";
export type SessionDifficultyForecast =
  | "easier_than_usual"
  | "typical"
  | "harder_than_usual"
  | "unknown";

export type PerformanceForecast = {
  expectedReadinessWindow: ReadinessWindow;
  expectedSessionDifficulty: SessionDifficultyForecast;
  /** 0-100. Deliberately capped well below 100 — this is a statistical estimate, never treated as certain. */
  nextSessionConfidencePercent: number;
  limitations: string[];
};

/** Hard ceiling on the confidence this engine will ever report — a rule-based forecast from a personal baseline should never read as near-certain. */
const MAX_CONFIDENCE_PERCENT = 85;
const MIN_BASELINE_SAMPLES = 5;

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function confidenceLevelFromFraction(fraction: number): ConfidenceLevel {
  if (fraction >= 0.75) return "high";
  if (fraction >= 0.5) return "moderate";
  return "low";
}

export function buildPerformanceForecast(
  athleteState: AthleteState,
): TraceableDecision<PerformanceForecast> {
  const limitations = [
    "This is a rule-based estimate drawn from your own logged history — not a medical, biomechanical, or guaranteed prediction.",
  ];

  const recoveryDeviation = athleteState.derived.baselineDeviations.recoveryScore;
  const trainingLoadDeviation = athleteState.derived.baselineDeviations.trainingLoad;

  const dataUsed: Record<string, string | number | null> = {
    todayRecoveryScore: athleteState.recovery.score,
    sevenDayAverageRecoveryScore: athleteState.recovery.sevenDayAverageScore,
    personalBaselineRecoveryScore: recoveryDeviation.baseline,
    recoveryBaselineSampleCount: recoveryDeviation.sampleCount,
    trainingLoadState: athleteState.recovery.trainingLoadState,
  };

  // ---- Safety override: a flagged pain/illness makes any performance forecast unreliable and inappropriate to project as "typical". ----
  if (athleteState.recovery.painFlag) {
    limitations.push(
      "A pain/illness flag was logged — this forecast is a safety-conservative placeholder, not a performance projection.",
    );

    const forecast: PerformanceForecast = {
      expectedReadinessWindow: "low",
      expectedSessionDifficulty: "harder_than_usual",
      nextSessionConfidencePercent: 50,
      limitations,
    };

    return {
      recommendation: "Expect a lower-readiness window until the flagged pain/illness clears.",
      decision: forecast,
      why: ["A recent check-in flagged pain or illness."],
      dataUsed,
      confidence: "moderate",
      sources: [],
    };
  }

  const hasBaseline =
    recoveryDeviation.sampleCount >= MIN_BASELINE_SAMPLES &&
    recoveryDeviation.confidence > 0 &&
    recoveryDeviation.baseline !== null &&
    recoveryDeviation.delta !== null;

  if (!hasBaseline) {
    limitations.push(
      `Fewer than ${MIN_BASELINE_SAMPLES} recovery check-ins are on record — not enough history yet to build a personal baseline to forecast against.`,
    );

    const forecast: PerformanceForecast = {
      expectedReadinessWindow: "unknown",
      expectedSessionDifficulty: "unknown",
      nextSessionConfidencePercent: 0,
      limitations,
    };

    return {
      recommendation: "Not enough history yet to forecast your next session's readiness.",
      decision: forecast,
      why: ["Your personal recovery baseline needs more logged check-ins before a forecast is meaningful."],
      dataUsed,
      confidence: "low",
      sources: [],
    };
  }

  const delta = recoveryDeviation.delta as number;

  const expectedReadinessWindow: ReadinessWindow =
    delta >= 5 ? "high" : delta <= -10 ? "low" : "moderate";

  const trainingLoadElevated =
    athleteState.recovery.trainingLoadState === "red" ||
    (trainingLoadDeviation.delta !== null && trainingLoadDeviation.delta > 0);

  const expectedSessionDifficulty: SessionDifficultyForecast =
    expectedReadinessWindow === "low" || trainingLoadElevated
      ? "harder_than_usual"
      : expectedReadinessWindow === "high" && athleteState.recovery.trainingLoadState === "green"
        ? "easier_than_usual"
        : "typical";

  const confidenceFraction =
    trainingLoadDeviation.confidence > 0
      ? round((recoveryDeviation.confidence + trainingLoadDeviation.confidence) / 2, 2)
      : recoveryDeviation.confidence;

  const nextSessionConfidencePercent = Math.min(
    MAX_CONFIDENCE_PERCENT,
    round(confidenceFraction * 100),
  );

  const why = [
    `Today's recovery score (${athleteState.recovery.score}) is ${delta >= 0 ? `${delta} points above` : `${Math.abs(delta)} points below`} your personal baseline of ${recoveryDeviation.baseline}, built from ${recoveryDeviation.sampleCount} check-ins.`,
  ];

  if (athleteState.recovery.trainingLoadState) {
    why.push(`Current training load status: ${athleteState.recovery.trainingLoadState}.`);
  }

  if (nextSessionConfidencePercent < 50) {
    limitations.push("Confidence is limited — treat this window as a loose guide, not a firm expectation.");
  }

  const readinessLabel =
    expectedReadinessWindow === "high"
      ? "a higher-than-usual"
      : expectedReadinessWindow === "low"
        ? "a lower-than-usual"
        : "a typical";

  const forecast: PerformanceForecast = {
    expectedReadinessWindow,
    expectedSessionDifficulty,
    nextSessionConfidencePercent,
    limitations,
  };

  return {
    recommendation: `Expect ${readinessLabel} readiness window for your next session.`,
    decision: forecast,
    why,
    dataUsed: { ...dataUsed, nextSessionConfidencePercent },
    confidence: confidenceLevelFromFraction(confidenceFraction),
    sources: [],
  };
}
