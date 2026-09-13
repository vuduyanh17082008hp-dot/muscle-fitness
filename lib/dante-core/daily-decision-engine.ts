import type { AthleteState } from "@/lib/athlete-state/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { TodaySession } from "@/lib/training/load-today-session";
import type { ConfidenceLevel, TraceableDecision } from "@/lib/dante-core/types";
import type { MuscleRecoveryMapEntry } from "@/lib/dante-core/muscle-recovery-map";
import {
  buildProposedActionId,
  type DanteProposedAction,
} from "@/lib/dante-core/actions/types";

/**
 * Daily Decision Engine — answers "what should I do today?" (mission
 * success criterion). This is a SESSION-LEVEL gate on top of the
 * Muscle Recovery Map: it never recomputes recovery itself, it only
 * decides whether today's already-planned exercises should proceed,
 * shrink, or be postponed, and proposes the matching DanteAction(s)
 * for the user to confirm.
 *
 * Deterministic-first: every branch below is a plain rule over
 * already-computed AthleteState/TrainingContext data. An LLM may later
 * phrase `recommendation`/`why` more conversationally, but it never
 * changes which decisionCode or proposedActions come out of this
 * function.
 */

export type DailyDecisionCode =
  | "prioritize_recovery"
  | "no_session_scheduled"
  | "insufficient_data"
  | "modify_session"
  | "proceed_as_planned";

export type DailyDecisionAffectedExercise = {
  sessionExerciseId: string;
  exerciseName: string;
  muscle: string | null;
  muscleLabel: string | null;
  recoveryScore: number | null;
};

export type DailyDecision = {
  decisionCode: DailyDecisionCode;
  sessionId: string | null;
  affectedExercises: DailyDecisionAffectedExercise[];
  warnings: string[];
};

/** Muscle-recovery score below this suggests postponing the exercise entirely. */
const POSTPONE_SCORE_THRESHOLD = 30;
/** Muscle-recovery score below this (but at/above the postpone threshold) suggests trimming volume. */
const REDUCE_VOLUME_SCORE_THRESHOLD = 50;
/** A muscle-recovery-map entry below this confidence is treated as "no real signal" — we act on it as a warning only, never a mutation. */
const MIN_ACTIONABLE_CONFIDENCE = 0.5;
/** Fraction to trim target sets by when volume reduction is warranted. */
const VOLUME_REDUCTION_FRACTION = 0.25;

