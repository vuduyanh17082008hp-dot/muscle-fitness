/**
 * Dante's epistemic taxonomy (Phase 1) — provider-neutral, belongs to
 * Dante Core, not to any LLM provider. This module defines WHAT
 * information means and what authority it has; the provider (OpenAI)
 * only generates language from it.
 */

export type DanteEvidenceKind =
  | "system_fact"
  | "user_report"
  | "user_subjective_report"
  | "verified_memory"
  | "user_claimed_memory"
  | "external_evidence"
  | "retrieved_knowledge"
  | "model_inference"
  | "unknown";

export type DanteConfidence = "high" | "medium" | "low";

export type DanteEpistemicItem = {
  kind: DanteEvidenceKind;
  label: string;
  value?: string | number | boolean | null;
  confidence?: DanteConfidence;
};

/** A named conflict between a user claim and a system-authoritative value — never silently reconciled, always surfaced with both sides named. */
export type DanteConflict = {
  description: string;
  systemSide: string;
  userSide: string;
};

/**
 * A compact, explicitly-labeled context capsule — the alternative to
 * making the model reverse-engineer provenance from one undifferentiated
 * JSON dump. Phase 1 populates this only where the app already has
 * deterministic ground truth (system facts, verified memory, known
 * gaps); it deliberately does NOT attempt to pre-classify the user's
 * own freeform claims (self-report vs subjective vs claimed-memory) —
 * that distinction is taught to the model via the epistemic policy
 * prompt instead (see policy.ts), since it requires judgment no
 * regex/heuristic can reliably apply to arbitrary user text.
 */
export type DanteEpistemicCapsule = {
  facts: DanteEpistemicItem[];
  verifiedMemory: DanteEpistemicItem[];
  unknowns: string[];
  conflicts: DanteConflict[];
  constraints: string[];
};

export function emptyEpistemicCapsule(): DanteEpistemicCapsule {
  return { facts: [], verifiedMemory: [], unknowns: [], conflicts: [], constraints: [] };
}
