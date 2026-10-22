import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHAT_STREAM_CONTENT_TYPE,
  createSingleShotChatStream,
  parseChatStreamChunk,
  type ChatStreamDoneEvent,
  type ChatStreamPendingConfirmation,
} from "@/lib/dante-core/chat-stream-protocol";
import { TURN_DEADLINE_MS } from "@/lib/dante-core/turn-budget";

/**
 * Dante conversation persistence on the existing ai_threads / ai_messages tables (user-scoped client, RLS: own rows).
 * The client owns the ids (threadId per conversation, clientMessageId per turn) so a retried turn lands on the same
 * two rows instead of duplicating them. The assistant row is written as `pending` BEFORE the model runs and only
 * becomes `complete` when the server's own stream emitted `done` — a refresh mid-stream can never look finished.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DanteTurn = { userId: string; threadId: string; clientMessageId: string; userMessage: string; startedAt: number };

export type AssistantMetadata = {
  insight?: ChatStreamDoneEvent["insight"];
  sources?: ChatStreamDoneEvent["sources"];
  pendingConfirmation?: ChatStreamPendingConfirmation | null;
  error?: string;
};

/** One prior turn as the chat route's history helpers read it (same shape the client used to send). */
export type HistoryMessage = { role: "user" | "assistant"; content: string; createdAt: string };

export type BeginTurnResult =
  | { kind: "none" }
  | { kind: "turn"; turn: DanteTurn; saved: boolean; history: HistoryMessage[] }
  | { kind: "respond"; response: Response };

// Same id must mean same question. NFC so a re-encoded but identical string is still "the same"; the route trims.
const sameQuestion = (stored: string, incoming: string) => stored.trim().normalize("NFC") === incoming.trim().normalize("NFC");

const turnConflict = () =>
  Response.json(
    { ok: false, code: "TURN_CONFLICT", error: "This message id was already used for a different message." },
    { status: 409 },
  );

/** Bounds for the server-loaded context: ~20 user turns with their replies, oldest dropped first. */
const HISTORY_ROWS = 40;
const HISTORY_ITEM_CHARS = 4_000;
const HISTORY_TOTAL_CHARS = 24_000;

/**
 * The thread's own prior turns, from storage — never the client's copy, so another thread's (or invented) text
 * can't be passed off as this conversation. Only finished rows: a pending/interrupted/failed reply never becomes
 * "what Dante said". Excludes the current turn. Ownership is checked by the caller and again by `user_id`.
 */
export async function loadTurnHistory(supabase: SupabaseClient, userId: string, threadId: string, excludeClientMessageId: string): Promise<HistoryMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("role, content, created_at, client_message_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .eq("status", "complete")
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROWS + 2);
  if (error) throw error;
  const out: HistoryMessage[] = [];
  let total = 0;
  for (const row of data ?? []) {
    if (row.client_message_id === excludeClientMessageId) continue;
    const content = String(row.content ?? "").slice(0, HISTORY_ITEM_CHARS);
    if (!content.trim()) continue;
    if (out.length >= HISTORY_ROWS || total + content.length > HISTORY_TOTAL_CHARS) break;
    total += content.length;
    out.push({ role: row.role as HistoryMessage["role"], content, createdAt: row.created_at as string });
  }
  return out.reverse();
}

/** Persistence ids from the request body; absent ids (legacy callers, harnesses) mean "don't persist". */
export function readTurnIds(body: unknown): { threadId: string; clientMessageId: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { threadId, clientMessageId } = body as Record<string, unknown>;
  if (typeof threadId !== "string" || typeof clientMessageId !== "string") return null;
  if (!UUID.test(threadId) || !UUID.test(clientMessageId)) return null;
  return { threadId, clientMessageId };
}

class TurnConflictError extends Error {
  constructor() {
    super("client_message_id already holds a different message");
  }
}

async function ensureTurnRows(supabase: SupabaseClient, turn: DanteTurn): Promise<void> {
  const at = new Date(turn.startedAt);
  const keys = { thread_id: turn.threadId, user_id: turn.userId, client_message_id: turn.clientMessageId };
  const user = await supabase
    .from("ai_messages")
    .upsert(
      { ...keys, role: "user", content: turn.userMessage, status: "complete", created_at: at.toISOString() },
      { onConflict: "thread_id,client_message_id,role", ignoreDuplicates: true },
    );
  if (user.error) throw user.error;
  const stored = await supabase
    .from("ai_messages")
    .select("content")
    .eq("thread_id", turn.threadId)
    .eq("client_message_id", turn.clientMessageId)
    .eq("role", "user")
    .maybeSingle();
  if (stored.error) throw stored.error;
  // Never attach a reply to a different question that already owns this id.
  if (!stored.data || !sameQuestion(stored.data.content, turn.userMessage)) throw new TurnConflictError();
  // +1 ms keeps the reply ordered after its question when both rows share a created_at ordering.
  const assistant = await supabase
    .from("ai_messages")
    .upsert(
      { ...keys, role: "assistant", content: "", status: "pending", created_at: new Date(at.getTime() + 1).toISOString() },
      { onConflict: "thread_id,client_message_id,role", ignoreDuplicates: true },
    );
  if (assistant.error) throw assistant.error;
}

