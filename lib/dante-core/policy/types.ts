import type { DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";
import type { ConfidenceLevel } from "@/lib/dante-core/types";

/** GUIDE / ASSIST / AUTOPILOT — mission Part 12. Stored on dante_memory.autonomy_level; DEFAULT is "assist". */
export type AutonomyLevel = "guide" | "assist" | "autopilot";

export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = "assist";

/**
 * A single learned value with its provenance attached — every field
 * on ClientPolicy below is one of these, never a bare number, so a
 * consumer can never use a learned preference without also seeing how
 * much evidence backs it.
 */
export type LearnedValue<T> = {
  value: T;
  confidence: ConfidenceLevel;
  /** How many comparable observations this is built from. */
  evidenceCount: number;
  lastUpdated: string | null;
  /** The learned patterns this value was derived from, for the "EVIDENCE" control (mission Part 14). */
  sourcePatternIds: string[];
};

function unknownValue<T>(fallback: T): LearnedValue<T> {
  return { value: fallback, confidence: "low", evidenceCount: 0, lastUpdated: null, sourcePatternIds: [] };
}

/**
 * L4 CLIENT STRATEGY (mission Part 2/6) — the athlete-specific coaching
 * behavior Dante has actually earned the right to apply. This is a
 * VIEW, computed fresh from current dante_learned_patterns +
 * dante_memory rows (see build-client-policy.ts) — never its own
 * stored table, so it can never drift from the evidence behind it.
 *
 * Every field is a LearnedValue so the caller can see confidence
 * before trusting it, and the whole object explicitly can NEVER
 * override safety rules, medical boundaries, hard user limits, or
 * deterministic source data — see lib/dante-core/autonomy/gate.ts,
 * which always checks safety/limits independently of policy.
 */
export type ClientPolicy = {
  userId: string;
  autonomyLevel: AutonomyLevel;

  /**
   * Deliberately qualitative, not a fitted numeric coefficient — the
   * actual evidence behind these is "N comparable situations, M
   * positive outcomes" (see DanteLearnedPattern), which supports a
   * low/moderate/high read, not a precise fraction. Manufacturing a
   * number here would be fake precision the mission explicitly rules
   * out (Part 3: "Do not fake precision").
   */
  volumeTolerance: LearnedValue<"low" | "moderate" | "high" | null>;
  intensityTolerance: LearnedValue<"low" | "moderate" | "high" | null>;
  sleepSensitivity: LearnedValue<"low" | "moderate" | "high" | null>;
  stressSensitivity: LearnedValue<"low" | "moderate" | "high" | null>;

  /** Explicit, user-set preferences — reused as-is from dante_memory, not re-derived (a user's stated preference always outranks an inferred one). */
  preferredExercises: string[];
  dislikedExercises: string[];
  coachingPreference: string | null;

  /** The full set of active learned patterns backing this policy, for UI/audit — see components/dante/dante-learned-panel.tsx. */
  patterns: DanteLearnedPattern[];
};

export function emptyClientPolicy(userId: string): ClientPolicy {
  return {
    userId,
    autonomyLevel: DEFAULT_AUTONOMY_LEVEL,
    volumeTolerance: unknownValue(null),
    intensityTolerance: unknownValue(null),
    sleepSensitivity: unknownValue(null),
    stressSensitivity: unknownValue(null),
    preferredExercises: [],
    dislikedExercises: [],
    coachingPreference: null,
    patterns: [],
  };
}
