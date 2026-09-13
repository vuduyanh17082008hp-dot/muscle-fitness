import type { DanteActionPayload, DanteProposedAction } from "@/lib/dante-core/actions/types";
import { resolveAutonomyDecision } from "@/lib/dante-core/autonomy/gate";
import { classifyContext } from "@/lib/dante-core/response-learning";
import type { InterventionType } from "@/lib/dante-core/memory-hierarchy/types";
import {
  buildDefaultTrainingScenarios,
  selectBestScenario,
  type ScoredScenario,
} from "@/lib/dante-core/sandbox";
import type { OrchestratorInput, OrchestratorResult, GatedAction } from "@/lib/dante-core/orchestrator/types";

/**
 * Dante Orchestrator (mission Part 8) — a pure, synchronous pipeline.
 * No LLM call happens anywhere in this file. Every stage below reads
 * ONLY its input arguments; all I/O (loading state, persisting
 * results, applying auto-approved actions) lives in
 * run-cycle-for-user.ts, which calls this function once per cycle.
 */

function mapPayloadToInterventionType(payload: DanteActionPayload): InterventionType {
  switch (payload.type) {
    case "adjust_sets_reps": {
      const before = payload.before.sets;
      const after = payload.after.sets;
      if (before !== null && after !== null && after < before) return "reduce_volume";
      if (before !== null && after !== null && after > before) return "increase_load";
      return "hold_load";
    }
    case "modify_volume":
      return payload.after.sets < payload.before.sets ? "reduce_volume" : "hold_load";
    case "postpone_exercise":
      return "postpone_exercise";
    case "recovery_action":
      return "no_change";
    case "macro_adjustment":
      return "macro_adjustment";
    case "meal_suggestion":
      return "meal_timing_adjustment";
  }
}

/** ANALYST — "what changed?" Compares today's readiness/focus/status against the last cached daily-intelligence snapshot. Deterministic string diff, not an LLM summary. */
function runAnalyst(input: OrchestratorInput): string[] {
  const changes: string[] = [];
  const previous = input.previousSnapshot;
  const current = {
    readinessScore: input.athleteState.recovery.score,
    trainingFocus: input.dailyDecision.decision.affectedExercises[0]?.exerciseName ?? null,
    recoveryStatus: input.athleteState.recovery.status,
  };

  if (!previous) {
    changes.push("First cycle recorded for this athlete — no prior snapshot to compare against.");
    return changes;
  }

  if (previous.readinessScore !== current.readinessScore && current.readinessScore !== null) {
    const delta =
      previous.readinessScore !== null ? current.readinessScore - previous.readinessScore : null;
    changes.push(
      delta !== null
        ? `Readiness moved from ${previous.readinessScore} to ${current.readinessScore} (${delta > 0 ? "+" : ""}${delta}).`
        : `Readiness is now ${current.readinessScore} (previously unavailable).`,
    );
  }

  if (previous.recoveryStatus !== current.recoveryStatus && current.recoveryStatus !== null) {
    changes.push(`Recovery status changed to "${current.recoveryStatus}".`);
  }

  if (previous.trainingFocus !== current.trainingFocus && current.trainingFocus !== null) {
    changes.push(`Today's training focus is now ${current.trainingFocus}.`);
  }

  if (changes.length === 0) {
    changes.push("No meaningful change since the last cycle.");
  }

  return changes;
}

/**
 * CHECKER — is the proposed intervention actually supported by
 * evidence? Runs the Decision Sandbox for volume/load-changing
 * actions only (the one domain the sandbox currently models); every
 * other action type passes through with `scenariosConsidered: null`
 * rather than a fabricated comparison.
 */
function runChecker(
  action: DanteProposedAction,
  input: OrchestratorInput,
): ScoredScenario[] | null {
  if (action.payload.type !== "modify_volume" && action.payload.type !== "adjust_sets_reps") {
    return null;
  }

  const goal = input.athleteState.profile.goal;
  const goalFavorsVolume = goal === "muscle_gain" || goal === "lean_bulk";

  const scenarios = buildDefaultTrainingScenarios();
  return scenarios.map((scenario) =>
    selectBestScenario([scenario], {
      recoveryScore: input.athleteState.recovery.score,
      trainingLoadState: input.athleteState.recovery.trainingLoadState,
      volumeTolerance: input.policy.volumeTolerance.value,
      goalFavorsVolume,
    }),
  );
}

/** SAFETY (policy portion — budget checks happen in the server wrapper, which has the I/O needed for them). */
function runAutonomyGate(action: DanteProposedAction, input: OrchestratorInput): GatedAction["autonomyDecision"] {
  const interventionType = mapPayloadToInterventionType(action.payload);

  const contextKey = classifyContext({
    sleepHours: input.athleteState.recovery.sleepHours,
    stress: input.athleteState.recovery.stress,
    soreness: input.athleteState.recovery.soreness,
    recoveryScore: input.athleteState.recovery.score,
    trainingLoadState: input.athleteState.recovery.trainingLoadState,
  });

  const matchingPattern = input.policy.patterns.find(
    (pattern) => pattern.contextKey === contextKey && pattern.interventionType === interventionType,
  );

  return resolveAutonomyDecision({
    autonomyLevel: input.policy.autonomyLevel,
    payload: action.payload,
    patternRequiresConfirmation: matchingPattern?.requiresConfirmation,
  });
}

export function runDanteCycle(input: OrchestratorInput): OrchestratorResult {
  const changes = runAnalyst(input);

  const gatedActions: GatedAction[] = input.proposedActions.map((action) => ({
    action,
    autonomyDecision: runAutonomyGate(action, input),
    scenariosConsidered: runChecker(action, input),
    // Filled in by run-cycle-for-user.ts once budgets are checked against real recent history.
    budgetAllowed: true,
    budgetReason: null,
  }));

  const confidence =
    input.dailyDecision.decision.affectedExercises.length > 0
      ? input.athleteState.derived.overallConfidence >= 0.75
        ? "high"
        : input.athleteState.derived.overallConfidence >= 0.4
          ? "moderate"
          : "low"
      : null;

  return {
    changes,
    gatedActions,
    decisionCode: input.dailyDecision.decision.decisionCode,
    confidence,
    warnings: input.dailyDecision.decision.warnings,
  };
}
