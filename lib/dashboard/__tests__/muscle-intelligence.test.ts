import { describe, expect, it } from "vitest";

import { buildMuscleIntelligence } from "@/lib/dashboard/muscle-intelligence";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { WeeklyMuscleAnalytics } from "@/lib/training/weekly-analytics";
import type { PersonalBaseline } from "@/lib/training/baseline";
import type { TrainingRecommendationExplanation } from "@/lib/training/recommendations";
import type { MuscleContributionBreakdownEntry } from "@/lib/training/volume-engine";

function contribution(overrides: Partial<MuscleContributionBreakdownEntry> = {}): MuscleContributionBreakdownEntry {
  return {
    exerciseId: "ex-1",
    role: "primary",
    contribution: 1,
    eligibleSets: 3,
    effectiveSets: 3,
    ...overrides,
  };
}

function analytics(
  muscle: CanonicalMuscle,
  totalEffectiveSets: number,
  contributingExercises: MuscleContributionBreakdownEntry[] = [],
): WeeklyMuscleAnalytics {
  return {
    muscle,
    currentWeek: {
      muscle,
      directSets: totalEffectiveSets,
      indirectRawSets: 0,
      indirectEffectiveSets: 0,
      totalEffectiveSets,
      contributingExercises,
    },
    previousWeek: null,
    changeAbsolute: null,
    changePercent: null,
    frequency: 2,
    rolling4WeekAverage: null,
    rolling8WeekAverage: null,
    lastTrainedDate: "2026-09-12",
  };
}

function baseline(muscle: CanonicalMuscle): PersonalBaseline {
  return { muscle, sampleWeeks: 4, typicalWeeklyVolume: 10, recentRange: { min: 8, max: 12 }, variability: "low" };
}

function recommendation(
  category: TrainingRecommendationExplanation["recommendation"] = "MAINTAIN",
): TrainingRecommendationExplanation {
  return {
    recommendation: category,
    confidence: "moderate",
    inputs: {
      currentEffectiveVolume: 10,
      previousVolume: 10,
      personalBaseline: 10,
      frequency: 2,
      performanceTrend: "insufficient_data",
      recoveryStatus: "good",
    },
    signals: [],
    limitations: [],
    evidenceRefs: [],
    analyticsVersion: 1,
  };
}

function muscleEntry(
  muscle: CanonicalMuscle,
  totalEffectiveSets: number,
  contributingExercises: MuscleContributionBreakdownEntry[] = [],
  category?: TrainingRecommendationExplanation["recommendation"],
): AthleteState["training"]["muscles"][number] {
  return {
    muscle,
    analytics: analytics(muscle, totalEffectiveSets, contributingExercises),
    baseline: baseline(muscle),
    recommendation: recommendation(category),
  };
}

function baseAthleteState(overrides: Partial<AthleteState["training"]> = {}): AthleteState {
  return {
    generatedAt: "2026-09-14T00:00:00.000Z",
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-14", weeksOfHistory: 6 },
    profile: {
      goal: null,
      experience: null,
      trainingFrequency: null,
      priorityMuscles: [],
      heightCm: null,
      weightKg: null,
      sessionDurationMinutes: null,
      availableEquipment: [],
      physicalLimitations: null,
    },
    training: { hasAnyLoggedData: true, muscles: [], exerciseNames: {}, ...overrides },
    recovery: {
      available: false,
      score: null,
      status: null,
      trainingLoadState: null,
      sevenDayAverageScore: null,
      sleepHours: null,
      stress: null,
      soreness: null,
      fatigue: null,
      painFlag: false,
      recoveryStatusCode: null,
    },
    nutrition: { available: false, calorieTarget: null, proteinTargetGrams: null, carbsTargetGrams: null, fatTargetGrams: null },
    setVision: { available: false, latestExercise: null, analysesLast30Days: 0, romConsistencyDeviation: null, tempoConsistencyDeviation: null },
    wearable: { available: false, isDemo: false, providerLabel: null, latestDay: null },
    derived: {
      baselineDeviations: {
        sleep: { current: null, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
        recoveryScore: { current: null, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
        trainingLoad: { current: 0, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
      },
      muscleRecoveryMap: [],
      overallConfidence: 0,
      missingData: [],
    },
    dataFreshness: {
      recovery: { status: "missing", lastUpdated: null, humanReadable: "No data" },
      nutrition: { status: "missing", lastUpdated: null, humanReadable: "No data" },
      training: { status: "missing", lastUpdated: null, humanReadable: "No data" },
      setVision: { status: "missing", lastUpdated: null, humanReadable: "No data" },
      bodyweight: { status: "missing", lastUpdated: null, humanReadable: "No data" },
    },
    progress: { status: "not_yet_implemented" },
  };
}

describe("buildMuscleIntelligence", () => {
  it("excludes muscles with zero completed effective sets this week", () => {
    const state = baseAthleteState({
      muscles: [muscleEntry("chest", 12), muscleEntry("hamstrings", 0)],
    });

    const entries = buildMuscleIntelligence(state);

    expect(entries.map((entry) => entry.muscle)).toEqual(["chest"]);
  });

  it("ranks muscles by total effective sets and assigns relative exposure tiers", () => {
    const state = baseAthleteState({
      muscles: [muscleEntry("chest", 5), muscleEntry("quadriceps", 20), muscleEntry("biceps", 12)],
    });

    const entries = buildMuscleIntelligence(state);

    expect(entries.map((entry) => entry.muscle)).toEqual(["quadriceps", "biceps", "chest"]);
    expect(entries[0].exposureTier).toBe("primary");
    expect(entries[entries.length - 1].exposureTier).toBe("stabilizer");
  });

  it("maps top contributing exercises through the exercise name lookup", () => {
    const state = baseAthleteState({
      muscles: [
        muscleEntry("chest", 9, [
          contribution({ exerciseId: "bench-press", effectiveSets: 6 }),
          contribution({ exerciseId: "incline-press", effectiveSets: 3 }),
        ]),
      ],
      exerciseNames: { "bench-press": "Bench Press", "incline-press": "Incline Press" },
    });

    const entries = buildMuscleIntelligence(state);

    expect(entries[0].topExercises).toEqual([
      { exerciseId: "bench-press", name: "Bench Press", effectiveSets: 6 },
      { exerciseId: "incline-press", name: "Incline Press", effectiveSets: 3 },
    ]);
  });

  it("never invents anatomy or a universal volume range — status comes straight from the Recommendation Engine", () => {
    const state = baseAthleteState({
      muscles: [muscleEntry("chest", 9, [], "REDUCE_SLIGHTLY")],
    });

    const entries = buildMuscleIntelligence(state);

    expect(entries[0].status).toBe("REDUCE_SLIGHTLY");
  });
});
