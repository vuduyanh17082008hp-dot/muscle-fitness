import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { WeeklyMuscleAnalytics } from "@/lib/training/weekly-analytics";
import type { PersonalBaseline } from "@/lib/training/baseline";
import type { TrainingRecommendationExplanation } from "@/lib/training/recommendations";
import type { BaselineDeviation } from "@/lib/dante-core/personal-baseline";
import type { MuscleRecoveryMapEntry } from "@/lib/dante-core/muscle-recovery-map";
import type { DataFreshnessSignal } from "@/lib/athlete-state/data-freshness";
import type { SetVisionExerciseId } from "@/lib/setvision/types";
import type { RecoveryStatusInput } from "@/lib/training/recommendations";
import type { WearableDailySnapshot } from "@/lib/wearables/types";
import type { WearableConnectionStatus } from "@/lib/wearables/connection-status";

/**
 * Unified Athlete State — the Athlete Digital Twin (spec §4, extended
 * per the "Human Performance system" mission).
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
    heightCm: number | null;
    weightKg: number | null;
    sessionDurationMinutes: number | null;
    availableEquipment: string[];
    physicalLimitations: string | null;
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
    sleepHours: number | null;
    stress: number | null;
    soreness: number | null;
    fatigue: number | null;
    /** True when today's check-in flagged pain/illness — the same safety gate lib/training/progression-engine.ts already enforces. */
    painFlag: boolean;
    /** Raw status code (ready/good/moderate/priority) behind the human-readable `status` label above — needed by engines that gate on it directly, e.g. lib/training/progression-engine.ts. */
    recoveryStatusCode: RecoveryStatusInput;
  };

  nutrition: {
    available: boolean;
    calorieTarget: number | null;
    proteinTargetGrams: number | null;
    carbsTargetGrams: number | null;
    fatTargetGrams: number | null;
  };

  setVision: {
    available: boolean;
    latestExercise: SetVisionExerciseId | null;
    analysesLast30Days: number;
    romConsistencyDeviation: BaselineDeviation | null;
    tempoConsistencyDeviation: BaselineDeviation | null;
  };

  /**
   * WearableProvider -> normalize -> Athlete Digital Twin (spec Part
   * "1. WEARABLE PROVIDER LAYER"). `latestDay` is the most recent day
   * the provider actually has data for — which may be OLDER than
   * today (see `connectionStatus`); this is a lean summary for the
   * Twin, not the full historical series (the Health Radar loads its
   * own richer window separately when it needs one). `available` is
   * false for every real user today: no real provider is implemented
   * yet, only the demo one a user can opt into (lib/demo/settings.ts)
   * — see lib/wearables/registry.ts.
   */
  wearable: {
    available: boolean;
    isDemo: boolean;
    providerLabel: string | null;
    latestDay: WearableDailySnapshot | null;
    /** not_connected/no_data/stale/connected/demo — see lib/wearables/connection-status.ts. Distinguishes "never connected" from "connected but hasn't synced recently", which `available` alone cannot. */
    connectionStatus: WearableConnectionStatus;
    /** Null when there's no data at all. */
    daysSinceLastData: number | null;
  };

  /** Cross-domain signals computed FROM the sections above — never a second independent read of raw data. */
  derived: {
    baselineDeviations: {
      sleep: BaselineDeviation;
      recoveryScore: BaselineDeviation;
      /** Whole-body training load: aggregated from the SAME per-muscle baselines in `training.muscles`. */
      trainingLoad: BaselineDeviation;
    };
    muscleRecoveryMap: MuscleRecoveryMapEntry[];
    /** 0-1. Simple average of every confidence figure that actually had a basis (baselines + muscle recovery map) — an honest "how much of this state is well-grounded", not a precision claim. */
    overallConfidence: number;
    /** Which top-level sections have no real data at all yet, e.g. ["recovery", "setVision"]. */
    missingData: string[];
  };

  dataFreshness: {
    recovery: DataFreshnessSignal;
    nutrition: DataFreshnessSignal;
    training: DataFreshnessSignal;
    setVision: DataFreshnessSignal;
    bodyweight: DataFreshnessSignal;
  };

  progress: {
    // Deferred to a later phase — kept as an explicit placeholder so
    // consumers always see the same shape rather than an undefined field.
    status: "not_yet_implemented";
  };
};
