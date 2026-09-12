import { summarizeHawkerLensBenchmark } from "@/lib/hawkerlens/benchmark/compare";
import type { BenchmarkEntry } from "@/lib/hawkerlens/benchmark/types";
import type { HawkerLensEvaluation } from "@/lib/ai-evaluation/types";

/**
 * HawkerLens demo evaluation (spec Part C §17-18) — same honesty rule
 * as setvision-demo.ts: real benchmark CODE
 * (lib/hawkerlens/benchmark/compare.ts), synthetic DATA. No real
 * annotated Singapore-hawker-food photo dataset exists yet (see
 * docs/hawkerlens.md "Benchmarking").
 */

const DEMO_ENTRIES: BenchmarkEntry[] = [
  {
    photoId: "demo-chicken-rice-1",
    groundTruth: {
      photoId: "demo-chicken-rice-1",
      dish: "chicken_rice",
      components: [
        { name: "rice", grams: 220 },
        { name: "chicken", grams: 130 },
        { name: "cucumber", grams: 30 },
      ],
      totalCalories: 700,
      totalProtein: 40,
      annotatedBy: "demo-fixture",
      annotatedAt: "2026-01-01T00:00:00Z",
    },
    result: {
      status: "ok",
      dish: "chicken_rice",
      dishClassification: { dish: "chicken_rice", confidence: 0.86, signals: [] },
      imageQuality: { usable: true, issues: [], qualityScore: 1, notes: null },
      components: [
        { name: "rice", estimatedGrams: 210, confidence: 0.7 },
        { name: "chicken", estimatedGrams: 140, confidence: 0.65 },
      ],
      componentDetail: [],
      nutrition: {
        calories: { estimate: 665, lower: 590, upper: 740 },
        protein: { estimate: 38, lower: 33, upper: 43 },
        carbs: { estimate: 78, lower: 68, upper: 88 },
        fat: { estimate: 24, lower: 18, upper: 30 },
      },
      uncertainty: { modelConfidence: 0.86, portionConfidence: 0.68, nutritionConfidence: 0.6 },
      overallConfidence: 0.73,
      message: null,
    },
  },
  {
    photoId: "demo-laksa-1",
    groundTruth: {
      photoId: "demo-laksa-1",
      dish: "laksa",
      components: [
        { name: "noodles", grams: 350 },
        { name: "prawns", grams: 40 },
        { name: "fish cake", grams: 30 },
      ],
      totalCalories: 620,
      totalProtein: 25,
      annotatedBy: "demo-fixture",
      annotatedAt: "2026-01-01T00:00:00Z",
    },
    result: {
      status: "ok",
      // Deliberately misclassified in this fixture, to demo a real
      // confusion-matrix entry rather than a suspiciously perfect one.
      dish: "mee_goreng",
      dishClassification: { dish: "mee_goreng", confidence: 0.52, signals: [] },
      imageQuality: { usable: true, issues: [], qualityScore: 0.9, notes: null },
      components: [{ name: "noodles", estimatedGrams: 300, confidence: 0.5 }],
      componentDetail: [],
      nutrition: {
        calories: { estimate: 540, lower: 470, upper: 610 },
        protein: { estimate: 18, lower: 14, upper: 22 },
        carbs: { estimate: 70, lower: 60, upper: 80 },
        fat: { estimate: 18, lower: 13, upper: 23 },
      },
      uncertainty: { modelConfidence: 0.52, portionConfidence: 0.5, nutritionConfidence: 0.5 },
      overallConfidence: 0.51,
      message: null,
    },
  },
];

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function evaluateHawkerLensDemo(): HawkerLensEvaluation {
  const summary = summarizeHawkerLensBenchmark(DEMO_ENTRIES);

  const classificationAccuracy =
    summary.classification.length > 0
      ? summary.classification.filter((c) => c.correct).length / summary.classification.length
      : null;

  const diceValues = summary.segmentation.map((s) => s.dice).filter((v): v is number => v !== null);
  const portionMaes = summary.portion
    .map((p) => p.meanAbsoluteErrorGrams)
    .filter((v): v is number => v !== null);
  const calorieErrors = summary.calories
    .map((c) => c.absoluteError)
    .filter((v): v is number => v !== null);
  const proteinErrors = summary.protein
    .map((p) => p.absoluteError)
    .filter((v): v is number => v !== null);

  const note = "DEMO DATA — synthetic fixtures, not real annotated photos. See docs/ai-evaluation.md.";

  return {
    classificationAccuracy: {
      value: classificationAccuracy !== null ? round(classificationAccuracy) : null,
      source: "demo",
      note,
    },
    segmentationDice: {
      value: diceValues.length > 0 ? round(diceValues.reduce((s, v) => s + v, 0) / diceValues.length) : null,
      source: "demo",
      note: "Set-overlap proxy over component names, not pixel-mask IoU — see docs/hawkerlens.md §6 limitation.",
    },
    portionMeanAbsoluteErrorGrams: {
      value: portionMaes.length > 0 ? round(portionMaes.reduce((s, v) => s + v, 0) / portionMaes.length, 0) : null,
      source: "demo",
      note,
    },
    calorieMeanAbsoluteError: {
      value: calorieErrors.length > 0 ? round(calorieErrors.reduce((s, v) => s + v, 0) / calorieErrors.length, 0) : null,
      source: "demo",
      note,
    },
    proteinMeanAbsoluteError: {
      value: proteinErrors.length > 0 ? round(proteinErrors.reduce((s, v) => s + v, 0) / proteinErrors.length, 0) : null,
      source: "demo",
      note,
    },
    sampleSize: DEMO_ENTRIES.length,
  };
}
