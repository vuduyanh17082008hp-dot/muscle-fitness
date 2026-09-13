import type { ActionRiskClass, DanteActionPayload } from "@/lib/dante-core/actions/types";
import { AUTONOMY_CONFIG } from "@/lib/dante-core/autonomy/config";

/**
 * Deterministic risk classification (mission Part 12) — purely a
 * function of the action's own type and magnitude, computed from
 * config, never from a prompt or an LLM's judgment call.
 */
export type { ActionRiskClass };

function classifyByVolumePercent(percent: number, ceiling: number): ActionRiskClass {
  if (percent > AUTONOMY_CONFIG.blockVolumePercent) return "block";
  if (percent <= ceiling) return "auto";
  return "confirm";
}

/**
 * Classification under ASSIST (the default level) — AUTOPILOT widens
 * a couple of these ceilings (see autopilotMaxVolumePercent), GUIDE
 * forces everything except "block" down to "confirm" (see gate.ts).
 */
export function classifyActionRisk(payload: DanteActionPayload): ActionRiskClass {
  switch (payload.type) {
    case "adjust_sets_reps": {
      const before = payload.before.sets;
      const after = payload.after.sets;
      if (before === null || after === null) return "confirm";
      const delta = Math.abs(after - before);
      if (delta > AUTONOMY_CONFIG.blockSetDelta) return "block";
      return delta <= AUTONOMY_CONFIG.autoMaxSetDelta ? "auto" : "confirm";
    }

    case "modify_volume": {
      if (payload.before.sets <= 0) return "confirm";
      const percent = (Math.abs(payload.after.sets - payload.before.sets) / payload.before.sets) * 100;
      return classifyByVolumePercent(percent, AUTONOMY_CONFIG.autoMaxVolumePercent);
    }

    // Removing a planned exercise entirely is closer to a program
    // restructure than a small tweak — always confirm (mission Part 12
    // lists "exercise substitution" under CONFIRM).
    case "postpone_exercise":
      return "confirm";

    // A recovery suggestion is advisory and reversible by definition —
    // "reminders" are explicitly listed under AUTO.
    case "recovery_action":
      return "auto";

    // Mission Part 12 lists "calorie target change" / "macro target
    // change" explicitly under CONFIRM, regardless of magnitude.
    case "macro_adjustment":
      return "confirm";

    // A suggestion with no direct database effect — safe to surface
    // without a confirm click (nothing is mutated either way).
    case "meal_suggestion":
      return "auto";
  }
}

/** The wider ceiling AUTOPILOT is allowed to use for magnitude-based actions — still bounded by the same block ceiling. */
export function classifyActionRiskForAutopilot(payload: DanteActionPayload): ActionRiskClass {
  if (payload.type === "modify_volume") {
    if (payload.before.sets <= 0) return "confirm";
    const percent = (Math.abs(payload.after.sets - payload.before.sets) / payload.before.sets) * 100;
    return classifyByVolumePercent(percent, AUTONOMY_CONFIG.autopilotMaxVolumePercent);
  }

  return classifyActionRisk(payload);
}
