import type { DanteSkill } from "@/lib/dante-core/skills/types";

/**
 * The registry itself — plain data, no I/O. Each skill's actual logic
 * lives in the engine it wraps (linked in the comment below); this
 * file is purely the declared contract the orchestrator reads before
 * deciding whether/how to invoke a domain.
 */
export const DANTE_SKILL_REGISTRY: DanteSkill[] = [
  {
    id: "training.autoregulation",
    domain: "training",
    label: "Training Autoregulation",
    description:
      "Decides whether today's planned session should proceed, shrink, or be postponed, using the Daily Decision Engine and Autoregulation Engine (lib/dante-core/daily-decision-engine.ts, autoregulation-engine.ts).",
    requiredInputs: ["athleteState", "trainingContext", "todaySession"],
    optionalInputs: ["setVisionSessionSignal"],
    outputs: ["DailyDecision", "DanteProposedAction[]"],
    permittedActions: ["adjust_sets_reps", "modify_volume", "postpone_exercise"],
    riskClass: "bounded_mutation",
    safetyBoundary:
      "Never proceeds past a real pain/illness flag as anything other than rest_recommended; never increases load/volume beyond the planned session's own targets.",
    implemented: true,
  },
  {
    id: "programming.adaptive_load",
    domain: "programming",
    label: "Adaptive Program Engine",
    description:
      "Suggests next-session load/hold/reduce per exercise from real logged-set history (lib/dante-core/adaptive-program-engine.ts).",
    requiredInputs: ["athleteState", "trainingContext"],
    optionalInputs: [],
    outputs: ["ProgramAdaptation[]"],
    permittedActions: [],
    riskClass: "advisory",
    safetyBoundary:
      "Advisory only — never writes a future session's load directly, since weight is only ever logged per completed set.",
    implemented: true,
  },
  {
    id: "nutrition.plan",
    domain: "nutrition",
    label: "Nutrition Plan & Tracking",
    description:
      "Compares today's logged food against the deterministic nutrition plan target (lib/nutrition/plan.ts, lib/nutrition/food-log/totals.ts).",
    requiredInputs: ["nutritionContext", "todayFoodLog"],
    optionalInputs: [],
    outputs: ["macro remaining/consumed/target", "DanteProposedAction[]"],
    permittedActions: ["macro_adjustment", "meal_suggestion"],
    riskClass: "advisory",
    safetyBoundary:
      "Never recommends a food listed under the athlete's allergies or excluded foods; never mutates the food log or nutrition target itself.",
    implemented: true,
  },
  {
    id: "recovery.readiness",
    domain: "recovery",
    label: "Recovery & Readiness",
    description:
      "Deterministic recovery score, training-load state, and personal-baseline comparison (lib/recovery/score.ts, training-load.ts, lib/dante-core/readiness-engine.ts).",
    requiredInputs: ["recoveryContext"],
    optionalInputs: ["wearableSnapshot"],
    outputs: ["ReadinessResult", "DanteProposedAction[]"],
    permittedActions: ["recovery_action"],
    riskClass: "advisory",
    safetyBoundary:
      "Never tells the athlete to skip a workout outright — surfaces the training-load state and lets the athlete/training skill decide.",
    implemented: true,
  },
  {
    id: "setvision.technique",
    domain: "setvision",
    label: "SetVision Technique Analysis",
    description:
      "Rep/ROM/tempo/bar-path consistency from client-side pose analysis (lib/setvision/index.ts).",
    requiredInputs: ["setVisionAnalysis"],
    optionalInputs: [],
    outputs: ["technique consistency deviation"],
    permittedActions: [],
    riskClass: "read_only",
    safetyBoundary: "Never claims a measured biomechanical fact — always framed as an estimated consistency signal.",
    implemented: false,
  },
  {
    id: "experiment.evaluation",
    domain: "experiment",
    label: "Self-Experiment Evaluation",
    description: "Compares two logged conditions using lib/experiments/engine.ts.",
    requiredInputs: ["experimentObservations"],
    optionalInputs: [],
    outputs: ["ExperimentAnalysis"],
    permittedActions: [],
    riskClass: "read_only",
    safetyBoundary: "Reports observed association only — never claims causal proof (mission Part 5).",
    implemented: false,
  },
  {
    id: "safety.guard",
    domain: "safety",
    label: "Safety Layer",
    description:
      "Red-flag pattern match on the athlete's message, short-circuiting to a fixed escalation response before any other skill or LLM call runs (lib/dante-core/safety-layer.ts).",
    requiredInputs: ["userMessage"],
    optionalInputs: [],
    outputs: ["SafetyCheckResult"],
    permittedActions: [],
    riskClass: "blocking",
    safetyBoundary:
      "Always runs first and can block/override any other skill's output; no skill, policy, or autonomy level may bypass it.",
    implemented: true,
  },
];

export function getSkill(id: string): DanteSkill | undefined {
  return DANTE_SKILL_REGISTRY.find((skill) => skill.id === id);
}

export function getSkillsForDomain(domain: DanteSkill["domain"]): DanteSkill[] {
  return DANTE_SKILL_REGISTRY.filter((skill) => skill.domain === domain);
}
