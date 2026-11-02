import { describe, expect, it } from "vitest";

import { createChatStreamResponse, parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { fakeAiSupabase as fakeSupabase, type Row } from "./support/fake-ai-messages-supabase";
import { actionResolution, beginDanteTurn, loadTurnHistory, persistChatStream, readTurnIds, type TurnOutcome } from "@/lib/dante-core/conversation-store";

const done = { model: "m", insight: null, sources: [], actions: [], pendingConfirmation: { actionId: "a", toolName: "t", summary: "s" }, toolTraceSummary: ["secret-trace"] };

async function run(produce: Parameters<typeof createChatStreamResponse>[0], ok = true) {
  const outcomes: TurnOutcome[] = [];
  const response = persistChatStream(createChatStreamResponse(produce), async (outcome) => (outcomes.push(outcome), ok), "thread-1");
  const text = await response.text();
  return { outcomes, events: parseChatStreamChunk("", text).events, header: response.headers.get("X-Dante-Thread-Id") };
}

describe("persistChatStream", () => {
  it("records complete only after done, without tool traces, then reports saved", async () => {
    const { outcomes, events, header } = await run(async (emit) => {
      emit({ type: "delta", text: "Hello " });
      emit({ type: "delta", text: "there" });
      emit({ type: "done", ...done });
    });
    expect(outcomes).toEqual([
      { status: "complete", content: "Hello there", metadata: { insight: null, sources: [], pendingConfirmation: done.pendingConfirmation } },
    ]);
    expect(events.map((event) => event.type)).toEqual(["delta", "delta", "done", "saved"]);
    expect(events.at(-1)).toEqual({ type: "saved", ok: true });
    expect(header).toBe("thread-1");
  });

  it("a stream that ends without done is interrupted, never complete", async () => {
    const { outcomes } = await run(async (emit) => emit({ type: "delta", text: "partial" }));
    expect(outcomes).toEqual([{ status: "interrupted", content: "partial", metadata: {} }]);
  });

  it("an error event is recorded as error and a failed write is reported", async () => {
    const { outcomes, events } = await run(async (emit) => emit({ type: "error", error: "boom", partial: false }), false);
    expect(outcomes[0]?.status).toBe("error");
    expect(events.at(-1)).toEqual({ type: "saved", ok: false });
  });

  it("finalizes even when the client cancels mid-stream", async () => {
    const outcomes: TurnOutcome[] = [];
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const response = persistChatStream(
      createChatStreamResponse(async (emit) => {
        emit({ type: "delta", text: "a" });
        await new Promise((resolve) => setTimeout(resolve, 20));
        emit({ type: "done", ...done });
      }),
      async (outcome) => (outcomes.push(outcome), finish(), true),
      "t",
    );
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await finished;
    expect(outcomes[0]?.status).toBe("complete");
  });

  it("a non-stream response (e.g. 499) finalizes as interrupted", async () => {
    const outcomes: TurnOutcome[] = [];
    persistChatStream(new Response(null, { status: 499 }), async (outcome) => (outcomes.push(outcome), true), "t");
    await Promise.resolve();
    expect(outcomes[0]?.status).toBe("interrupted");
  });
});

describe("actionResolution — authoritative proposal state", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  it.each([
    [{ status: "executed", expires_at: past }, "confirmed"],
    [{ status: "cancelled", expires_at: past }, "cancelled"],
    // MF-S1: replaced by a Modify (or a newer proposal) is not the user's rejection.
    [{ status: "cancelled", expires_at: past, result: { supersededBy: "00000000-0000-4000-8000-000000000001" } }, "superseded"],
    [{ status: "failed", expires_at: past }, "failed"],
    [{ status: "expired", expires_at: past }, "expired"],
    [{ status: "pending", expires_at: past }, "expired"],
    [{ status: "pending", expires_at: future }, null],
    [{ status: "confirmed", expires_at: future }, "unknown"],
    [undefined, "unknown"],
  ])("%j → %s", (row, expected) => expect(actionResolution(row)).toBe(expected));
});

describe("readTurnIds", () => {
  it("accepts only uuid pairs", () => {
    const id = "6f1c1f9e-8a7b-4b1e-9a51-1d2a3b4c5d6e";
    expect(readTurnIds({ threadId: id, clientMessageId: id })).toEqual({ threadId: id, clientMessageId: id });
    expect(readTurnIds({ threadId: "x", clientMessageId: id })).toBeNull();
    expect(readTurnIds({ message: "hi" })).toBeNull();
  });
});

