/**
 * Layer 6 — Final Response Verifier. Runs on the LLM's ACTUAL output
 * text (not on its inputs) before that text is allowed to reach the
 * user. Every check here is a pure function over already-known,
 * traceable data — none of it asks an LLM anything.
 */

export type VerifierSeverity = "blocker" | "warning";

export type VerifierCheckCode =
  | "invented_athlete_metric"
  | "deterministic_value_mutation"
  | "citation_mismatch"
  | "safety_override_violated"
  | "claimed_tool_capability"
  /** Not produced by any check function — set directly by runVerifiedGeneration when `generate` itself throws (a provider failure, not a content problem). */
  | "generation_failed";

export type VerifierFinding = {
  code: VerifierCheckCode;
  severity: VerifierSeverity;
  message: string;
};

/**
 * Partial-failure recovery (Dante P1 fix): a blocker finding no longer
 * collapses straight to "cannot answer anything" — it's classified
 * into one of these outcomes so the correction brief and, if retries
 * are exhausted, the fallback text can respond specifically instead
 * of generically. "unsafe_component" (from a real safety-override
 * violation) is the only one that can never be relaxed by a
 * regeneration — the others are recoverable via a decomposed,
 * partial-answer retry.
 */
export type VerifierOutcome =
  | "verified"
  | "partially_verified"
  | "unsafe_component"
  | "insufficient_evidence"
  | "tool_unavailable"
  | "failed";

export type VerifierFact = {
  /** Human-readable label as it would appear in prose, e.g. "readiness score", "sleep hours" — matched case-insensitively, camelCase auto-split. */
  label: string;
  value: number;
};

export type VerifierSafetyState = {
  triggered: boolean;
  /** The exact escalation text the reply must match when triggered is true. Null only if triggered is false. */
  responseOverride: string | null;
};

export type VerifierInput = {
  replyText: string;
  /** Every numeric fact the reply is allowed to state — from dataUsed, athlete state, etc. Anything else asserted as a specific athlete metric is invented. */
  knownFacts: VerifierFact[];
  /** Titles/short labels of sources actually retrieved and available this turn. */
  availableSources: string[];
  safety: VerifierSafetyState | null;
  /**
   * Tool/action names (or human-readable trace labels) actually
   * executed this turn — from the agent tool loop's toolTraceSummary,
   * or omitted/empty on paths (like the legacy Q&A prompt) that never
   * execute a tool at all. Used only to catch the reply CLAIMING an
   * external action (send an email, make a call) that never happened
   * — see checkToolCapabilityClaim.
   */
  executedActions?: string[];
};

export type VerifierResult = {
  passed: boolean;
  outcome: VerifierOutcome;
  findings: VerifierFinding[];
  /** Non-null only when passed is false — structured brief for Layer 5 to use on a regeneration attempt. */
  correctionBrief: string | null;
};
