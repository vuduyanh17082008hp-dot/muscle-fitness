/**
 * Phase 2C — Lightweight client-specific strategy scoring.
 *
 * Not RL. Scores candidate interventions from that athlete's own
 * pattern history using success rate, confidence, context similarity,
 * and recency. One-shot certainty is impossible (sample floor).
 * Cross-client leakage is forbidden.
 */

import { isActionablePolicy } from "@/lib/dante-core/memory-hierarchy/consolidate";
import { assertSameClient } from "@/lib/dante-core/memory-hierarchy/memory-foundation";
import {
  MIN_SAMPLES_FOR_PATTERN,
  type ContextKey,
  type DanteLearnedPattern,
  type InterventionType,
} from "@/lib/dante-core/memory-hierarchy/types";
import type { OutcomeClass } from "@/lib/dante-core/recommendation-outcome";

export type StrategyScore = {
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  score: number;
  confidence: number;
  sampleCount: number;
  successRate: number;
  contextSimilarity: number;
  recencyWeight: number;
  actionable: boolean;
  reasons: string[];
};

export type StrategyHistoryEntry = {
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  outcomeClass: OutcomeClass;
  evaluatedAt: string;
};

const RECENCY_HALF_LIFE_DAYS = 21;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Token-overlap similarity between context keys like
 * "poor_sleep_high_stress" and "poor_sleep". Exact match = 1.
 */
export function contextSimilarity(a: ContextKey, b: ContextKey): number {
  if (a === b) return 1;
  if (a === "insufficient_data" || b === "insufficient_data") return 0;

  const tokensA = new Set(a.split("_").filter(Boolean));
  const tokensB = new Set(b.split("_").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return clamp01(overlap / union);
}

export function recencyWeight(lastReinforcedAt: string, now: Date = new Date()): number {
  const days =
    (now.getTime() - new Date(lastReinforcedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(days) || days < 0) return 0;
  return clamp01(Math.exp(-days / RECENCY_HALF_LIFE_DAYS));
}

/**
 * Score one learned pattern for the current context. Requires the
 * pattern's userId to match the requesting athlete.
 */
export function scoreStrategy(input: {
  userId: string;
  currentContext: ContextKey;
  pattern: DanteLearnedPattern;
  now?: Date;
}): StrategyScore {
  assertSameClient(input.userId, input.pattern.userId);

  const now = input.now ?? new Date();
  const similarity = contextSimilarity(input.currentContext, input.pattern.contextKey);
  const successRate =
    input.pattern.sampleCount > 0 ? input.pattern.positiveCount / input.pattern.sampleCount : 0;
  const recent = recencyWeight(input.pattern.lastReinforcedAt, now);

  // No one-shot certainty: sample floor caps score until enough evidence.
  const sampleFloor = Math.min(1, input.pattern.sampleCount / MIN_SAMPLES_FOR_PATTERN);
  const confidence = input.pattern.confidence;

  const score = clamp01(
    0.35 * successRate +
      0.25 * confidence +
      0.25 * similarity +
      0.15 * recent,
  ) * sampleFloor;

  const reasons: string[] = [];
  if (input.pattern.sampleCount < MIN_SAMPLES_FOR_PATTERN) {
    reasons.push(`Only ${input.pattern.sampleCount} samples — below the ${MIN_SAMPLES_FOR_PATTERN}-sample floor.`);
  }
  if (similarity < 0.34) {
    reasons.push("Context only weakly overlaps the athlete's learned situation.");
  }
  if (isActionablePolicy(input.pattern)) {
    reasons.push("Pattern is an actionable policy for this athlete.");
  }

  return {
    userId: input.userId,
    contextKey: input.pattern.contextKey,
    interventionType: input.pattern.interventionType,
    score: Math.round(score * 1000) / 1000,
    confidence,
    sampleCount: input.pattern.sampleCount,
    successRate: Math.round(successRate * 1000) / 1000,
    contextSimilarity: Math.round(similarity * 1000) / 1000,
    recencyWeight: Math.round(recent * 1000) / 1000,
    actionable: isActionablePolicy(input.pattern) && similarity >= 0.34,
    reasons,
  };
}

/**
 * Rank interventions for one athlete + context. Patterns belonging to
 * other users are ignored (never scored).
 */
export function rankStrategies(input: {
  userId: string;
  currentContext: ContextKey;
  patterns: DanteLearnedPattern[];
  now?: Date;
}): StrategyScore[] {
  return input.patterns
    .filter((pattern) => pattern.userId === input.userId && pattern.status !== "forgotten")
    .map((pattern) =>
      scoreStrategy({
        userId: input.userId,
        currentContext: input.currentContext,
        pattern,
        now: input.now,
      }),
    )
    .sort((a, b) => b.score - a.score);
}

/**
 * Aggregate SUCCESS-class history into a crude per-intervention
 * success rate for pilot reporting — still client-scoped.
 */
export function summarizeStrategyHistory(
  userId: string,
  history: StrategyHistoryEntry[],
): Record<InterventionType, { trials: number; successes: number; failures: number }> {
  const summary = {} as Record<InterventionType, { trials: number; successes: number; failures: number }>;

  for (const entry of history) {
    if (entry.userId !== userId) continue;
    const bucket = summary[entry.interventionType] ?? { trials: 0, successes: 0, failures: 0 };
    bucket.trials += 1;
    if (entry.outcomeClass === "SUCCESS" || entry.outcomeClass === "PARTIAL_SUCCESS") {
      bucket.successes += 1;
    } else if (entry.outcomeClass === "FAILURE") {
      bucket.failures += 1;
    }
    summary[entry.interventionType] = bucket;
  }

  return summary;
}