/**
 * Called after auth + validation, before any model work. Persists the user turn and a pending assistant row.
 * A thread id owned by someone else is a 404 (never created, never revealed). A turn whose reply is already
 * complete is replayed from storage instead of re-running the model; one still in flight is a 409.
 */
export async function beginDanteTurn(
  supabase: SupabaseClient,
  userId: string,
  body: unknown,
  userMessage: string,
  now = Date.now(),
): Promise<BeginTurnResult> {
  const ids = readTurnIds(body);
  if (!ids) return { kind: "none" };
  const turn: DanteTurn = { userId, ...ids, userMessage, startedAt: now };

  try {
    const created = await supabase
      .from("ai_threads")
      .upsert({ id: ids.threadId, user_id: userId, title: userMessage.slice(0, 80) }, { onConflict: "id", ignoreDuplicates: true });
    if (created.error) throw created.error;

    const owned = await supabase.from("ai_threads").select("id").eq("id", ids.threadId).eq("user_id", userId).maybeSingle();
    if (owned.error) throw owned.error;
    if (!owned.data) {
      return { kind: "respond", response: Response.json({ ok: false, error: "Conversation not found." }, { status: 404 }) };
    }

    // Checked BEFORE replay or model work: an id already bound to another question is a conflict, never a re-answer.
    const question = await supabase
      .from("ai_messages")
      .select("content")
      .eq("thread_id", ids.threadId)
      .eq("client_message_id", ids.clientMessageId)
      .eq("role", "user")
      .maybeSingle();
    if (question.error) throw question.error;
    if (question.data && !sameQuestion(question.data.content, userMessage)) return { kind: "respond", response: turnConflict() };

    const existing = await supabase
      .from("ai_messages")
      .select("id, content, status, metadata, updated_at")
      .eq("thread_id", ids.threadId)
      .eq("client_message_id", ids.clientMessageId)
      .eq("role", "assistant")
      .maybeSingle();
    if (existing.error) throw existing.error;

    if (existing.data?.status === "complete") {
      const meta = (existing.data.metadata ?? {}) as AssistantMetadata;
      const replay = createSingleShotChatStream(existing.data.content, {
        model: "dante-history-replay",
        insight: meta.insight ?? null,
        sources: meta.sources ?? [],
        actions: [],
        pendingConfirmation: meta.pendingConfirmation ?? null,
        toolTraceSummary: ["history:replay"],
      });
      return { kind: "respond", response: withThreadHeader(replay, ids.threadId) };
    }
    if (existing.data?.status === "pending" && now - Date.parse(existing.data.updated_at) < TURN_DEADLINE_MS) {
      return {
        kind: "respond",
        response: Response.json({ ok: false, code: "TURN_IN_PROGRESS", error: "That reply is still being generated." }, { status: 409 }),
      };
    }

    await ensureTurnRows(supabase, turn);
    if (existing.data) {
      // Retry of an interrupted/failed (or stale pending) turn: same row goes back to pending — no second reply row.
      const reset = await supabase
        .from("ai_messages")
        .update({ content: "", status: "pending", metadata: {}, updated_at: new Date(now).toISOString() })
        .eq("id", existing.data.id);
      if (reset.error) throw reset.error;
    }
    await supabase.from("ai_threads").update({ updated_at: new Date(now).toISOString() }).eq("id", ids.threadId);
    return { kind: "turn", turn, saved: true, history: await loadTurnHistory(supabase, userId, ids.threadId, ids.clientMessageId) };
  } catch (error) {
    // A conflict can only surface here through a race (another request bound the id between the check and the write).
    if (error instanceof TurnConflictError) return { kind: "respond", response: turnConflict() };
    console.error("[DANTE HISTORY] begin turn failed", error);
    // Storage unavailable: no history rather than the client's unverifiable copy.
    return { kind: "turn", turn, saved: false, history: [] };
  }
}

export type TurnOutcome =
  | { status: "complete"; content: string; metadata: AssistantMetadata }
  | { status: "error" | "interrupted"; content: string; metadata: AssistantMetadata };

/** Writes the assistant row's final state. Returns true only when exactly that row was updated. */
export async function finalizeDanteTurn(supabase: SupabaseClient, turn: DanteTurn, outcome: TurnOutcome, saved: boolean): Promise<boolean> {
  try {
    // begin may have failed (or timed out) before its rows landed: write them now so the reply has its question.
    if (!saved) await ensureTurnRows(supabase, turn);
    const { data, error } = await supabase
      .from("ai_messages")
      .update({ content: outcome.content, status: outcome.status, metadata: outcome.metadata, updated_at: new Date().toISOString() })
      .eq("thread_id", turn.threadId)
      .eq("client_message_id", turn.clientMessageId)
      .eq("role", "assistant")
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) === 1;
  } catch (error) {
    console.error("[DANTE HISTORY] finalize turn failed", error);
    return false;
  }
}

