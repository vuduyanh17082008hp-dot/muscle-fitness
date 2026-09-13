import type { ConfidenceLevel, TraceableDecision } from "@/lib/dante-core/types";
import type { ExposureTypeDefinition, OutcomeTypeDefinition } from "@/lib/experiments/catalog";

/**
 * N-of-1 Experiment Lab statistics engine (spec Part "5. PERSONAL
 * EXPERIMENT LAB"). Deliberately simple, deliberately honest: this
 * compares two groups of the user's OWN days (exposed vs. not), never
 * claims a p-value or "significance" a personal diary can't support,
 * and always states the association-vs-causation distinction
 * explicitly. Confidence is capped at "moderate" — an n-of-1 self-
 * tracking comparison never earns "high" in this codebase's vocabulary.
 */

export type ExperimentDayObservation = {
  date: string;
  exposurePresent: boolean;
  /** Null when the outcome couldn't be computed for that day (e.g. no check-in logged) — excluded from analysis, not treated as zero. */
  outcomeValue: number | null;
};

export type ExperimentGroupSummary = {
  n: number;
  mean: number | null;
  standardDeviation: number | null;
};

export type ExperimentAnalysis = {
  exposedGroup: ExperimentGroupSummary;
  unexposedGroup: ExperimentGroupSummary;
  /** exposedGroup.mean - unexposedGroup.mean. Null unless both groups have a mean. */
  difference: number | null;
  totalDaysConsidered: number;
  daysExcludedMissingOutcome: number;
};

const MIN_GROUP_SIZE_FOR_ANY_READ = 2;
const MIN_GROUP_SIZE_FOR_MODERATE_CONFIDENCE = 5;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarize(values: number[]): ExperimentGroupSummary {
  if (values.length === 0) {
    return { n: 0, mean: null, standardDeviation: null };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (values.length === 1) {
    return { n: 1, mean: round(mean), standardDeviation: null };
  }

  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);

  return { n: values.length, mean: round(mean), standardDeviation: round(Math.sqrt(variance)) };
}

export function analyzeExperimentObservations(observations: ExperimentDayObservation[]): ExperimentAnalysis {
  const withOutcome = observations.filter((o) => o.outcomeValue !== null);
  const daysExcludedMissingOutcome = observations.length - withOutcome.length;

  const exposedValues = withOutcome.filter((o) => o.exposurePresent).map((o) => o.outcomeValue as number);
  const unexposedValues = withOutcome.filter((o) => !o.exposurePresent).map((o) => o.outcomeValue as number);

  const exposedGroup = summarize(exposedValues);
  const unexposedGroup = summarize(unexposedValues);

  const difference =
    exposedGroup.mean !== null && unexposedGroup.mean !== null ? round(exposedGroup.mean - unexposedGroup.mean) : null;

  return {
    exposedGroup,
    unexposedGroup,
    difference,
    totalDaysConsidered: observations.length,
    daysExcludedMissingOutcome,
  };
}

function standardErrorOfDifference(exposed: ExperimentGroupSummary, unexposed: ExperimentGroupSummary): number | null {
  if (exposed.n < 2 || unexposed.n < 2 || exposed.standardDeviation === null || unexposed.standardDeviation === null) {
    return null;
  }

  return Math.sqrt((exposed.standardDeviation ** 2) / exposed.n + (unexposed.standardDeviation ** 2) / unexposed.n);
}

function confidenceFor(analysis: ExperimentAnalysis): ConfidenceLevel {
  if (analysis.exposedGroup.n < MIN_GROUP_SIZE_FOR_MODERATE_CONFIDENCE || analysis.unexposedGroup.n < MIN_GROUP_SIZE_FOR_MODERATE_CONFIDENCE) {
    return "low";
  }

  const se = standardErrorOfDifference(analysis.exposedGroup, analysis.unexposedGroup);

  if (se === null || se === 0 || analysis.difference === null) return "low";

  const z = Math.abs(analysis.difference / se);

  // Capped at "moderate" — an n-of-1 personal comparison never earns "high" here, regardless of z.
  return z >= 1.5 ? "moderate" : "low";
}

export function buildExperimentResult(
  exposure: ExposureTypeDefinition,
  outcome: OutcomeTypeDefinition,
  question: string,
  observations: ExperimentDayObservation[],
): TraceableDecision<ExperimentAnalysis> {
  const analysis = analyzeExperimentObservations(observations);
  const confidence = confidenceFor(analysis);

  const insufficientData =
    analysis.exposedGroup.n < MIN_GROUP_SIZE_FOR_ANY_READ || analysis.unexposedGroup.n < MIN_GROUP_SIZE_FOR_ANY_READ;

  const recommendation = insufficientData
    ? `Not enough days yet to compare "${exposure.label}" against "${outcome.label}".`
    : analysis.difference === null || Math.abs(analysis.difference) < 0.001
      ? `No meaningful difference in ${outcome.label.toLowerCase()} between exposed and unexposed days so far.`
      : `On days with ${exposure.label.toLowerCase()}, ${outcome.label.toLowerCase()} was ${analysis.difference > 0 ? "higher" : "lower"} by ${Math.abs(analysis.difference)}${outcome.unit} on average.`;

  const why = [
    `${analysis.exposedGroup.n} day(s) with "${exposure.label}" present, averaging ${analysis.exposedGroup.mean ?? "—"}${outcome.unit} ${outcome.label.toLowerCase()}.`,
    `${analysis.unexposedGroup.n} day(s) without it, averaging ${analysis.unexposedGroup.mean ?? "—"}${outcome.unit} ${outcome.label.toLowerCase()}.`,
  ];

  const limitations = [
    "This shows an ASSOCIATION in your own logged days, not a proven cause — many other factors (stress, other food, training, life) vary day to day and aren't controlled for.",
    "A personal N-of-1 comparison like this can never reach the same confidence as a controlled study — treat any pattern here as a hypothesis to keep watching, not a conclusion.",
  ];

  if (insufficientData) {
    limitations.push("At least a handful of days in EACH group are needed before any pattern is meaningful.");
  }

  if (analysis.daysExcludedMissingOutcome > 0) {
    limitations.push(
      `${analysis.daysExcludedMissingOutcome} day(s) in the window had no ${outcome.label.toLowerCase()} value logged and were excluded.`,
    );
  }

  const dataUsed: Record<string, string | number | null> = {
    exposedDays: analysis.exposedGroup.n,
    unexposedDays: analysis.unexposedGroup.n,
    exposedMean: analysis.exposedGroup.mean,
    unexposedMean: analysis.unexposedGroup.mean,
    difference: analysis.difference,
    totalDaysConsidered: analysis.totalDaysConsidered,
  };

  return {
    recommendation,
    decision: analysis,
    why,
    dataUsed,
    confidence,
    sources: [],
    limitations,
  };
}
