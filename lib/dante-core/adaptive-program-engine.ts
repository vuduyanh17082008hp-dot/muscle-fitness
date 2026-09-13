import type { AthleteState } from "@/lib/athlete-state/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import {
  computeExerciseProgression,
  type ProgressionAction,
  type ProgressionGateReason,
} from "@/lib/training/progression-engine";
import type { ConfidenceLevel, TraceableDecision } from "@/lib/dante-core/types";

/**
 * Adaptive Program Engine (spec Part "4. ADAPTIVE PROGRAM ENGINE").
 *
 * Closes the loop PROGRAM → SESSION → PERFORMANCE → ADAPT NEXT SESSION
 * by wiring the existing, previously-unused
 * lib/training/progression-engine.ts::computeExerciseProgression into
 * a real per-exercise orchestrator over TrainingContext.lastSessionByExercise.
 *
 * Deliberately advisory, not a direct-effect Dante Action: a load
 * suggestion applies to a FUTURE session that doesn't exist as a row
 * yet (workout_session_exercises has no weight column — weight is
 * only ever logged per-set, after the fact), so there is nothing to
 * write today. The engine's job is to decide and explain, not mutate.
 *
 * "Require sufficient evidence" (spec): an exercise with zero
 * completed sets in its last logged session produces no adaptation at
 * all, and an adaptation based on only one completed set is still
 * surfaced but explicitly marked low-confidence rather than treated
 * the same as a well-evidenced one.
 */

export type ProgramAdaptation = {
  exerciseId: string;
  exerciseName: string;
  action: ProgressionAction;
  suggestedWeightKg: number | null;
  /** True when a safety gate (pain flag / recovery priority / red training load) determined this outcome, overriding what performance alone would suggest. */
  gated: boolean;
  gateReason: ProgressionGateReason;
  /** Set only for an un-gated HOLD where reps are still building toward the top of the range — see lib/training/progression-engine.ts. */
  subAction: "add_reps" | null;
  evidenceSampleSize: number;
  /** The actual last-session sets this adaptation was computed from — carried through so UI can show "Last session: 80kg 10/10/10" without a second lookup. */
  lastSessionSets: Array<{ weightKg: number | null; reps: number | null; rir: number | null; completed: boolean }>;
  targetRepMin: number;
  targetRepMax: number;
};

function evidenceConfidence(gated: boolean, sampleSize: number): ConfidenceLevel {
  // A safety gate is a deterministic rule, not a statistical guess — it's certain regardless of sample size.
  if (gated) return "high";
  if (sampleSize >= 3) return "high";
  if (sampleSize === 2) return "moderate";
  return "low";
}

export function buildAdaptiveProgram(
  athleteState: AthleteState,
  trainingContext: TrainingContext,
): TraceableDecision<ProgramAdaptation>[] {
  const results: TraceableDecision<ProgramAdaptation>[] = [];

  for (const [exerciseId, lastSession] of trainingContext.lastSessionByExercise) {
    const evidenceSampleSize = lastSession.sets.filter(
      (set) => set.completed && set.weightKg !== null && set.reps !== null,
    ).length;

    // No usable evidence at all — nothing to adapt from, so nothing is reported (spec: "require sufficient evidence").
    if (evidenceSampleSize === 0) continue;

    const progression = computeExerciseProgression({
      targetRepMin: lastSession.targetRepMin,
      targetRepMax: lastSession.targetRepMax,
      targetRir: lastSession.targetRir,
      lastSessionSets: lastSession.sets,
      recentPainFlag: athleteState.recovery.painFlag,
      recoveryStatus: athleteState.recovery.recoveryStatusCode,
      trainingLoadState: athleteState.recovery.trainingLoadState,
    });

    if (progression.action === "INSUFFICIENT_DATA") continue;

    const exerciseName = trainingContext.exercisesById.get(exerciseId)?.name ?? "Exercise";

    const why = [progression.reason];
    if (!progression.gated && evidenceSampleSize === 1) {
      why.push("Based on a single logged set only — treat this as a low-confidence signal until more sessions are logged.");
    }

    const adaptation: ProgramAdaptation = {
      exerciseId,
      exerciseName,
      action: progression.action,
      suggestedWeightKg: progression.suggestedWeightKg,
      gated: progression.gated,
      gateReason: progression.gateReason,
      subAction: progression.subAction,
      lastSessionSets: lastSession.sets,
      targetRepMin: lastSession.targetRepMin,
      targetRepMax: lastSession.targetRepMax,
      evidenceSampleSize,
    };

    const recommendation =
      progression.action === "INCREASE_LOAD"
        ? `${exerciseName}: increase load to ${progression.suggestedWeightKg}kg next session.`
        : progression.action === "DECREASE_LOAD"
          ? `${exerciseName}: reduce load next session.`
          : `${exerciseName}: hold current load next session.`;

    results.push({
      recommendation,
      decision: adaptation,
      why,
      dataUsed: {
        targetRepMin: lastSession.targetRepMin,
        targetRepMax: lastSession.targetRepMax,
        targetRir: lastSession.targetRir,
        evidenceSampleSize,
        suggestedWeightKg: progression.suggestedWeightKg,
      },
      confidence: evidenceConfidence(progression.gated, evidenceSampleSize),
      sources: [],
    });
  }

  return results;
}