function withThreadHeader(response: Response, threadId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Dante-Thread-Id", threadId);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Passes the chat stream through unchanged while recording what the server actually sent, then finalizes the
 * assistant row and appends one `{type:"saved", ok}` line so the client can tell the user when history failed.
 * A client disconnect does not cancel the source: the producer is already bounded by the turn budget, and the
 * row must still reach a terminal state (complete if `done` was emitted, otherwise interrupted).
 */
export function persistChatStream(
  response: Response,
  finalize: (outcome: TurnOutcome) => Promise<boolean>,
  threadId: string,
): Response {
  const isStream = response.body && (response.headers.get("Content-Type") ?? "").startsWith(CHAT_STREAM_CONTENT_TYPE.split(";")[0]);
  if (!isStream || !response.body) {
    void finalize({ status: response.status === 499 ? "interrupted" : "error", content: "", metadata: {} });
    return response;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let clientGone = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      let remainder = "";
      let outcome = null as TurnOutcome | null;
      const take = (chunk: string) => {
        const parsed = parseChatStreamChunk(remainder, chunk);
        remainder = parsed.remainder;
        for (const event of parsed.events) {
          if (event.type === "delta") text += event.text;
          else if (event.type === "done") {
            outcome = {
              status: "complete",
              content: text,
              metadata: { insight: event.insight, sources: event.sources, pendingConfirmation: event.pendingConfirmation },
            };
          } else if (event.type === "error" && !outcome) {
            outcome = { status: "error", content: text, metadata: { error: event.error } };
          }
        }
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          take(decoder.decode(value, { stream: true }));
          if (!clientGone) {
            try {
              controller.enqueue(value);
            } catch {
              clientGone = true;
            }
          }
        }
        take(`${decoder.decode()}\n`);
      } catch {
        // Source failed mid-stream: whatever was not confirmed by `done` is recorded as interrupted below.
      }
      const ok = await finalize(outcome ?? { status: "interrupted", content: text, metadata: {} });
      if (clientGone) return;
      try {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "saved", ok })}\n`));
        controller.close();
      } catch {
        // client went away during finalize
      }
    },
    cancel() {
      clientGone = true;
    },
  });

  const headers = new Headers(response.headers);
  headers.set("X-Dante-Thread-Id", threadId);
  return new Response(stream, { status: response.status, headers });
}

/* ---------------------------------------------------------------- reads (GET /api/dante/conversations) */

export type ActionResolution = "confirmed" | "cancelled" | "failed" | "expired" | "unknown" | null;

/**
 * Authoritative proposal state from dante_tool_actions — never from what the reply text said. `null` = still
 * actionable. A claimed-but-unfinished ('confirmed') or missing row proves nothing about the write: "unknown".
 */
export function actionResolution(row: { status: string; expires_at: string } | undefined, now = Date.now()): ActionResolution {
  if (!row) return "unknown";
  switch (row.status) {
    case "executed":
      return "confirmed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "pending":
      return Date.parse(row.expires_at) > now ? null : "expired";
    default:
      return "unknown";
  }
}

export async function listDanteThreads(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("ai_threads")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, title: (row.title as string | null) ?? "Conversation", updatedAt: row.updated_at as string }));
}

export type StoredDanteMessage = {
  id: string;
  clientMessageId: string | null;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "complete" | "error" | "interrupted";
  createdAt: string;
  insight: AssistantMetadata["insight"] | null;
  sources: AssistantMetadata["sources"];
  pendingConfirmation: ChatStreamPendingConfirmation | null;
  confirmationResolution: ActionResolution;
};

/** null = no such thread for this user (missing or someone else's — indistinguishable on purpose). */
export async function loadDanteThread(supabase: SupabaseClient, userId: string, threadId: string): Promise<StoredDanteMessage[] | null> {
  if (!UUID.test(threadId)) return null;
  const thread = await supabase.from("ai_threads").select("id").eq("id", threadId).eq("user_id", userId).maybeSingle();
  if (thread.error) throw thread.error;
  if (!thread.data) return null;

  // ponytail: newest 200 messages only; add paging when a conversation outgrows that.
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, client_message_id, role, content, status, metadata, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []).reverse();

  const actionIds = rows
    .map((row) => (row.metadata as AssistantMetadata | null)?.pendingConfirmation?.actionId)
    .filter((id): id is string => typeof id === "string" && UUID.test(id));
  const actions = new Map<string, { status: string; expires_at: string }>();
  if (actionIds.length > 0) {
    const read = await supabase.from("dante_tool_actions").select("id, status, expires_at").eq("user_id", userId).in("id", actionIds);
    if (read.error) throw read.error;
    for (const row of read.data ?? []) actions.set(row.id as string, row as { status: string; expires_at: string });
  }

  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as AssistantMetadata;
    const pending = meta.pendingConfirmation ?? null;
    return {
      id: row.id as string,
      clientMessageId: (row.client_message_id as string | null) ?? null,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      status: row.status as StoredDanteMessage["status"],
      createdAt: row.created_at as string,
      insight: meta.insight ?? null,
      sources: meta.sources ?? [],
      pendingConfirmation: pending,
      confirmationResolution: pending ? actionResolution(actions.get(pending.actionId)) : null,
    };
  });
}
