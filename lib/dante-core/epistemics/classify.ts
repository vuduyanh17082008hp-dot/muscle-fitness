import "server-only";

import type { DanteEpistemicItem } from "@/lib/dante-core/epistemics/types";

/**
 * Deterministic helpers for the parts of the epistemic taxonomy the
 * app can actually decide ahead of the LLM call — never guesses about
 * the user's own freeform text (that distinction is taught to the
 * model via policy.ts's prompt instructions, not classified here).
 */

/**
 * A "previously said" claim is verified memory ONLY if it's among the
 * records Dante's memory system actually returned this turn — never
 * because the user's claim sounds plausible. No memory PROMOTION
 * happens here (out of Phase 1 scope); this only labels what's
 * already been retrieved.
 */
export function verifiedMemoryItems(records: Array<{ summary: string }>): DanteEpistemicItem[] {
  return records.map((record) => ({ kind: "verified_memory", label: record.summary }));
}

export function hasVerifiedMemory(records: unknown[]): boolean {
  return records.length > 0;
}

/**
 * Section 19's specific, narrow fix: a "green" (or any) training-load
 * state describes only the load/session pattern it was computed from.
 * It does not by itself establish readiness when today's recovery
 * check-in hasn't happened. Returns null when there's nothing to
 * caveat (no training-load state, or a check-in already exists).
 */
export function trainingLoadReadinessCaveat(input: {
  trainingLoadState: string | null | undefined;
  hasRecoveryCheckin: boolean;
}): string | null {
  if (!input.trainingLoadState || input.hasRecoveryCheckin) {
    return null;
  }

  return `Training load is currently reported as "${input.trainingLoadState}", but today's recovery check-in is missing. Training load alone does not establish readiness — the readiness picture is incomplete; do not imply "${input.trainingLoadState}" means recovered/ready.`;
}
