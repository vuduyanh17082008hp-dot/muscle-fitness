import type { DanteInsight } from "@/lib/dante-core/insight";

/**
 * The wire format for /api/chatbot's streaming response — a plain
 * newline-delimited JSON (NDJSON) body, one event object per line.
 * Deliberately the simplest transport that supports true incremental
 * text plus structured metadata arriving after completion (mission
 * "STREAM TRANSPORT": ReadableStream / streaming fetch, no SSE
 * library, no WebSocket, no LangChain).
 *
 * Shared between the server (app/api/chatbot/route.ts) and the client
 * (components/dante-chat.tsx) so both sides agree on one contract
 * rather than each guessing the other's shape.
 */

export type ChatStreamDeltaEvent = {
  type: "delta";
  /** One incremental piece of the assistant reply — never a full re-send of prior text. */
  text: string;
};

export type ChatStreamSource = { type: string; title: string; url: string };
export type ChatStreamAction = { label: string; type: string };
export type ChatStreamPendingConfirmation = { actionId: string; toolName: string; summary: string };

export type ChatStreamDoneEvent = {
  type: "done";
  model: string;
  /**
   * "Why This?" structured insight — see lib/dante-core/insight.ts.
   * Only ever a real deterministic recommendation, never fabricated,
   * and only meaningful once the full reply (and the engine data it
   * traces to) is settled — hence delivered on completion, not mid-stream.
   */
  insight: DanteInsight | null;
  sources: ChatStreamSource[];
  actions: ChatStreamAction[];
  /**
   * Present only when a write tool call is awaiting explicit user
   * confirmation. The client must never render Confirm/Cancel controls
   * before this event carries a real value (mission Part 11).
   */
  pendingConfirmation: ChatStreamPendingConfirmation | null;
  toolTraceSummary: string[];
  safetyTriggered?: boolean;
  safetyCategory?: string | null;
};

export type ChatStreamErrorEvent = {
  type: "error";
  /** Safe, user-facing message only — never a stack trace or provider payload. */
  error: string;
  /** True when some assistant text was already streamed before the failure — the client should keep it and mark the reply as interrupted rather than discard it. */
  partial: boolean;
};

export type ChatStreamEvent = ChatStreamDeltaEvent | ChatStreamDoneEvent | ChatStreamErrorEvent;

export const CHAT_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export type ParsedChatStreamChunk = {
  /** Complete events found in this chunk, in order. */
  events: ChatStreamEvent[];
  /** Trailing partial line to prepend to the next raw chunk — network reads rarely land exactly on a line boundary. */
  remainder: string;
};

/**
 * Pure NDJSON line parser shared by the server (tests) and the client
 * (components/dante-chat.tsx) so both sides decode the exact same way
 * instead of the client re-implementing its own ad hoc split/parse.
 * A malformed line (a chunk split mid-JSON, or a stray non-JSON line)
 * is skipped rather than thrown — one bad line must never abort an
 * otherwise-good stream.
 */
export function parseChatStreamChunk(previousRemainder: string, rawChunk: string): ParsedChatStreamChunk {
  const buffer = previousRemainder + rawChunk;
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";

  const events: ChatStreamEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line) as unknown;

      if (isChatStreamEvent(parsed)) {
        events.push(parsed);
      }
    } catch {
      // Skip a malformed/partial line rather than failing the whole stream.
    }
  }

  return { events, remainder };
}

/**
 * Client-side interruption copy (mission "ERROR DURING STREAM" /
 * "SEND STATE"): a user Stop or a mid-stream failure must keep
 * whatever text already arrived and clearly mark it as interrupted,
 * never silently discard it and never leave it looking like a
 * normal, complete answer. Pulled out as pure functions (rather than
 * inlined in the component) so this exact behavior is unit-testable
 * without a DOM.
 */
export function resolveAbortedContent(existingContent: string): string {
  return existingContent ? `${existingContent}\n\n*Stopped.*` : "Stopped.";
}

/**
 * Prefer already-streamed text over a generic fallback.
 * Never wipe a usable answer when a later stage fails — even if the
 * server `partial` flag is missing or wrong.
 */
export function resolveStreamErrorContent(existingContent: string, _partial: boolean, fallbackMessage: string): string {
  if (existingContent.trim().length > 0) {
    return `${existingContent}\n\n*Response interrupted.*`;
  }
  return fallbackMessage;
}

function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: unknown }).type !== undefined &&
    ["delta", "done", "error"].includes((value as { type: unknown }).type as string)
  );
}

/**
 * Builds the actual streamed HTTP Response from an async generator of
 * events — the one place that turns the ChatStreamEvent contract into
 * bytes, so every call site in the route (safety layer, agentic tool
 * loop, legacy Groq path) frames its output identically.
 */
export function createChatStreamResponse(
  produce: (emit: (event: ChatStreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const emit = (event: ChatStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await produce(emit);
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": CHAT_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * For response paths that already have the FULL reply text up front
 * (the safety layer's fixed escalation copy, the agentic tool loop's
 * already-computed reply) — framed as a single delta immediately
 * followed by `done`, so the client's parser never needs a second
 * "non-streaming" code path.
 */
export function createSingleShotChatStream(replyText: string, done: Omit<ChatStreamDoneEvent, "type">): Response {
  return createChatStreamResponse(async (emit) => {
    emit({ type: "delta", text: replyText });
    emit({ type: "done", ...done });
  });
}
