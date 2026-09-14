import type { AthleteState } from "@/lib/athlete-state/types";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { RecommendationCategory } from "@/lib/training/recommendations";
import type { MuscleInvolvement } from "@/components/training/muscle-map";

/**
 * Dashboard "Muscle Intelligence" view model — derived entirely from
 * `AthleteState.training.muscles`, which itself already aggregates the
 * Fractional Effective Volume Engine + Personal Baseline + Deterministic
 * Recommendation Engine (lib/training/{volume-engine,baseline,recommendations}.ts).
 * No anatomy, thresholds, or exercise data is invented here — this file
 * only reshapes numbers that already exist for display.
 */

export type MuscleIntelligenceExercise = {
  exerciseId: string;
  name: string;
  effectiveSets: number;
};

export type MuscleIntelligenceEntry = {
  muscle: CanonicalMuscle;
  directSets: number;
  totalEffectiveSets: number;
  /** Distinct sessions this week that trained this muscle. */
  frequency: number;
  changePercent: number | null;
  topExercises: MuscleIntelligenceExercise[];
  /** The Deterministic Recommendation Engine's own category — never a fabricated universal "adequate range". */
  status: RecommendationCategory;
  /** Relative tier among THIS user's currently-trained muscles this week, used only to pick a highlight intensity on the body map — not a claim about an evidence-based optimum. */
  exposureTier: MuscleInvolvement;
};

/** Human-readable label for the Recommendation Engine's category — the ONLY validated status vocabulary this product currently has (see lib/training/recommendations.ts). */
export const RECOMMENDATION_LABEL: Record<RecommendationCategory, string> = {
  MAINTAIN: "On Track",
  INCREASE_GRADUALLY: "Room To Grow",
  REDUCE_SLIGHTLY: "Trending High",
  REDISTRIBUTE: "Redistribute Volume",
  MONITOR: "Monitor",
  INSUFFICIENT_DATA: "Insufficient Data",
};

export const RECOMMENDATION_TONE: Record<
  RecommendationCategory,
  "good" | "warning" | "critical" | "info" | "neutral"
> = {
  MAINTAIN: "good",
  INCREASE_GRADUALLY: "info",
  REDUCE_SLIGHTLY: "warning",
  REDISTRIBUTE: "warning",
  MONITOR: "neutral",
  INSUFFICIENT_DATA: "neutral",
};

/**
 * Builds the Muscle Intelligence entries for the dashboard: only
 * muscles with real, completed training volume THIS week (spec: "Use
 * completed workouts only... Do not count planned but unperformed sets
 * as completed exposure"), ranked by total effective sets, split into
 * three relative exposure tiers for the body-map highlight intensity.
 */
export function buildMuscleIntelligence(athleteState: AthleteState): MuscleIntelligenceEntry[] {
  const trained = athleteState.training.muscles.filter(
    (entry) => entry.analytics.currentWeek.totalEffectiveSets > 0,
  );

  const sorted = [...trained].sort(
    (a, b) => b.analytics.currentWeek.totalEffectiveSets - a.analytics.currentWeek.totalEffectiveSets,
  );

  const tierCutoffHigh = Math.ceil(sorted.length / 3);
  const tierCutoffModerate = Math.ceil((sorted.length * 2) / 3);

  return sorted.map((entry, index) => {
    const exposureTier: MuscleInvolvement =
      index < tierCutoffHigh ? "primary" : index < tierCutoffModerate ? "secondary" : "stabilizer";

    const topExercises: MuscleIntelligenceExercise[] = entry.analytics.currentWeek.contributingExercises
      .slice(0, 3)
      .map((contribution) => ({
        exerciseId: contribution.exerciseId,
        name: athleteState.training.exerciseNames[contribution.exerciseId] ?? "Unnamed exercise",
        effectiveSets: contribution.effectiveSets,
      }));

    return {
      muscle: entry.muscle,
      directSets: entry.analytics.currentWeek.directSets,
      totalEffectiveSets: entry.analytics.currentWeek.totalEffectiveSets,
      frequency: entry.analytics.frequency,
      changePercent: entry.analytics.changePercent,
      topExercises,
      status: entry.recommendation.recommendation,
      exposureTier,
    };
  });
}
