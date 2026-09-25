import type { DanteTaskId } from "@/lib/dante-core/adaptive-coach-v2/types";

export type DanteTaskDefinition = {
  id: DanteTaskId;
  purpose: string;
  inputs: string[];
  outputs: string[];
  upstream: DanteTaskId[];
  downstream: DanteTaskId[];
};

export const DANTE_TASK_REGISTRY: Record<DanteTaskId, DanteTaskDefinition> = {
  INTERPRET_CURRENT_STATE: { id: "INTERPRET_CURRENT_STATE", purpose: "Extract explicit current meaning.", inputs: ["raw user turn"], outputs: ["semantic propositions"], upstream: [], downstream: ["RUN_SAFETY_CHECK", "ASSESS_PROVENANCE"] },
  RUN_SAFETY_CHECK: { id: "RUN_SAFETY_CHECK", purpose: "Identify current safety signals.", inputs: ["semantic propositions"], outputs: ["safety action"], upstream: ["INTERPRET_CURRENT_STATE"], downstream: ["ASSESS_RISK", "REALIZE_RESPONSE"] },
  RETRIEVE_MEMORY: { id: "RETRIEVE_MEMORY", purpose: "Select relevant context capsules.", inputs: ["task", "session context"], outputs: ["scheduled context"], upstream: ["INTERPRET_CURRENT_STATE"], downstream: ["ASSESS_PROVENANCE"] },
  ASSESS_PROVENANCE: { id: "ASSESS_PROVENANCE", purpose: "Separate evidence from unsupported attribution.", inputs: ["propositions", "memory"], outputs: ["evidence classification"], upstream: ["INTERPRET_CURRENT_STATE", "RETRIEVE_MEMORY"], downstream: ["ASSESS_CONFIDENCE"] },
  ASSESS_CONFIDENCE: { id: "ASSESS_CONFIDENCE", purpose: "Calibrate claims to available evidence.", inputs: ["evidence classification"], outputs: ["claim confidence"], upstream: ["ASSESS_PROVENANCE"], downstream: ["SELECT_TRAINING_STRATEGY"] },
  ASSESS_RISK: { id: "ASSESS_RISK", purpose: "Combine relevant coaching risk signals.", inputs: ["safety action", "current state"], outputs: ["coaching bias"], upstream: ["RUN_SAFETY_CHECK"], downstream: ["SELECT_TRAINING_STRATEGY"] },
  SELECT_TRAINING_STRATEGY: { id: "SELECT_TRAINING_STRATEGY", purpose: "Choose a bounded coaching approach.", inputs: ["state", "confidence", "risk"], outputs: ["strategy"], upstream: ["ASSESS_CONFIDENCE", "ASSESS_RISK"], downstream: ["MANAGE_EXPERIMENT", "REALIZE_RESPONSE"] },
  MANAGE_EXPERIMENT: { id: "MANAGE_EXPERIMENT", purpose: "Describe experiment state without causal overclaim.", inputs: ["strategy", "experiment summary"], outputs: ["experiment update"], upstream: ["SELECT_TRAINING_STRATEGY"], downstream: ["REALIZE_RESPONSE"] },
  EXECUTE_TOOL: { id: "EXECUTE_TOOL", purpose: "Respect tool permission and confirmation.", inputs: ["tool request", "permission"], outputs: ["tool result"], upstream: ["SELECT_TRAINING_STRATEGY"], downstream: ["REALIZE_RESPONSE"] },
  REALIZE_RESPONSE: { id: "REALIZE_RESPONSE", purpose: "Render a natural bounded response.", inputs: ["decision", "strategy state"], outputs: ["user response"], upstream: ["RUN_SAFETY_CHECK", "SELECT_TRAINING_STRATEGY", "MANAGE_EXPERIMENT", "EXECUTE_TOOL"], downstream: [] },
};

export function getTaskDefinition(id: DanteTaskId): DanteTaskDefinition {
  return DANTE_TASK_REGISTRY[id];
}
