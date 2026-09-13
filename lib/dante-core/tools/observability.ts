import "server-only";

/**
 * Safe server-side tool events (Part 20). Metadata is deliberately
 * limited to a tool name, an optional duration, and success/failure —
 * never args, results, tokens, prompts, or any user-identifying value.
 */

export type DanteToolEvent =
  | "DANTE_TOOL_SELECTED"
  | "DANTE_TOOL_SUCCESS"
  | "DANTE_TOOL_FAILED"
  | "DANTE_CONFIRMATION_CREATED"
  | "DANTE_CONFIRMATION_EXECUTED"
  | "DANTE_CONFIRMATION_CANCELLED"
  | "DANTE_CONFIRMATION_EXPIRED";

export type DanteToolEventMeta = {
  tool: string;
  durationMs?: number;
};

export function logToolEvent(event: DanteToolEvent, meta: DanteToolEventMeta): void {
  console.log(`[${event}]`, { tool: meta.tool, durationMs: meta.durationMs ?? null });
}