function confidenceLevelFromFraction(fraction: number): ConfidenceLevel {
  if (fraction >= 0.75) return "high";
  if (fraction >= 0.5) return "moderate";
  return "low";
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function primaryMuscleForExercise(
  exerciseId: string,
  trainingContext: TrainingContext,
): string | null {
  const contributions = trainingContext.contributionsByExercise.get(exerciseId);
  if (!contributions || contributions.length === 0) return null;

  const primary = contributions.find((c) => c.role === "primary");
  if (primary) return primary.muscle;

  // No explicit "primary" row — fall back to the highest-weighted contribution.
  return contributions.reduce((best, c) => (c.contribution > best.contribution ? c : best))
    .muscle;
}

function findMuscleRecoveryEntry(
  muscle: string | null,
  muscleRecoveryMap: MuscleRecoveryMapEntry[],
): MuscleRecoveryMapEntry | null {
  if (!muscle) return null;
  return muscleRecoveryMap.find((entry) => entry.muscle === muscle) ?? null;
}

function buildRecoveryActionForPainFlag(): DanteProposedAction {
  const payload = {
    type: "recovery_action" as const,
    suggestion:
      "Consider resting today, hydrating, and monitoring symptoms — see a medical professional if pain or illness persists or worsens.",
  };

  return {
    id: buildProposedActionId(payload),
    payload,
    reason: "A recent check-in flagged pain or illness, so training decisions are held until it clears.",
    requiresConfirmation: true,
  };
}

export function buildDailyDecision(
  athleteState: AthleteState,
  trainingContext: TrainingContext,
  todaySession: TodaySession | null,
): { decision: TraceableDecision<DailyDecision>; proposedActions: DanteProposedAction[] } {
  const dataUsed: Record<string, string | number | null> = {
    readinessScore: athleteState.recovery.score,
    trainingLoadState: athleteState.recovery.trainingLoadState,
    overallConfidencePercent: Math.round(athleteState.derived.overallConfidence * 100),
  };

  // ---- Safety gate: pain/illness always wins, regardless of performance data (spec Part "9. SAFETY"). ----
  if (athleteState.recovery.painFlag) {
    const decision: DailyDecision = {
      decisionCode: "prioritize_recovery",
      sessionId: todaySession?.id ?? null,
      affectedExercises: [],
      warnings: [],
    };

    return {
      decision: {
        recommendation: "Prioritize recovery today — a recent check-in flagged pain or illness.",
        decision,
        why: [
          "A pain/illness flag overrides all performance-based recommendations. This is a fixed safety rule, not a probabilistic judgment.",
        ],
        dataUsed,
        confidence: "high",
        sources: [],
      },
      proposedActions: [buildRecoveryActionForPainFlag()],
    };
  }

  if (!todaySession) {
    const decision: DailyDecision = {
      decisionCode: "no_session_scheduled",
      sessionId: null,
      affectedExercises: [],
      warnings: [],
    };

    return {
      decision: {
        recommendation: "No workout is scheduled for today.",
        decision,
        why: ["There is no workout session scheduled for today's date."],
        dataUsed,
        confidence: "high",
        sources: [],
      },
      proposedActions: [],
    };
  }

  const activeExercises = todaySession.exercises.filter((ex) => !ex.isSkipped);

  const affectedExercises: DailyDecisionAffectedExercise[] = [];
  const warnings: string[] = [];
  const why: string[] = [];
  const proposedActions: DanteProposedAction[] = [];
  const consideredConfidences: number[] = [];

  for (const exercise of activeExercises) {
    const muscle = primaryMuscleForExercise(exercise.exerciseId, trainingContext);
    const entry = findMuscleRecoveryEntry(muscle, athleteState.derived.muscleRecoveryMap);

    if (!entry || entry.confidence < MIN_ACTIONABLE_CONFIDENCE) {
      if (muscle) {
        warnings.push(
          `Not enough data yet to confidently assess ${exercise.exerciseName}'s primary muscle recovery — proceeding on the planned prescription.`,
        );
      }
      continue;
    }

    consideredConfidences.push(entry.confidence);

    if (entry.score === null) continue;

    if (entry.score < POSTPONE_SCORE_THRESHOLD) {
      affectedExercises.push({
        sessionExerciseId: exercise.sessionExerciseId,
        exerciseName: exercise.exerciseName,
        muscle: entry.muscle,
        muscleLabel: entry.muscleLabel,
        recoveryScore: entry.score,
      });
      why.push(
        `${exercise.exerciseName}: ${entry.muscleLabel} recovery is estimated at ${entry.score}/100 (${entry.drivers.join("; ")}) — postponing is suggested.`,
      );

      const payload = {
        type: "postpone_exercise" as const,
        sessionId: todaySession.id,
        sessionExerciseId: exercise.sessionExerciseId,
        exerciseName: exercise.exerciseName,
      };

      proposedActions.push({
        id: buildProposedActionId(payload),
        payload,
        reason: `${entry.muscleLabel} recovery is estimated at ${entry.score}/100 — below the threshold for training this muscle today.`,
        requiresConfirmation: true,
      });
    } else if (entry.score < REDUCE_VOLUME_SCORE_THRESHOLD) {
      if (exercise.targetSets === null) {
        warnings.push(
          `${exercise.exerciseName}'s recovery is moderate but no target set count is available to propose a specific reduction.`,
        );
        continue;
      }

      affectedExercises.push({
        sessionExerciseId: exercise.sessionExerciseId,
        exerciseName: exercise.exerciseName,
        muscle: entry.muscle,
        muscleLabel: entry.muscleLabel,
        recoveryScore: entry.score,
      });
      why.push(
        `${exercise.exerciseName}: ${entry.muscleLabel} recovery is estimated at ${entry.score}/100 (${entry.drivers.join("; ")}) — reducing volume is suggested.`,
      );

      const reducedSets = Math.max(1, Math.round(exercise.targetSets * (1 - VOLUME_REDUCTION_FRACTION)));

      if (reducedSets < exercise.targetSets) {
        const payload = {
          type: "modify_volume" as const,
          sessionId: todaySession.id,
          sessionExerciseId: exercise.sessionExerciseId,
          exerciseName: exercise.exerciseName,
          before: { sets: exercise.targetSets },
          after: { sets: reducedSets },
        };

        proposedActions.push({
          id: buildProposedActionId(payload),
          payload,
          reason: `${entry.muscleLabel} recovery is estimated at ${entry.score}/100 — trimming volume reduces load on this muscle while keeping the session intact.`,
          requiresConfirmation: true,
        });
      }
    }
  }

  const decisionCode: DailyDecisionCode =
    affectedExercises.length > 0
      ? "modify_session"
      : consideredConfidences.length === 0
        ? "insufficient_data"
        : "proceed_as_planned";

  const recommendation =
    decisionCode === "modify_session"
      ? `Adjust today's session — ${affectedExercises.map((e) => e.exerciseName).join(", ")} need attention.`
      : decisionCode === "insufficient_data"
        ? "Not enough training history yet to give a confident recommendation — proceed with today's planned session using your own judgment on effort."
        : "Proceed with today's session as planned.";

  const decisionConfidenceFraction =
    consideredConfidences.length > 0
      ? round(consideredConfidences.reduce((a, b) => a + b, 0) / consideredConfidences.length)
      : athleteState.derived.overallConfidence;

  dataUsed.sessionExerciseCount = activeExercises.length;
  dataUsed.affectedExerciseCount = affectedExercises.length;

  const decision: DailyDecision = {
    decisionCode,
    sessionId: todaySession.id,
    affectedExercises,
    warnings,
  };

  return {
    decision: {
      recommendation,
      decision,
      why: why.length > 0 ? why : ["Today's session looks consistent with your recent recovery and training data."],
      dataUsed,
      confidence: confidenceLevelFromFraction(decisionConfidenceFraction),
      sources: [],
    },
    proposedActions,
  };
}
