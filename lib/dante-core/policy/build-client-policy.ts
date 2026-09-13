import type { DanteMemory } from "@/lib/dante-core/memory";
import type { DanteLearnedPattern } from "@/lib/dante-core/memory-hierarchy/types";
import { isActionablePolicy } from "@/lib/dante-core/memory-hierarchy/consolidate";
import type { ConfidenceLevel } from "@/lib/dante-core/types";
import {
  emptyClientPolicy,
  type AutonomyLevel,
  type ClientPolicy,
  type LearnedValue,
} from "@/lib/dante-core/policy/types";

/**
 * Builds the L4 Client Strategy view (mission Part 2/6) from current
 * L2/L3 rows + the explicit dante_memory preferences — a pure,
 * synchronous transform with no I/O of its own, exactly like
 * lib/athlete-state/build-dante-context.ts. Everything here is
 * DERIVED from evidence that already exists; nothing is invented.
 */

function confidenceLevelFromFraction(confidence: number): ConfidenceLevel {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.45) return "moderate";
  return "low";
}

function bestPatternFor(
  patterns: DanteLearnedPattern[],
  contextTag: string,
): DanteLearnedPattern | null {
  const matches = patterns.filter(
    (pattern) => pattern.contextKey.includes(contextTag) && isActionablePolicy(pattern),
  );

  if (matches.length === 0) return null;

  return matches.reduce((best, pattern) => (pattern.confidence > best.confidence ? pattern : best));
}

function sensitivityFromPattern(pattern: DanteLearnedPattern | null): LearnedValue<"low" | "moderate" | "high" | null> {
  if (!pattern) {
    return { value: null, confidence: "low", evidenceCount: 0, lastUpdated: null, sourcePatternIds: [] };
  }

  // A confidently-supported "reduce X when Y" pattern IS the evidence
  // that this athlete is meaningfully sensitive to Y — that's what
  // the pattern means, not a separate measurement.
  const sensitivity = pattern.confidence >= 0.85 ? "high" : "moderate";

  return {
    value: sensitivity,
    confidence: confidenceLevelFromFraction(pattern.confidence),
    evidenceCount: pattern.sampleCount,
    lastUpdated: pattern.lastReinforcedAt,
    sourcePatternIds: [pattern.id],
  };
}

export function buildClientPolicy(
  userId: string,
  patterns: DanteLearnedPattern[],
  memory: DanteMemory,
  autonomyLevel: AutonomyLevel,
): ClientPolicy {
  const base = emptyClientPolicy(userId);

  return {
    ...base,
    autonomyLevel,
    volumeTolerance: sensitivityFromPattern(
      bestPatternFor(patterns, "high_stress") ?? bestPatternFor(patterns, "high_training_load"),
    ),
    intensityTolerance: sensitivityFromPattern(bestPatternFor(patterns, "high_soreness")),
    sleepSensitivity: sensitivityFromPattern(bestPatternFor(patterns, "poor_sleep")),
    stressSensitivity: sensitivityFromPattern(bestPatternFor(patterns, "high_stress")),
    preferredExercises: memory.preferredExercises,
    dislikedExercises: memory.dislikedExercises,
    coachingPreference: memory.coachingPreference,
    patterns,
  };
}
