import type { SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * Technique Patterns — a DELIBERATELY SEPARATE sibling to
 * `dante_observations`/`dante_learned_patterns` (see types.ts's L0-L4
 * doc comment), not a variant stored in the same tables.
 *
 * `dante_observations`/`dante_learned_patterns` model
 * CONTEXT -> INTERVENTION -> OUTCOME: something was deliberately
 * changed, and an outcome was observed afterward. A SetVision analysis
 * has no intervention — it's a raw technique measurement compared
 * against the athlete's OWN recent baseline
 * (`lib/dante-core/personal-baseline.ts::computeBaselineDeviation`,
 * already wired into `lib/setvision/load-setvision-context.ts`).
 * Forcing that into `dante_observations`' shape would mean inventing an
 * `interventionType` for something nobody changed — exactly the
 * fabrication the previous pass correctly refused to do.
 *
 * What genuinely was missing: `loadSetVisionContext` computes a
 * baseline deviation FRESH on every read, but never accumulates it as
 * cross-session evidence the way the intervention/outcome memory does.
 * "Dante has noticed your squat depth consistency has been below your
 * own baseline in 5 of your last 6 sessions" requires persisted,
 * confidence-scored, decaying evidence — this file's job.
 *
 * The CONFIDENCE MATH is intentionally reused, unchanged, from
 * `consolidate.ts` (`computePatternConfidence`, `DECAY_START_DAYS`/
 * `DECAY_FULL_DAYS`) — it's already generic (a function of sampleCount/
 * positiveCount, not of intervention semantics). Only the IDENTITY KEY
 * and the meaning of "positive" differ, which is exactly why this is a
 * new table with its own types rather than a new row shape jammed into
 * the existing one.
 */

export type TechniqueSignalType = "rom_consistency" | "tempo_consistency";

export const TECHNIQUE_SIGNAL_TYPES: readonly TechniqueSignalType[] = [
  "rom_consistency",
  "tempo_consistency",
];

/**
 * Which side of the athlete's own baseline this row is accumulating
 * evidence for. Two rows per (user, exercise, signalType) — one per
 * direction — so a mixed history (some sessions better, some worse)
 * correctly keeps BOTH confidences low rather than forcing one signed
 * number to represent a non-consistent pattern.
 */
export type TechniqueDeviationDirection = "below_baseline" | "above_baseline";

export type TechniquePatternStatus = "active" | "demoted" | "forgotten";

export type DanteTechniquePattern = {
  id: string;
  userId: string;
  exercise: SetVisionExerciseId;
  signalType: TechniqueSignalType;
  direction: TechniqueDeviationDirection;
  status: TechniquePatternStatus;
  /** How many analyses had ENOUGH baseline history to be evaluated at all (i.e. `computeBaselineDeviation` returned a real baseline) — the honest denominator, not just "how many analyses exist." */
  sampleCount: number;
  /** Of `sampleCount` evaluable analyses, how many showed a notable deviation in THIS row's direction. */
  notableCount: number;
  /** 0-1, from `computePatternConfidence(sampleCount, notableCount)` — same formula as dante_learned_patterns, so the same "one outlier can't look like a pattern" guarantee holds. */
  confidence: number;
  /** Deterministic, built from the counters — never LLM-authored. */
  summary: string;
  firstObservedAt: string;
  lastReinforcedAt: string;
};

/** Same evidence floor as dante_learned_patterns (memory-hierarchy/types.ts's MIN_SAMPLES_FOR_PATTERN) — fewer than this many evaluable analyses can never be presented as a pattern, regardless of ratio. */
export const MIN_SAMPLES_FOR_TECHNIQUE_PATTERN = 3;

/**
 * Confidence bar for surfacing a technique pattern to Dante's context.
 * Deliberately LOWER than dante_learned_patterns' POLICY_PROMOTION_CONFIDENCE
 * (0.7) — that bar gates AUTO-APPLYING a training change, a much higher-
 * stakes consequence than Dante mentioning "I've noticed a pattern" in
 * conversation. Nothing auto-applies from a technique pattern; there is
 * no tier/policy promotion here, only "confident enough to mention."
 */
export const TECHNIQUE_PATTERN_SURFACE_CONFIDENCE = 0.5;

/** Same retirement floor as dante_learned_patterns' FORGET_CONFIDENCE_FLOOR. */
export const TECHNIQUE_PATTERN_FORGET_FLOOR = 0.15;

/**
 * How large a deviation from the athlete's own baseline counts as
 * "notable" rather than ordinary day-to-day noise. rom_consistency/
 * tempo_consistency are stored as a 0-1 fraction
 * (`setvision_analyses.rom_consistency numeric(4,3)`), so 0.10 is a
 * 10-percentage-point swing — the same order of magnitude as
 * `trend-engine.ts`'s existing `NOTABLE_VELOCITY_LOSS_DRIFT` (0.08) for
 * a comparable 0-1 SetVision metric, chosen for consistency with that
 * precedent rather than a new arbitrary threshold.
 */
export const NOTABLE_CONSISTENCY_DEVIATION = 0.1;

export function isSurfaceableTechniquePattern(pattern: DanteTechniquePattern): boolean {
  return (
    pattern.status === "active" &&
    pattern.sampleCount >= MIN_SAMPLES_FOR_TECHNIQUE_PATTERN &&
    pattern.confidence >= TECHNIQUE_PATTERN_SURFACE_CONFIDENCE
  );
}
