import {
  FORGET_CONFIDENCE_FLOOR,
  MIN_SAMPLES_FOR_PATTERN,
  POLICY_DEMOTION_CONFIDENCE,
  POLICY_PROMOTION_CONFIDENCE,
  type ContextKey,
  type DanteLearnedPattern,
  type InterventionType,
  type MemoryTier,
  type PatternStatus,
} from "@/lib/dante-core/memory-hierarchy/types";

/**
 * Memory Consolidation (mission Part 4): events -> observations ->
 * repeated evidence -> confidence threshold -> promote / retain /
 * demote. Every function here is pure and deterministic — no LLM
 * involvement, no hidden state. The only inputs are the pattern's own
 * prior counters and one new piece of evidence.
 */

/** Confidence reaches its ceiling once a pattern has this many samples — below it, confidence is capped even at a 100% positive rate, so ONE event can never reach policy-promotion confidence. */
const IDEAL_SAMPLE_SIZE = 8;

/** A policy-tier pattern with no reinforcement for this many days starts decaying. */
const DECAY_START_DAYS = 30;
/** Confidence reaches its fully-decayed floor after this many days with no reinforcement. */
const DECAY_FULL_DAYS = 90;

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * confidence = (positive ratio) x (sample-size weight). Both factors
 * matter: a pattern seen once with a positive outcome has a perfect
 * ratio but near-zero sample weight, so it starts far below the
 * promotion bar. A pattern seen 8+ times needs a genuinely good ratio
 * to reach the same confidence.
 */
export function computePatternConfidence(sampleCount: number, positiveCount: number): number {
  if (sampleCount <= 0) return 0;
  const ratio = positiveCount / sampleCount;
  const sampleWeight = Math.min(1, sampleCount / IDEAL_SAMPLE_SIZE);
  return round(ratio * sampleWeight);
}

function resolveTier(confidence: number, currentTier: MemoryTier): MemoryTier {
  if (currentTier === "pattern" && confidence >= POLICY_PROMOTION_CONFIDENCE) return "policy";
  if (currentTier === "policy" && confidence < POLICY_DEMOTION_CONFIDENCE) return "pattern";
  return currentTier;
}

function resolveStatus(confidence: number, sampleCount: number, tierChanged: "promoted" | "demoted" | "none"): PatternStatus {
  if (confidence <= FORGET_CONFIDENCE_FLOOR && sampleCount >= MIN_SAMPLES_FOR_PATTERN) return "forgotten";
  if (tierChanged === "demoted") return "demoted";
  return "active";
}

function buildSummary(
  contextKey: ContextKey,
  interventionType: InterventionType,
  sampleCount: number,
  positiveCount: number,
  tier: MemoryTier,
): string {
  const contextLabel = contextKey.replaceAll("_", " ");
  const interventionLabel = interventionType.replaceAll("_", " ");
  const qualifier = tier === "policy" ? "historically associated with" : "observed in a small number of cases to be associated with";

  return `During ${contextLabel}, ${interventionLabel} is ${qualifier} a better outcome in ${positiveCount} of ${sampleCount} comparable situations.`;
}

export type NewPatternInput = {
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
};

/**
 * Folds one new piece of evidence (positive or contradictory) into an
 * existing pattern, or creates the first row for a never-seen
 * context/intervention pair. `id` is only ever assigned by the caller
 * for a brand-new pattern (the DB generates it on insert) — pass the
 * existing row's id back in for updates via `existing`.
 */
export function recordEvidence(
  existing: DanteLearnedPattern | null,
  input: NewPatternInput & { positive: boolean; now?: Date },
): Omit<DanteLearnedPattern, "id"> {
  const now = (input.now ?? new Date()).toISOString();

  const sampleCount = (existing?.sampleCount ?? 0) + 1;
  const positiveCount = (existing?.positiveCount ?? 0) + (input.positive ? 1 : 0);
  const confidence = computePatternConfidence(sampleCount, positiveCount);
  const priorTier = existing?.tier ?? "pattern";
  const tier = resolveTier(confidence, priorTier);

  const tierChanged: "promoted" | "demoted" | "none" =
    tier === priorTier ? "none" : tier === "policy" ? "promoted" : "demoted";

  const status = resolveStatus(confidence, sampleCount, tierChanged);

  return {
    userId: input.userId,
    contextKey: input.contextKey,
    interventionType: input.interventionType,
    tier,
    status,
    sampleCount,
    positiveCount,
    confidence,
    summary: buildSummary(input.contextKey, input.interventionType, sampleCount, positiveCount, tier),
    firstObservedAt: existing?.firstObservedAt ?? now,
    lastReinforcedAt: now,
    requiresConfirmation: existing?.requiresConfirmation ?? false,
  };
}

/**
 * Time-based decay for patterns that haven't been reinforced
 * recently — "old evidence may decay" (mission Part 4). Pure function
 * of the pattern's own lastReinforcedAt; never mutates sampleCount or
 * positiveCount (the historical evidence itself doesn't change, only
 * how much weight it's given today).
 */
export function applyDecay(pattern: DanteLearnedPattern, now: Date = new Date()): DanteLearnedPattern {
  const daysSinceReinforced =
    (now.getTime() - new Date(pattern.lastReinforcedAt).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceReinforced <= DECAY_START_DAYS) {
    return pattern;
  }

  const decayProgress = Math.min(
    1,
    (daysSinceReinforced - DECAY_START_DAYS) / (DECAY_FULL_DAYS - DECAY_START_DAYS),
  );

  const decayedConfidence = round(pattern.confidence * (1 - decayProgress));
  const tier = resolveTier(decayedConfidence, pattern.tier);
  const tierChanged: "promoted" | "demoted" | "none" =
    tier === pattern.tier ? "none" : tier === "policy" ? "promoted" : "demoted";

  return {
    ...pattern,
    confidence: decayedConfidence,
    tier,
    status: resolveStatus(decayedConfidence, pattern.sampleCount, tierChanged),
  };
}

/** A pattern only qualifies as a real "learned policy" the rest of the system may act on — never a single-event blip. */
export function isActionablePolicy(pattern: DanteLearnedPattern): boolean {
  return (
    pattern.tier === "policy" &&
    pattern.status === "active" &&
    pattern.sampleCount >= MIN_SAMPLES_FOR_PATTERN &&
    pattern.confidence >= POLICY_PROMOTION_CONFIDENCE
  );
}