/* ---------------------------------------------------------------- begin/history against an in-memory table fake */

const USER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const OTHER_THREAD = "33333333-3333-4333-8333-333333333333";
const TURN = "44444444-4444-4444-8444-444444444444";

function seededTables(): Record<string, Row[]> {
  return {
    ai_threads: [{ id: THREAD, user_id: USER }, { id: OTHER_THREAD, user_id: USER }],
    ai_messages: [
      { id: "m1", thread_id: THREAD, user_id: USER, client_message_id: TURN, role: "user", content: "Question A", status: "complete", created_at: "2026-10-22T00:00:00.000Z", metadata: {} },
      { id: "m2", thread_id: THREAD, user_id: USER, client_message_id: TURN, role: "assistant", content: "Answer A", status: "complete", created_at: "2026-10-22T00:00:00.001Z", metadata: {}, updated_at: "2026-10-22T00:00:00.001Z" },
    ],
  };
}

describe("beginDanteTurn — idempotency integrity", () => {
  it("same id + different question → 409 TURN_CONFLICT before any write or model work", async () => {
    const tables = seededTables();
    const result = await beginDanteTurn(fakeSupabase(tables), USER, { threadId: THREAD, clientMessageId: TURN }, "Question B");
    expect(result.kind).toBe("respond");
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("TURN_CONFLICT");
    expect(tables.ai_messages.map((row) => row.content)).toEqual(["Question A", "Answer A"]);
  });

  it("identical retry of a completed turn replays the stored answer (no model run)", async () => {
    const result = await beginDanteTurn(fakeSupabase(seededTables()), USER, { threadId: THREAD, clientMessageId: TURN }, "  Question A ");
    expect(result.kind).toBe("respond");
    const text = await (result as { response: Response }).response.text();
    expect(text).toContain("dante-history-replay");
    expect(text).toContain("Answer A");
  });

  it("an interrupted turn retried with the same question reruns on the same rows", async () => {
    const tables = seededTables();
    Object.assign(tables.ai_messages[1], { status: "interrupted", content: "" });
    const result = await beginDanteTurn(fakeSupabase(tables), USER, { threadId: THREAD, clientMessageId: TURN }, "Question A");
    expect(result.kind).toBe("turn");
    expect(tables.ai_messages).toHaveLength(2);
    expect(tables.ai_messages[1].status).toBe("pending");
  });

  it("history comes from this thread's finished rows only, ordered, excluding the current turn", async () => {
    const tables = seededTables();
    tables.ai_messages.push(
      { id: "x1", thread_id: OTHER_THREAD, user_id: USER, client_message_id: "c-x", role: "user", content: "other thread", status: "complete", created_at: "2026-10-22T00:00:01.000Z" },
      { id: "p1", thread_id: THREAD, user_id: USER, client_message_id: "c-p", role: "user", content: "Question P", status: "complete", created_at: "2026-10-22T00:00:02.000Z" },
      { id: "p2", thread_id: THREAD, user_id: USER, client_message_id: "c-p", role: "assistant", content: "half", status: "interrupted", created_at: "2026-10-22T00:00:02.001Z" },
    );
    const NEW_TURN = "55555555-5555-4555-8555-555555555555";
    const result = await beginDanteTurn(fakeSupabase(tables), USER, { threadId: THREAD, clientMessageId: NEW_TURN }, "Question C");
    expect(result.kind).toBe("turn");
    expect((result as { history: Array<{ role: string; content: string }> }).history.map((m) => `${m.role}:${m.content}`)).toEqual([
      "user:Question A",
      "assistant:Answer A",
      "user:Question P",
    ]);
  });

  it("history is bounded per item and in total, dropping the oldest", async () => {
    const tables: Record<string, Row[]> = { ai_messages: [] };
    for (let i = 0; i < 60; i += 1) {
      tables.ai_messages.push({ thread_id: THREAD, user_id: USER, client_message_id: `c${i}`, role: i % 2 ? "assistant" : "user", content: `${i}:${"x".repeat(5_000)}`, status: "complete", created_at: new Date(Date.UTC(2026, 9, 22, 0, 0, i)).toISOString() });
    }
    const history = await loadTurnHistory(fakeSupabase(tables), USER, THREAD, "none");
    expect(history.every((m) => m.content.length <= 4_000)).toBe(true);
    expect(history.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(24_000);
    expect(history.at(-1)?.content.startsWith("59:")).toBe(true);
  });
});
