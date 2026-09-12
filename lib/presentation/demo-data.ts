/**
 * Presentation demo data (spec Part E §26, §29, §30).
 *
 * Every value here is a hand-authored DEMO fixture, not live user
 * data — the presentation route must render identically whether
 * Supabase, the Groq API, or the network itself is reachable at all
 * (spec §30: "Presentation mode must work even if Supabase is
 * unavailable / network fails / AI API fails / TTS API fails").
 *
 * These fixtures reuse the REAL production types
 * (SetVisionAnalysis, HawkerLensResult, ReadinessResult,
 * AutoregulationDecision, TraceableDecision) so the same UI
 * components used in the actual product (SetVisionResultsPanel,
 * DecisionCard) render them — the presentation shows real UI, fed
 * fake data, not a separate mocked-up "demo UI."
 */

import type { SetVisionAnalysis } from "@/lib/setvision/types";
import type { HawkerLensResult } from "@/lib/hawkerlens/types";
import type {
  AutoregulationDecision,
  ReadinessResult,
  TraceableDecision,
} from "@/lib/dante-core/types";

export const DEMO_SETVISION_ANALYSIS: SetVisionAnalysis = {
  exercise: "bench_press",
  exerciseClassification: { exercise: "bench_press", confidence: 0.91, signals: ["Torso near-horizontal, consistent with lying on a bench."] },
  reps: 4,
  romConsistency: 0.93,
  averageEccentricTime: 1.9,
  averageConcentricTime: 0.85,
  velocity: {
    calibrated: false,
    unit: "torso-lengths/s",
    perRep: [
      { repNumber: 1, meanSpeed: 0.58 },
      { repNumber: 2, meanSpeed: 0.51 },
      { repNumber: 3, meanSpeed: 0.44 },
      { repNumber: 4, meanSpeed: 0.4 },
    ],
    mean: 0.48,
    peak: 0.58,
    final: 0.4,
    velocityLoss: 0.31,
  },
  technique: { romConsistency: 0.93, tempoConsistency: 0.88, barPathConsistency: 0.9, asymmetryDeg: null },
  confidence: 0.87,
  perRep: {
    rom: [
      { repNumber: 1, romPercent: 98 },
      { repNumber: 2, romPercent: 96 },
      { repNumber: 3, romPercent: 94 },
      { repNumber: 4, romPercent: 91 },
    ],
    tempo: [
      { repNumber: 1, eccentricSec: 1.7, pauseSec: 0.2, concentricSec: 0.7 },
      { repNumber: 2, eccentricSec: 1.8, pauseSec: 0.2, concentricSec: 0.8 },
      { repNumber: 3, eccentricSec: 1.9, pauseSec: 0.3, concentricSec: 0.9 },
      { repNumber: 4, eccentricSec: 2.1, pauseSec: 0.3, concentricSec: 1.0 },
    ],
  },
  limitations: [],
};

export const DEMO_HAWKERLENS_RESULT: HawkerLensResult = {
  status: "ok",
  dish: "chicken_rice",
  dishClassification: { dish: "chicken_rice", confidence: 0.89, signals: [] },
  imageQuality: { usable: true, issues: [], qualityScore: 1, notes: null },
  components: [
    { name: "Hainanese-style oily rice", estimatedGrams: 215, confidence: 0.74 },
    { name: "Poached chicken with skin", estimatedGrams: 128, confidence: 0.7 },
    { name: "Chili sauce", estimatedGrams: 14, confidence: 0.6 },
    { name: "Cucumber garnish", estimatedGrams: 28, confidence: 0.65 },
  ],
  componentDetail: [],
  nutrition: {
    calories: { estimate: 680, lower: 610, upper: 750 },
    protein: { estimate: 42, lower: 37, upper: 47 },
    carbs: { estimate: 76, lower: 66, upper: 86 },
    fat: { estimate: 25, lower: 19, upper: 31 },
  },
  uncertainty: { modelConfidence: 0.89, portionConfidence: 0.68, nutritionConfidence: 0.6 },
  overallConfidence: 0.81,
  message: null,
};

export const DEMO_READINESS: ReadinessResult = {
  readinessScore: 68,
  systemicFatigue: "high",
  muscleRecovery: [
    { muscle: "chest", recoveryPercent: 58, daysSinceTrained: 1, basis: "time_since_trained" },
    { muscle: "latissimus_dorsi", recoveryPercent: 87, daysSinceTrained: 3, basis: "time_since_trained" },
    { muscle: "quadriceps", recoveryPercent: 79, daysSinceTrained: 2, basis: "time_since_trained" },
  ],
  limitingFactors: ["sleep_below_baseline", "chest_recovery_low"],
  confidence: 0.82,
  method: "Demo fixture for presentation mode.",
};

export const DEMO_PLANNED = {
  exerciseName: "Bench Press",
  plannedLoadKg: 85,
  plannedSets: 4,
  plannedRepRange: "6",
};

export const DEMO_AUTOREGULATION_DECISION: AutoregulationDecision = {
  exercise: "Bench Press",
  plannedLoadKg: 85,
  recommendedLoadKg: 80,
  plannedSets: 4,
  recommendedSets: 3,
  loadAdjustmentPercent: -0.06,
  volumeAdjustmentPercent: -0.25,
  decision: "reduce_load_and_volume",
  sessionRecommendation: "modified",
  reasons: [
    "Sleep was below baseline in today's check-in.",
    "Estimated recovery for the muscles this exercise trains is below typical (58%).",
    "SetVision measured a high velocity loss on earlier sets today (31%).",
  ],
  confidence: "high",
  gated: false,
};

export const DEMO_TRACEABLE_DECISION: TraceableDecision<AutoregulationDecision> = {
  recommendation: "Reduce Bench Press load by 6% and volume by 25% (4 → 3 sets).",
  decision: DEMO_AUTOREGULATION_DECISION,
  why: DEMO_AUTOREGULATION_DECISION.reasons,
  dataUsed: {
    readinessScore: 68,
    systemicFatigue: "high",
    plannedLoadKg: 85,
    recommendedLoadKg: 80,
    plannedSets: 4,
    recommendedSets: 3,
    chestRecoveryPercent: 58,
  },
  confidence: "high",
  sources: [],
};

export const DEMO_EXPLANATION =
  "Fatigue exceeded today's target range. Reduce the next set by approximately 5% or terminate the exercise depending on session objectives.";
