import "server-only";

/**
 * Safe server-side tool events (Part 20). Metadata is deliberately
 * limited to a tool name, an optional duration, and success/failure —
 * never args, results, tokens, prompts, or any user-identifying value.
 */

export type DanteToolEvent =
  | "DANTE_ROUTE_SELECTED"
  | "DANTE_TOOL_SELECTED"
  | "DANTE_TOOL_SUCCESS"
  | "DANTE_TOOL_FAILED"
  | "DANTE_CONFIRMATION_CREATED"
  | "DANTE_CONFIRMATION_EXECUTED"
  | "DANTE_CONFIRMATION_CANCELLED"
  | "DANTE_CONFIRMATION_EXPIRED"
  | "ADAPTIVE_RECOMMENDATION_USED"
  /** Temporal-context/provider/stream diagnostics (bug fix: incorrect
   * time grounding + "temporarily unavailable" investigation) — safe,
   * high-level signal only, see DanteToolEventMeta below. */
  | "DANTE_TIME_CONTEXT_READY"
  | "DANTE_CONTEXT_FAILED"
  | "DANTE_PROVIDER_FAILED"
  | "DANTE_STREAM_FAILED"
  /** Layer 6 Final Response Verifier outcomes — see lib/dante-core/verifier/. */
  | "DANTE_VERIFIER_RETRY"
  | "DANTE_VERIFIER_FALLBACK"
  /** AI-R1D shared-intelligence summary: enums/counts/booleans only (see lib/intelligence/dante-runtime.ts). */
  | "DANTE_INTELLIGENCE"
  /** AI-R1E.1 coach-signal persistence failures (category + counts only). */
  | "DANTE_SIGNAL_PERSISTENCE"
  /** AI-R1E.2 Nutrition Coach signal consumption (enums/counts/booleans only). */
  | "GEMMA_COORDINATION"
  /** H0 WP1 turn runtime: duration, attempt counters, retrieval terminal states (enums/counts only). */
  | "DANTE_RUNTIME";

export type DanteToolEventMeta = {
  tool?: string;
  durationMs?: number;
  /** IANA zone name only (e.g. "Asia/Singapore") or "unavailable" — never a full profile. */
  timezone?: string;
  /** Coarse pipeline stage label (e.g. "request-start", "openai", "stream"). */
  stage?: string;
  /** A short error CATEGORY (e.g. "timeout", "http_5xx", "abort") — never a raw message, stack trace, or provider payload. */
  errorCategory?: string;
  /** Flat enum/count/boolean fields only — never message text, state values, or ids. */
  fields?: Record<string, string | number | boolean>;
};

export function logToolEvent(event: DanteToolEvent, meta: DanteToolEventMeta): void {
  console.log(`[${event}]`, {
    tool: meta.tool ?? null,
    durationMs: meta.durationMs ?? null,
    timezone: meta.timezone ?? undefined,
    stage: meta.stage ?? undefined,
    errorCategory: meta.errorCategory ?? undefined,
    ...(meta.fields && { fields: meta.fields }),
  });
}
