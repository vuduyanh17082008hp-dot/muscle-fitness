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
  | "DANTE_STREAM_FAILED";

export type DanteToolEventMeta = {
  tool?: string;
  durationMs?: number;
  /** IANA zone name only (e.g. "Asia/Singapore") or "unavailable" — never a full profile. */
  timezone?: string;
  /** Coarse pipeline stage label (e.g. "request-start", "groq", "stream"). */
  stage?: string;
  /** A short error CATEGORY (e.g. "timeout", "http_5xx", "abort") — never a raw message, stack trace, or provider payload. */
  errorCategory?: string;
};

export function logToolEvent(event: DanteToolEvent, meta: DanteToolEventMeta): void {
  console.log(`[${event}]`, {
    tool: meta.tool ?? null,
    durationMs: meta.durationMs ?? null,
    timezone: meta.timezone ?? undefined,
    stage: meta.stage ?? undefined,
    errorCategory: meta.errorCategory ?? undefined,
  });
}
