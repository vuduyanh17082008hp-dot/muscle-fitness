import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { WeeklyMuscleAnalytics } from "@/lib/training/weekly-analytics";
import type { PersonalBaseline } from "@/lib/training/baseline";
import type { TrainingRecommendationExplanation } from "@/lib/training/recommendations";

/**
 * Unified Athlete State (spec §4).
 *
 * Every field is explicitly nullable — missing information stays
 * `null`/`"insufficient_data"` rather than being silently zeroed, so
 * downstream consumers (dashboard, Dante, Weekly Review) can render
 * "not available" instead of a fabricated number.
 */
export type AthleteState = {
  generatedAt: string;
  dataWindow: {
    startDate: string;
    endDate: string;
    weeksOfHistory: number;
  };

  profile: {
    goal: string | null;
    experience: string | null;
    trainingFrequency: number | null;
    priorityMuscles: string[];
  };

  training: {
    hasAnyLoggedData: boolean;
    muscles: Array<{
      muscle: CanonicalMuscle;
      analytics: WeeklyMuscleAnalytics;
      baseline: PersonalBaseline;
      recommendation: TrainingRecommendationExplanation;
    }>;
    /** Exercise id -> display name, so UI/Dante can label contribution breakdowns without a second query. */
    exerciseNames: Record<string, string>;
  };

  recovery: {
    available: boolean;
    score: number | null;
    status: string | null;
    trainingLoadState: "green" | "amber" | "red" | null;
    sevenDayAverageScore: number | null;
  };

  nutrition: {
    available: boolean;
    calorieTarget: number | null;
    proteinTargetGrams: number | null;
    carbsTargetGrams: number | null;
    fatTargetGrams: number | null;
  };

  progress: {
    // Deferred to a later phase — kept as an explicit placeholder so
    // consumers always see the same shape rather than an undefined field.
    status: "not_yet_implemented";
  };
};
