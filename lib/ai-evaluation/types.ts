/**
 * AI Evaluation Dashboard types (spec Part C §17-18).
 *
 * Every metric on this dashboard carries its own `source` tag so the
 * UI can render a DEMO DATA / REAL DATA badge next to it — the spec's
 * explicit requirement is "never present seeded values as measured
 * results." Nothing here hides which is which behind a shared page
 * header; each metric is self-describing.
 */

export type MetricSource = "demo" | "real";

export type Metric<T> = {
  value: T;
  source: MetricSource;
  /** One sentence on where this number actually came from. */
  note: string;
};

export type SetVisionEvaluation = {
  repCountAccuracy: Metric<number | null>;
  exerciseClassificationAccuracy: Metric<number | null>;
  romMeanAbsoluteError: Metric<number | null>;
  velocityMeanAbsoluteError: Metric<number | null>;
  averageLatencyMs: Metric<number | null>;
  sampleSize: number;
};

export type HawkerLensEvaluation = {
  classificationAccuracy: Metric<number | null>;
  segmentationDice: Metric<number | null>;
  portionMeanAbsoluteErrorGrams: Metric<number | null>;
  calorieMeanAbsoluteError: Metric<number | null>;
  proteinMeanAbsoluteError: Metric<number | null>;
  sampleSize: number;
};

export type DanteEvaluation = {
  recommendationConsistency: Metric<boolean>;
  safetyLayerTestStatus: Metric<{ passed: number; total: number }>;
  retrievalAccuracy: Metric<null>;
  citationAccuracy: Metric<null>;
  hallucinationTestStatus: Metric<null>;
};

export type SystemEvaluation = {
  apiLatencyMs: Metric<number | null>;
  apiHealthy: Metric<boolean>;
  recentFailures24h: Metric<number>;
  buildTestStatus: Metric<{ label: string }>;
  setvisionAnalysesLogged: Metric<number>;
  hawkerlensScansLogged: Metric<number>;
};

export type AiEvaluationSnapshot = {
  setvision: SetVisionEvaluation;
  hawkerlens: HawkerLensEvaluation;
  dante: DanteEvaluation;
  system: SystemEvaluation;
  generatedAt: string;
};
