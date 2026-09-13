/**
 * Dante Skill Registry (mission Part 7).
 *
 * A "skill" is a declared capability boundary, not automatically
 * another LLM call — most skills below wrap an existing deterministic
 * engine (readiness, autoregulation, adaptive program, recovery
 * score, nutrition plan) and never touch an LLM at all. The
 * orchestrator (lib/dante-core/orchestrator) only calls a skill's
 * code; it is the skill's job to stay inside its own declared
 * `permittedActions` and `riskClass`.
 */

export type SkillDomain =
  | "training"
  | "programming"
  | "nutrition"
  | "recovery"
  | "setvision"
  | "experiment"
  | "safety";

export type SkillRiskClass = "read_only" | "advisory" | "bounded_mutation" | "blocking";

export type DanteSkill = {
  id: string;
  domain: SkillDomain;
  label: string;
  description: string;
  requiredInputs: string[];
  optionalInputs: string[];
  outputs: string[];
  /** DanteActionType values this skill is allowed to produce — see lib/dante-core/actions/types.ts. Empty for read-only/safety skills. */
  permittedActions: string[];
  riskClass: SkillRiskClass;
  /** Plain-language statement of what this skill will never do, shown in the final report / audit trail, not enforced by this field alone (enforcement lives in lib/dante-core/autonomy). */
  safetyBoundary: string;
  /** True when this skill has a real, wired implementation today. False entries are declared for the registry's completeness but have no orchestrator wiring yet — never silently treated as available. */
  implemented: boolean;
};
