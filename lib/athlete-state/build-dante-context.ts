import type { AthleteState } from "@/lib/athlete-state/types";
import type { DanteMemory } from "@/lib/dante-core/memory";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";

/**
 * Context Engine (spec Part "6. CONTEXT ENGINE").
 *
 * The ONE function that turns the Athlete Digital Twin into what
 * Dante actually receives: current state, meaningful trends, baseline
 * deviations, preferences and freshness/confidence — never a raw
 * database row. This is a pure, synchronous transform (no I/O of its
 * own); every value it emits was already computed by buildAthleteState.
 *
 * `focus` trims which sections are included so a training question
 * doesn't pay the token cost of nutrition/SetVision detail it will
 * never use, and vice versa — "meaningful trends" only, not
 * everything, on every request.
 */

export type DanteContextFocus = "training" | "nutrition" | "recovery" | "general";

export type UserPreferencesRow = {
  food_preferences: string[] | null;
  excluded_foods: string[] | null;
  allergies: string[] | null;
  sleep_hours: number | null;
  stress_level: string | null;
  preferred_training_time: string | null;
};

export type DanteContext = {
  profile: {
    goal: string | null;
    experience: string | null;
    trainingFrequencyPerWeek: number | null;
    sessionDurationMinutes: number | null;
    heightCm: number | null;
    weightKg: number | null;
    priorityMuscles: string[];
    availableEquipment: string[];
    physicalLimitations: string | null;
  };

  dietaryPreferences: {
    foodPreferences: string[];
    excludedFoods: string[];
    allergies: string[];
    typicalSleepHours: number | null;
    stressLevel: string | null;
    preferredTrainingTime: string | null;
  };

  /** User-authored, user-editable — see lib/dante-core/memory.ts. Never Dante's own hidden notes. */
  memory: DanteMemory;

  currentState: {
    readinessScore: number | null;
    recoveryStatus: string | null;
    nutritionAdherencePercent: number | null;
  } | null;

  /** Only included when `focus` includes recovery/general, and only when a real baseline exists. */
  baselineDeviations: AthleteState["derived"]["baselineDeviations"] | null;

  /** Only the muscles that are NOT simply "well recovered with nothing to say" — keeps token footprint down. */
  notableMuscleRecovery: AthleteState["derived"]["muscleRecoveryMap"] | null;

  setVision: AthleteState["setVision"] | null;

  dataFreshness: AthleteState["dataFreshness"];

  /** 0-1, the SAME overallConfidence the Digital Twin computed — never re-derived here. */
  confidence: number;

  missingData: string[];
};

function nonEmpty(values: string[] | null | undefined): string[] {
  return values ?? [];
}

export function buildDanteContext(
  athleteState: AthleteState,
  memory: DanteMemory,
  preferences: UserPreferencesRow | null,
  focus: DanteContextFocus = "general",
): DanteContext {
  const includeRecoveryDetail = focus === "recovery" || focus === "general";
  const includeTrainingDetail = focus === "training" || focus === "general";

  const notableMuscleRecovery = includeTrainingDetail
    ? athleteState.derived.muscleRecoveryMap.filter(
        (entry) => entry.recoveryState !== "well_recovered",
      )
    : null;

  return {
    profile: {
      goal: athleteState.profile.goal,
      experience: athleteState.profile.experience,
      trainingFrequencyPerWeek: athleteState.profile.trainingFrequency,
      sessionDurationMinutes: athleteState.profile.sessionDurationMinutes,
      heightCm: athleteState.profile.heightCm,
      weightKg: athleteState.profile.weightKg,
      priorityMuscles: athleteState.profile.priorityMuscles.map(
        (muscle) => MUSCLE_DISPLAY_NAME[muscle as keyof typeof MUSCLE_DISPLAY_NAME] ?? muscle,
      ),
      availableEquipment: athleteState.profile.availableEquipment,
      physicalLimitations: athleteState.profile.physicalLimitations,
    },

    dietaryPreferences: {
      foodPreferences: nonEmpty(preferences?.food_preferences),
      excludedFoods: nonEmpty(preferences?.excluded_foods),
      allergies: nonEmpty(preferences?.allergies),
      typicalSleepHours: preferences?.sleep_hours ?? null,
      stressLevel: preferences?.stress_level ?? null,
      preferredTrainingTime: preferences?.preferred_training_time ?? null,
    },

    memory,

    currentState: includeRecoveryDetail
      ? {
          readinessScore: athleteState.recovery.score,
          recoveryStatus: athleteState.recovery.status,
          nutritionAdherencePercent: null, // populated by the caller from today's food log when relevant — not duplicated here
        }
      : null,

    baselineDeviations: includeRecoveryDetail ? athleteState.derived.baselineDeviations : null,

    notableMuscleRecovery,

    setVision: includeTrainingDetail ? athleteState.setVision : null,

    dataFreshness: athleteState.dataFreshness,

    confidence: athleteState.derived.overallConfidence,

    missingData: athleteState.derived.missingData,
  };
}
