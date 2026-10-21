import { describe, expect, it } from "vitest";

import { createChatStreamResponse, parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { actionResolution, persistChatStream, readTurnIds, type TurnOutcome } from "@/lib/dante-core/conversation-store";

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
