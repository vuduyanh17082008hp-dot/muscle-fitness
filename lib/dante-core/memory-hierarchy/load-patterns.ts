import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyDecay } from "@/lib/dante-core/memory-hierarchy/consolidate";
import { isMissingRelationError } from "@/lib/dante-core/memory-hierarchy/schema-availability";
import type {
  ContextKey,
  DanteLearnedPattern,
  InterventionType,
} from "@/lib/dante-core/memory-hierarchy/types";

type PatternRow = {
  id: string;
  user_id: string;
  context_key: string;
  intervention_type: string;
  tier: string;
  status: string;
  sample_count: number;
  positive_count: number;
  confidence: number;
  summary: string;
  first_observed_at: string;
  last_reinforced_at: string;
  requires_confirmation: boolean | null;
};

let loggedMissingLearnedPatternsTable = false;

function noteMissingLearnedPatternsTable(context: string): void {
  if (loggedMissingLearnedPatternsTable) return;
  loggedMissingLearnedPatternsTable = true;
  console.info(
    `[DANTE MEMORY HIERARCHY] dante_learned_patterns unavailable (${context}) — persistent learned-pattern memory is disabled until its migration is intentionally applied.`,
  );
}

function fromRow(row: PatternRow): DanteLearnedPattern {
  return {
    id: row.id,
    userId: row.user_id,
    contextKey: row.context_key,
    interventionType: row.intervention_type as InterventionType,
    tier: row.tier as DanteLearnedPattern["tier"],
    status: row.status as DanteLearnedPattern["status"],
    sampleCount: row.sample_count,
    positiveCount: row.positive_count,
    confidence: row.confidence,
    summary: row.summary,
    firstObservedAt: row.first_observed_at,
    lastReinforcedAt: row.last_reinforced_at,
    requiresConfirmation: row.requires_confirmation ?? false,
  };
}

/**
 * All of a user's learned patterns, with time-based decay already
 * applied for display/decision purposes — always scoped to `userId`
 * (RLS also enforces this at the database level; this second scoping
 * is what makes cross-user isolation testable without a live database).
 *
 * When the table is not in the live schema (migration not applied),
 * returns [] quietly — this path is optional for current Muscle Fitness
 * Phase 2C and must not fail chat/dashboard loads.
 */
export async function loadLearnedPatterns(
  supabase: SupabaseClient,
  userId: string,
): Promise<DanteLearnedPattern[]> {
  const { data, error } = await supabase
    .from("dante_learned_patterns")
    .select(
      "id, user_id, context_key, intervention_type, tier, status, sample_count, positive_count, confidence, summary, first_observed_at, last_reinforced_at, requires_confirmation",
    )
    .eq("user_id", userId)
    .neq("status", "forgotten")
    .order("confidence", { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      noteMissingLearnedPatternsTable("load");
      return [];
    }
    console.warn("[DANTE MEMORY HIERARCHY] Unable to load learned patterns:", error.message);
    return [];
  }

  const now = new Date();
  return ((data as PatternRow[] | null) ?? []).map((row) => applyDecay(fromRow(row), now));
}

export async function findLearnedPattern(
  supabase: SupabaseClient,
  userId: string,
  contextKey: ContextKey,
  interventionType: InterventionType,
): Promise<DanteLearnedPattern | null> {
  const { data, error } = await supabase
    .from("dante_learned_patterns")
    .select(
      "id, user_id, context_key, intervention_type, tier, status, sample_count, positive_count, confidence, summary, first_observed_at, last_reinforced_at, requires_confirmation",
    )
    .eq("user_id", userId)
    .eq("context_key", contextKey)
    .eq("intervention_type", interventionType)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      noteMissingLearnedPatternsTable("find");
      return null;
    }
    console.warn("[DANTE MEMORY HIERARCHY] Unable to load pattern:", error.message);
    return null;
  }

  return data ? fromRow(data as PatternRow) : null;
}

/**
 * Upserts the result of consolidate.ts's recordEvidence() — the ONLY
 * write path for dante_learned_patterns. Nothing outside
 * lib/dante-core writes to this table.
 */
export async function upsertLearnedPattern(
  supabase: SupabaseClient,
  existingId: string | null,
  pattern: Omit<DanteLearnedPattern, "id">,
): Promise<void> {
  const row = {
    user_id: pattern.userId,
    context_key: pattern.contextKey,
    intervention_type: pattern.interventionType,
    tier: pattern.tier,
    status: pattern.status,
    sample_count: pattern.sampleCount,
    positive_count: pattern.positiveCount,
    confidence: pattern.confidence,
    summary: pattern.summary,
    first_observed_at: pattern.firstObservedAt,
    last_reinforced_at: pattern.lastReinforcedAt,
    requires_confirmation: pattern.requiresConfirmation,
  };

  const query = existingId
    ? supabase.from("dante_learned_patterns").update(row).eq("id", existingId).eq("user_id", pattern.userId)
    : supabase.from("dante_learned_patterns").insert(row);

  const { error } = await query;

  if (error) {
    if (isMissingRelationError(error)) {
      noteMissingLearnedPatternsTable("upsert");
      return;
    }
    console.error("[DANTE MEMORY HIERARCHY] Unable to save pattern:", error.message);
  }
}

/** User-initiated deletion (mission Part 14: "Memory must be ... deletable"). */
export async function forgetLearnedPattern(
  supabase: SupabaseClient,
  userId: string,
  patternId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Select first so a missing/foreign pattern is an explicit miss —
  // never a silent `{ ok: true }` after deleting zero rows.
  const { data: owned, error: selectError } = await supabase
    .from("dante_learned_patterns")
    .select("id")
    .eq("id", patternId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    if (isMissingRelationError(selectError)) {
      noteMissingLearnedPatternsTable("forget");
      return { ok: false, error: "Learned-pattern memory is not enabled in this environment." };
    }
    console.error("[DANTE MEMORY HIERARCHY] Unable to verify pattern ownership:", selectError.message);
    return { ok: false, error: "Unable to forget this pattern. Please try again." };
  }

  if (!owned) {
    return { ok: false, error: "Pattern not found." };
  }

  const { error } = await supabase
    .from("dante_learned_patterns")
    .delete()
    .eq("id", patternId)
    .eq("user_id", userId);

  if (error) {
    if (isMissingRelationError(error)) {
      noteMissingLearnedPatternsTable("forget");
      return { ok: false, error: "Learned-pattern memory is not enabled in this environment." };
    }
    console.error("[DANTE MEMORY HIERARCHY] Unable to delete pattern:", error.message);
    return { ok: false, error: "Unable to forget this pattern. Please try again." };
  }

  return { ok: true };
}

/**
 * "ASK FIRST" (mission Part 14) — retains the pattern as evidence but
 * marks it so the autonomy gate (lib/dante-core/autonomy/gate.ts)
 * never auto-applies an intervention built from it, regardless of
 * confidence. A soft override, not a deletion.
 */
export async function setPatternRequiresConfirmation(
  supabase: SupabaseClient,
  userId: string,
  patternId: string,
  requiresConfirmation: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("dante_learned_patterns")
    .update({ requires_confirmation: requiresConfirmation })
    .eq("id", patternId)
    .eq("user_id", userId);

  if (error) {
    if (isMissingRelationError(error)) {
      noteMissingLearnedPatternsTable("update");
      return { ok: false, error: "Learned-pattern memory is not enabled in this environment." };
    }
    console.error("[DANTE MEMORY HIERARCHY] Unable to update pattern:", error.message);
    return { ok: false, error: "Unable to update this pattern. Please try again." };
  }

  return { ok: true };
}
