import type { DanteActionPayload } from "@/lib/dante-core/actions/types";
import {
  classifyActionRisk,
  classifyActionRiskForAutopilot,
  type ActionRiskClass,
} from "@/lib/dante-core/autonomy/classify";
import type { AutonomyLevel } from "@/lib/dante-core/policy/types";

export type AutonomyDecision = ActionRiskClass;

export type AutonomyGateInput = {
  autonomyLevel: AutonomyLevel;
  payload: DanteActionPayload;
  /** Set when the learned pattern behind this action was marked "ASK FIRST" (mission Part 14) — forces confirm even if the action would otherwise auto-apply. Never widens toward "auto". */
  patternRequiresConfirmation?: boolean;
};

/**
 * The single place autonomy level + action risk + a per-pattern user
 * override combine into one decision (mission Part 12). `block`
 * always wins regardless of autonomy level — no setting can escalate
 * a blocked action to confirm or auto. GUIDE never auto-applies
 * anything, matching "GUIDE: recommend only".
 */
export function resolveAutonomyDecision(input: AutonomyGateInput): AutonomyDecision {
  const riskClass =
    input.autonomyLevel === "autopilot"
      ? classifyActionRiskForAutopilot(input.payload)
      : classifyActionRisk(input.payload);

  if (riskClass === "block") return "block";

  if (input.autonomyLevel === "guide") return "confirm";

  if (input.patternRequiresConfirmation) return "confirm";

  return riskClass;
}
