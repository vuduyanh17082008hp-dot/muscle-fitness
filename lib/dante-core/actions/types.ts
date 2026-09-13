/**
 * Dante Actions — typed action schema (spec Part "2. DANTE ACTIONS").
 *
 * Every action Dante can propose is one of these exact shapes. There
 * is no "freeform action" escape hatch: an LLM can describe WHY an
 * action makes sense, but it can never construct a payload outside
 * this union, and it never touches the database directly — see
 * lib/dante-core/actions/apply-action.ts for the only code path that
 * writes anything.
 */

export type DanteActionStatus = "proposed" | "confirmed" | "applied" | "rejected" | "failed";

export type AdjustSetsRepsPayload = {
  type: "adjust_sets_reps";
  sessionId: string;
  sessionExerciseId: string;
  exerciseName: string;
  before: { sets: number | null; repMin: number | null; repMax: number | null };
  after: { sets: number | null; repMin: number | null; repMax: number | null };
};

export type PostponeExercisePayload = {
  type: "postpone_exercise";
  sessionId: string;
  sessionExerciseId: string;
  exerciseName: string;
};

export type ModifyVolumePayload = {
  type: "modify_volume";
  sessionId: string;
  sessionExerciseId: string;
  exerciseName: string;
  before: { sets: number };
  after: { sets: number };
};

/** Advisory only — Dante never submits a recovery check-in on the user's behalf. */
export type RecoveryActionPayload = {
  type: "recovery_action";
  suggestion: string;
};

/** Advisory only — never mutates the computed nutrition plan/targets. */
export type MacroAdjustmentPayload = {
  type: "macro_adjustment";
  macro: "calories" | "protein" | "carbs" | "fat";
  direction: "increase" | "decrease";
  suggestedChangePercent: number;
};

/** Advisory only — a suggestion, never an entry written to the food log. */
export type MealSuggestionPayload = {
  type: "meal_suggestion";
  mealDescription: string;
  estimatedCalories: number | null;
  estimatedProteinG: number | null;
};

export type DanteActionPayload =
  | AdjustSetsRepsPayload
  | PostponeExercisePayload
  | ModifyVolumePayload
  | RecoveryActionPayload
  | MacroAdjustmentPayload
  | MealSuggestionPayload;

export type DanteActionType = DanteActionPayload["type"];

/** Actions in this set perform a real, direct-effect database write when applied. Everything else is advisory/audit-only. */
export const DIRECT_EFFECT_ACTION_TYPES: DanteActionType[] = [
  "adjust_sets_reps",
  "postpone_exercise",
  "modify_volume",
];

export type DanteProposedAction = {
  /** Deterministic per-proposal id (see buildProposedActionId) — stable across repeated GETs of the same underlying state, so confirming twice is safe/idempotent to detect. */
  id: string;
  payload: DanteActionPayload;
  reason: string;
  /** Always true — kept explicit in the type so no code path can construct an action that skips confirmation. */
  requiresConfirmation: true;
};

/**
 * A stable id for a proposed action, derived from its content rather
 * than randomly generated — the SAME underlying condition (e.g.
 * "reduce today's Leg Press volume") proposes the SAME id every time
 * the decision engine runs, so the client can tell "still the same
 * proposal" from "a new one" without a server round trip.
 */
export function buildProposedActionId(payload: DanteActionPayload): string {
  switch (payload.type) {
    case "adjust_sets_reps":
      return `adjust_sets_reps:${payload.sessionExerciseId}:${payload.after.sets}:${payload.after.repMin}:${payload.after.repMax}`;
    case "postpone_exercise":
      return `postpone_exercise:${payload.sessionExerciseId}`;
    case "modify_volume":
      return `modify_volume:${payload.sessionExerciseId}:${payload.after.sets}`;
    case "recovery_action":
      return `recovery_action:${payload.suggestion}`;
    case "macro_adjustment":
      return `macro_adjustment:${payload.macro}:${payload.direction}:${payload.suggestedChangePercent}`;
    case "meal_suggestion":
      return `meal_suggestion:${payload.mealDescription}`;
  }
}
