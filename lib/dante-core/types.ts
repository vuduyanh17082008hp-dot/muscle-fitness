import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { PerformanceTrend } from "@/lib/training/performance";
import type {
  RecoveryScoreResult,
  TrainingLoadSummary,
} from "@/lib/recovery/types";

/**
 * Dante Core shared types (spec Part A).
 *
 * Every input here is nullable/optional by design: Dante Core must
 * degrade gracefully when data is missing rather than fabricate it.
 * These types intentionally reuse the existing deterministic engines'
 * output types (RecoveryScoreResult, TrainingLoadSummary,
 * PerformanceTrend, CanonicalMuscle) instead of redefining them, so
 * there is exactly one definition of "what a recovery score is" in
 * the codebase.
 */

export type ConfidenceLevel = "low" | "moderate" | "high";

/** Confidence expressed as a 0-1 fraction, used where the spec asks for a numeric confidence (e.g. readiness, SetVision). */
export type ConfidenceFraction = number;

/* =========================================================
   READINESS
========================================================= */

export type SystemicFatigueLevel = "low" | "moderate" | "high" | "unknown";

export type MuscleRecoveryEstimate = {
  muscle: CanonicalMuscle;
  /** 0-100. Null when there is no recent-training signal to estimate from. */
  recoveryPercent: number | null;
  daysSinceTrained: number | null;
  /** Documents which branch of the heuristic produced this estimate. */
  basis:
    | "time_since_trained"
    | "no_recent_training_data"
    | "no_training_history";
};

export type ReadinessEngineInput = {
  recoveryScore: RecoveryScoreResult;
  trainingLoad: TrainingLoadSummary | null;
  /** One entry per muscle the caller wants a recovery estimate for. */
  muscles: Array<{
    muscle: CanonicalMuscle;
    lastTrainedDate: string | null;
    /** This week's effective sets for the muscle, if known. */
    recentEffectiveSets: number | null;
    /** The lifter's own typical weekly volume for the muscle (personal baseline), if known. */
    typicalWeeklyVolume: number | null;
  }>;
  now?: Date;
};

export type ReadinessResult = {
  /** 0-100. Null only when neither a recovery score nor a training-load signal exists. */
  readinessScore: number | null;
  systemicFatigue: SystemicFatigueLevel;
  muscleRecovery: MuscleRecoveryEstimate[];
  limitingFactors: string[];
  /** 0-1. How much of the input this estimate actually had to work with. */
  confidence: ConfidenceFraction;
  /** Human-readable note on how readinessScore was derived, for traceability. */
  method: string;
};

/* =========================================================
   PERFORMANCE TREND (Dante Core wrapper around lib/training/performance.ts)
========================================================= */

export type SetVisionTrendPoint = {
  date: string;
  velocityLoss: number | null;
  romConsistency: number | null;
};

export type TrendEvaluation = {
  trend: PerformanceTrend;
  changePercent: number | null;
  sampleSize: number;
  /** Null when no SetVision history was supplied, or it had nothing to add. */
  setVisionNote: string | null;
};

/* =========================================================
   AUTOREGULATION
========================================================= */

export type PlannedSet = {
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  /** Null for bodyweight/unloaded exercises. */
  targetLoadKg: number | null;
  targetRir: number | null;
};

/** A single SetVision-derived signal for the CURRENT session (e.g. velocity loss observed on earlier sets today). Distinct from SetVisionTrendPoint, which is historical/cross-session. */
export type SetVisionSessionSignal = {
  /** 0-1 fraction. E.g. 0.31 = 31% velocity loss vs. the session's fastest rep. */
  velocityLoss: number | null;
  velocityCalibrated: boolean;
  romConsistency: number | null;
  confidence: ConfidenceFraction | null;
};

export type AutoregulationInput = {
  exerciseName: string;
  planned: PlannedSet;
  readiness: ReadinessResult;
  /** Canonical muscles this exercise primarily trains — used to pull the relevant muscleRecovery entries out of `readiness`. */
  relevantMuscles: CanonicalMuscle[];
  trend: TrendEvaluation | null;
  setVision: SetVisionSessionSignal | null;
  /** True when a recent check-in or session flagged pain/illness (yes, not "no"). Always overrides performance/readiness signals. */
  recentPainFlag: boolean;
};

export type AutoregulationDecisionCode =
  | "proceed_as_planned"
  | "reduce_load"
  | "reduce_volume"
  | "reduce_load_and_volume"
  | "modify_session"
  | "deload_session"
  | "rest_recommended";

export type SessionRecommendation = "normal" | "modified" | "deload" | "rest";

export type AutoregulationDecision = {
  exercise: string;
  plannedLoadKg: number | null;
  recommendedLoadKg: number | null;
  plannedSets: number;
  recommendedSets: number;
  /** Fraction, e.g. -0.05 = a 5% reduction. Null for bodyweight exercises with no load to scale. */
  loadAdjustmentPercent: number | null;
  /** Fraction, e.g. -0.25 = a 25% reduction (usually driven by the discrete set-count change). */
  volumeAdjustmentPercent: number | null;
  decision: AutoregulationDecisionCode;
  sessionRecommendation: SessionRecommendation;
  reasons: string[];
  confidence: ConfidenceLevel;
  /** True when a safety gate (pain flag) determined the outcome regardless of performance signals. */
  gated: boolean;
};

/* =========================================================
   DECISION TRACEABILITY (spec §6, §9)
========================================================= */

export type KnowledgeSourceRef = {
  id: string;
  title: string;
  authors: string;
  source: string;
  year: number;
  url: string | null;
};

export type TraceableDecision<TDecision> = {
  /** Short, human-readable label for the recommendation, e.g. "Reduce bench volume by 25%." */
  recommendation: string;
  decision: TDecision;
  /** The "WHY" — one bullet per reason, already present on the decision object, surfaced here for UI rendering. */
  why: string[];
  /** The "DATA USED" panel — flat, label -> value, safe to render directly. */
  dataUsed: Record<string, string | number | null>;
  confidence: ConfidenceLevel;
  sources: KnowledgeSourceRef[];
};
