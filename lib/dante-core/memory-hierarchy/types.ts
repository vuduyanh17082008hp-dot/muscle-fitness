/**
 * Dante Memory Hierarchy (mission Part 4).
 *
 * L0 RAW EVENTS   — the existing `app_events` table (see
 *                    lib/events/emit.ts / supabase migration
 *                    20260918090000_events_and_intelligence.sql).
 *                    Nothing new is created for L0 — it already is
 *                    exactly "workout / nutrition / recovery /
 *                    SetVision / connector events", append-only.
 *
 * L1 OBSERVATIONS — `dante_observations` (new, additive table).
 *                    A single meaningful derived fact extracted from
 *                    one or more L0 events, e.g. "reduced Leg Press
 *                    volume by 20% on 2026-09-14 after a low recovery
 *                    score". Still a single data point — not yet a
 *                    pattern.
 *
 * L2/L3 PATTERNS/POLICIES — `dante_learned_patterns` (new, additive
 *                    table). The SAME row moves through `tier`
 *                    ("pattern" -> "policy") as evidence accumulates —
 *                    modeled as one state machine (see consolidate.ts)
 *                    rather than physically migrating rows between
 *                    tables, since "L2 -> L3" is a confidence
 *                    transition, not a change of what the row means.
 *
 * L4 CLIENT STRATEGY — NOT its own table. Computed on read by
 *                    build-client-policy.ts from the current set of
 *                    "policy"-tier dante_learned_patterns rows plus
 *                    dante_memory's explicit preferences. Keeping L4
 *                    derived (not stored) means it can never drift out
 *                    of sync with the L3 evidence it's built from.
 */

export type MemoryTier = "pattern" | "policy";

export type PatternStatus = "active" | "retained" | "demoted" | "forgotten";

/**
 * The deterministic "bucket" a situation is classified into before
 * looking for a pattern — e.g. "poor_sleep_high_stress". Built by
 * response-learning.ts's classifyContext() from real AthleteState
 * signals only; never an LLM's free-text summary of the situation.
 */
export type ContextKey = string;

export type InterventionType =
  | "reduce_volume"
  | "reduce_load"
  | "modify_session"
  | "postpone_exercise"
  | "increase_load"
  | "hold_load"
  | "macro_adjustment"
  | "meal_timing_adjustment"
  | "no_change";

export type ObservedOutcome = "improved" | "maintained" | "worsened" | "unknown";

/**
 * L1 — one derived observation. Stored so a later consolidation pass
 * can look back over raw evidence, not just the rolled-up counters on
 * a pattern row.
 */
export type DanteObservation = {
  id: string;
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  /** Real, already-computed values — e.g. { volumeChangePercent: -12, recoveryScoreBefore: 54 }. Never fabricated. */
  beforeState: Record<string, string | number | null>;
  afterState: Record<string, string | number | null>;
  outcome: ObservedOutcome;
  /** Whether the after-state supported the athlete's current goal (e.g. hypertrophy volume target) — independent of `outcome`, which is about performance/recovery, not goal fit. */
  goalAligned: boolean | null;
  /** Which deterministic engine/skill produced this observation. */
  provenance: string;
  observedAt: string;
};

/**
 * L2/L3 — a repeated context -> intervention -> outcome association.
 * `tier` and `confidence` are the ONLY things that change as evidence
 * accumulates; the identity of the pattern (contextKey + interventionType)
 * never changes once created — new evidence updates the SAME row.
 */
export type DanteLearnedPattern = {
  id: string;
  userId: string;
  contextKey: ContextKey;
  interventionType: InterventionType;
  tier: MemoryTier;
  status: PatternStatus;
  sampleCount: number;
  positiveCount: number;
  /** 0-1. See consolidate.ts for the exact formula — never hand-set. */
  confidence: number;
  /** Plain-language summary a UI can show directly, built deterministically from the counters (never LLM-authored). */
  summary: string;
  firstObservedAt: string;
  lastReinforcedAt: string;
  /** User override via the "ASK FIRST" control (mission Part 14) — when true, the autonomy gate never auto-applies an action derived from this pattern regardless of confidence. */
  requiresConfirmation: boolean;
};

export const MIN_SAMPLES_FOR_PATTERN = 3;
/** A pattern is promoted from "pattern" to "policy" tier once it clears this confidence bar — see consolidate.ts. */
export const POLICY_PROMOTION_CONFIDENCE = 0.7;
/** Below this confidence, a policy-tier row is demoted back to "pattern" rather than continuing to influence decisions. */
export const POLICY_DEMOTION_CONFIDENCE = 0.4;
/** A pattern with confidence at or below this after enough contradictory evidence is retired rather than kept around indefinitely. */
export const FORGET_CONFIDENCE_FLOOR = 0.15;
