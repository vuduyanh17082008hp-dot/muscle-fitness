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

/** auto = applied without a confirm click; confirm = shown to the user first; block = never applied regardless of autonomy level. See lib/dante-core/autonomy/classify.ts, which computes this from config, never from a prompt. */
export type ActionRiskClass = "auto" | "confirm" | "block";

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

/**
 * Undo (mission Part 17): "Undo is itself a typed action" — never a
 * destructive blanket rollback. Reverses exactly one prior applied,
 * direct-effect action, identified by its `dante_action_log` row.
 * apply-action.ts loads that row's own `before`/`after` state (already
 * captured at the time the original action was applied) and replays
 * the inverse through the SAME write + read-back-verify path as any
 * other direct-effect action — no separate "rollback" code path exists.
 */
export type UndoActionPayload = {
  type: "undo_action";
  targetActionLogId: string;
  exerciseName: string;
};

export type DanteActionPayload =
  | AdjustSetsRepsPayload
  | PostponeExercisePayload
  | ModifyVolumePayload
  | RecoveryActionPayload
  | MacroAdjustmentPayload
  | MealSuggestionPayload
  | UndoActionPayload;

export type DanteActionType = DanteActionPayload["type"];

/** Actions in this set perform a real, direct-effect database write when applied. Everything else is advisory/audit-only. */
export const DIRECT_EFFECT_ACTION_TYPES: DanteActionType[] = [
  "adjust_sets_reps",
  "postpone_exercise",
  "modify_volume",
  "undo_action",
];

/** One real-valued piece of evidence behind an action — reused from lib/dante-core/insight.ts's chat-facing shape so an action and its "Why This?" panel never disagree about what the evidence was. */
export type ActionEvidenceItem = { label: string; value: string; note?: string | null };

export type DanteProposedAction = {
  /** Deterministic per-proposal id (see buildProposedActionId) — stable across repeated GETs of the same underlying state, so confirming twice is safe/idempotent to detect. */
  id: string;
  payload: DanteActionPayload;
  reason: string;
  /**
   * Whether the CLIENT must show a confirm/reject control before this
   * reaches apply-action.ts. Widened from a hardcoded `true` so the
   * autonomy gate (lib/dante-core/autonomy/gate.ts) can mark a
   * small, low-risk action as auto-appliable — every existing caller
   * that always set `true` keeps working unchanged; only the
   * orchestrator's new auto-apply path ever produces `false`.
   */
  requiresConfirmation: boolean;
  /** Which skill/engine produced this — see lib/dante-core/skills/registry.ts. Optional so existing construction sites (daily-decision-engine.ts) are unaffected. */
  domain?: "training" | "programming" | "nutrition" | "recovery";
  riskLevel?: ActionRiskClass;
  evidence?: ActionEvidenceItem[];
  /** The bound this action was checked against, e.g. { maxMagnitude: 1, unit: "sets" } — omitted for advisory actions with no magnitude. */
  limits?: { maxMagnitude: number; unit: string } | null;
  /** Free-text identifying the deterministic engine that computed this (e.g. "daily-decision-engine", "autoregulation-engine") — never "llm". */
  provenance?: string;
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
    case "undo_action":
      return `undo_action:${payload.targetActionLogId}`;
  }
}

/**
 * Builds the inverse of a direct-effect action's payload for
 * undo — swaps before/after for the two payload shapes that carry
 * both. `postpone_exercise` has no before/after (it's a one-way
 * boolean flip) and is handled as a special case by the caller
 * instead. Every other (advisory) action type has no direct database
 * effect to reverse.
 */
export function buildInverseActionPayload(payload: DanteActionPayload): DanteActionPayload | null {
  switch (payload.type) {
    case "adjust_sets_reps":
      return { ...payload, before: payload.after, after: payload.before };
    case "modify_volume":
      return { ...payload, before: payload.after, after: payload.before };
    case "postpone_exercise":
    case "recovery_action":
    case "macro_adjustment":
    case "meal_suggestion":
    case "undo_action":
      return null;
  }
}
