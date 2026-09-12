import { summarizeBenchmark } from "@/lib/setvision/benchmark/compare";
import type { GroundTruthAnnotation } from "@/lib/setvision/benchmark/types";
import type { SetVisionAnalysis } from "@/lib/setvision/types";
import type { SetVisionEvaluation } from "@/lib/ai-evaluation/types";

/**
 * SetVision demo evaluation (spec Part C §17-18).
 *
 * DEMO DATA, clearly labeled as such throughout: no real annotated
 * video dataset exists yet (see docs/setvision.md "Benchmarking").
 * What IS real here is the CODE PATH — this calls the actual
 * production benchmark comparison functions
 * (lib/setvision/benchmark/compare.ts), it just feeds them
 * hand-constructed synthetic analysis/ground-truth pairs instead of
 * real annotated footage. The moment a real dataset exists, swap
 * these fixtures for real (SetVisionAnalysis, GroundTruthAnnotation)
 * pairs collected via the ground-truth annotation tool
 * (/dashboard/workouts/setvision/annotate) and this function's output
 * becomes real data — no other code changes needed.
 */

function demoAnalysis(overrides: Partial<SetVisionAnalysis>): SetVisionAnalysis {
  return {
    exercise: "squat",
    exerciseClassification: { exercise: "squat", confidence: 0.88, signals: [] },
    reps: 5,
    romConsistency: 0.9,
    averageEccentricTime: 1.6,
    averageConcentricTime: 0.8,
    velocity: {
      calibrated: false,
      unit: "torso-lengths/s",
      perRep: [],
      mean: 0.42,
      peak: 0.5,
      final: 0.34,
      velocityLoss: 0.19,
    },
    technique: { romConsistency: 0.9, tempoConsistency: 0.85, barPathConsistency: 0.88, asymmetryDeg: 4.2 },
    confidence: 0.82,
    perRep: { rom: [], tempo: [] },
    limitations: [],
    ...overrides,
  };
}

const DEMO_ENTRIES: Array<{ videoId: string; groundTruth: GroundTruthAnnotation; analysis: SetVisionAnalysis }> = [
  {
    videoId: "demo-squat-1",
    groundTruth: {
      videoId: "demo-squat-1",
      exercise: "squat",
      repBoundariesMs: [0, 1, 2, 3, 4].map((i) => ({ startMs: i * 2000, endMs: i * 2000 + 1800 })),
      annotatedBy: "demo-fixture",
      annotatedAt: "2026-01-01T00:00:00Z",
    },
    analysis: demoAnalysis({ exercise: "squat", reps: 5, exerciseClassification: { exercise: "squat", confidence: 0.88, signals: [] } }),
  },
  {
    videoId: "demo-bench-1",
    groundTruth: {
      videoId: "demo-bench-1",
      exercise: "bench_press",
      repBoundariesMs: [0, 1, 2, 3, 4, 5].map((i) => ({ startMs: i * 2200, endMs: i * 2200 + 2000 })),
      annotatedBy: "demo-fixture",
      annotatedAt: "2026-01-01T00:00:00Z",
    },
    // Deliberately off-by-one rep vs ground truth, to demo a real
    // (nonzero) error rather than a suspiciously perfect fixture.
    analysis: demoAnalysis({
      exercise: "bench_press",
      reps: 5,
      exerciseClassification: { exercise: "bench_press", confidence: 0.79, signals: [] },
    }),
  },
  {
    videoId: "demo-deadlift-1",
    groundTruth: {
      videoId: "demo-deadlift-1",
      exercise: "deadlift",
      repBoundariesMs: [0, 1, 2].map((i) => ({ startMs: i * 3000, endMs: i * 3000 + 2600 })),
      annotatedBy: "demo-fixture",
      annotatedAt: "2026-01-01T00:00:00Z",
    },
    analysis: demoAnalysis({
      exercise: "deadlift",
      reps: 3,
      exerciseClassification: { exercise: "deadlift", confidence: 0.91, signals: [] },
      velocity: {
        calibrated: false,
        unit: "torso-lengths/s",
        perRep: [],
        mean: 0.3,
        peak: 0.38,
        final: 0.22,
        velocityLoss: 0.42,
      },
    }),
  },
];

const DEMO_LATENCY_MS = [820, 950, 1100];

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function evaluateSetVisionDemo(): SetVisionEvaluation {
  const summary = summarizeBenchmark(DEMO_ENTRIES);

  const repAccuracy =
    summary.repCount.length > 0
      ? summary.repCount.filter((r) => r.exact).length / summary.repCount.length
      : null;

  const classificationAccuracy =
    summary.classification.length > 0
      ? summary.classification.filter((c) => c.correct).length / summary.classification.length
      : null;

  const velocityMaes = summary.velocity
    .map((v) => v.meanAbsoluteErrorMps)
    .filter((v): v is number => v !== null);

  const romMaes = summary.rom
    .map((r) => r.meanAbsoluteErrorPercent)
    .filter((v): v is number => v !== null);

  const note = "DEMO DATA — synthetic fixtures, not real annotated video. See docs/ai-evaluation.md.";

  return {
    repCountAccuracy: { value: repAccuracy !== null ? round(repAccuracy) : null, source: "demo", note },
    exerciseClassificationAccuracy: {
      value: classificationAccuracy !== null ? round(classificationAccuracy) : null,
      source: "demo",
      note,
    },
    romMeanAbsoluteError: {
      value: romMaes.length > 0 ? round(romMaes.reduce((s, v) => s + v, 0) / romMaes.length) : null,
      source: "demo",
      note: romMaes.length > 0 ? note : "No ROM ground-truth labels in this demo fixture set.",
    },
    velocityMeanAbsoluteError: {
      value: velocityMaes.length > 0 ? round(velocityMaes.reduce((s, v) => s + v, 0) / velocityMaes.length) : null,
      source: "demo",
      note: "Demo fixtures are uncalibrated (torso-lengths/s), so no real m/s MAE exists — this stays null honestly rather than comparing incompatible units.",
    },
    averageLatencyMs: {
      value: round(DEMO_LATENCY_MS.reduce((s, v) => s + v, 0) / DEMO_LATENCY_MS.length, 0),
      source: "demo",
      note: "Illustrative processing-time figures, not measured from a real device/browser benchmark run.",
    },
    sampleSize: DEMO_ENTRIES.length,
  };
}
