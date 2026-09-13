/**
 * One structured Dante response contract (Part 13). Every code path
 * that produces a Dante chat reply — the legacy context-stuffed
 * prompt in app/api/chatbot/route.ts and the new tool-calling
 * orchestrator (orchestrate.ts) alike — returns a shape compatible
 * with this envelope. Never exposes chain-of-thought, system prompts,
 * SQL, embeddings, tokens, or raw tool arguments.
 */
export type DanteResponseEnvelope = {
  reply: string;
  sources?: Array<{ type: string; title: string; url: string }>;
  actions?: Array<{ label: string; type: string }>;
  /** Present only when a write tool call is awaiting an explicit user decision (Part 7/8) — the ONLY way a write ever reaches confirmPendingAction. */
  pendingConfirmation?: { actionId: string; toolName: string; summary: string } | null;
  /** Plain-English labels only (e.g. "Checked today's nutrition") — never raw tool names/args (Part 13). */
  toolTraceSummary?: string[];
};
