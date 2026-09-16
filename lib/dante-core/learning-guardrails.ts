/**
 * Immutable learning boundaries for Dante's adaptive closed loop.
 *
 * Client-specific patterns may update athlete personalization — they
 * must NEVER modify safety, medical, evidence, or hard-constraint
 * rules. Those domains are code-owned and deterministic.
 */

import type { InterventionType } from "@/lib/dante-core/memory-hierarchy/types";

/** Domains learning is explicitly forbidden from writing to. */
export const IMMUTABLE_LEARNING_DOMAINS = [
  "safety_rules",
  "medical_boundaries",
  "evidence_rules",
  "hard_constraints",
] as const;

export type ImmutableLearningDomain = (typeof IMMUTABLE_LEARNING_DOMAINS)[number];

/** Only these intervention types may enter client pattern memory. */
export const LEARNABLE_INTERVENTION_TYPES: readonly InterventionType[] = [
  "reduce_volume",
  "reduce_load",
  "modify_session",
  "postpone_exercise",
  "increase_load",
  "hold_load",
  "macro_adjustment",
  "meal_timing_adjustment",
  "no_change",
];

export type LearningScopeCheck =
  | { allowed: true }
  | { allowed: false; reason: string; blockedDomain?: ImmutableLearningDomain };

export function assertLearningScope(input: {
  userId: string;
  interventionType: InterventionType;
  provenance: string;
  targetDomain?: string;
}): LearningScopeCheck {
  if (!input.userId.trim()) {
    return { allowed: false, reason: "Learning requires a specific athlete user id." };
  }

  const normalizedDomain = input.targetDomain?.trim().toLowerCase() ?? "athlete_personalization";

  for (const blocked of IMMUTABLE_LEARNING_DOMAINS) {
    if (normalizedDomain.includes(blocked.replaceAll("_", "")) || normalizedDomain === blocked) {
      return {
        allowed: false,
        reason: `Learning cannot modify immutable domain "${blocked}".`,
        blockedDomain: blocked,
      };
    }
  }

  if (!LEARNABLE_INTERVENTION_TYPES.includes(input.interventionType)) {
    return {
      allowed: false,
      reason: `Intervention type "${input.interventionType}" is not eligible for pattern learning.`,
    };
  }

  if (input.provenance.startsWith("safety-layer") || input.provenance.startsWith("medical")) {
    return {
      allowed: false,
      reason: "Safety or medical provenance cannot produce learnable patterns.",
      blockedDomain: "safety_rules",
    };
  }

  return { allowed: true };
}
