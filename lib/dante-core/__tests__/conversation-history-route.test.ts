/**
 * Server-authoritative conversation history through the real /api/chatbot route: a persisted turn's context is
 * this thread's stored turns, never the client's copy; a reused turn id never reaches the model twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const provider = vi.hoisted(() => ({ prompts: [] as string[] }));
vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: "Zephyr-17." };
    yield { kind: "model", model: "stub-provider" };
  },
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";
import { fakeAiSupabase, type Row } from "./support/fake-ai-messages-supabase";

const USER = "00000000-0000-4000-8000-000000000001";
const THREAD = "22222222-2222-4222-8222-222222222222";
const TURN_1 = "44444444-4444-4444-8444-444444444444";
// Same shape as the live K check: query understanding marks it a follow-up of the stored turn.
const STORED = "For this test my codename is Zephyr-17. Give me one squat warm-up drill in one sentence.";
const SPOOF = "For this test my codename is Basil-99. Give me one squat warm-up drill in one sentence.";
const ASK = "What codename did I give you earlier in this conversation? Answer with just the codename.";

let ai: Record<string, Row[]>;

beforeEach(() => {
  provider.prompts.length = 0;
  ai = {
    ai_threads: [{ id: THREAD, user_id: USER }],
    ai_messages: [
      { id: "m1", thread_id: THREAD, user_id: USER, client_message_id: TURN_1, role: "user", content: STORED, status: "complete", created_at: "2026-10-22T00:00:00.000Z", metadata: {} },
      { id: "m2", thread_id: THREAD, user_id: USER, client_message_id: TURN_1, role: "assistant", content: "Bodyweight squats.", status: "complete", created_at: "2026-10-22T00:00:00.001Z", metadata: {}, updated_at: "2026-10-22T00:00:00.001Z" },
    ],
  };
  const coherence = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  const store = fakeAiSupabase(ai);
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: vi.fn((name: string) => (name === "ai_threads" || name === "ai_messages" ? store.from(name) : coherence(name))),
  } as never);
});

async function post(body: Record<string, unknown>) {
  const response = await POST(
    new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const raw = await response.text();
  return { status: response.status, raw, events: parseChatStreamChunk("", raw).events, prompt: provider.prompts.at(-1) ?? "" };
}

describe("server-authoritative history", () => {
  it("uses the stored turns and ignores a spoofed client history", async () => {
    const turn = await post({
      message: ASK,
      messages: [{ role: "user", content: SPOOF }, { role: "assistant", content: "Noted: Basil-99." }, { role: "user", content: ASK }],
      threadId: THREAD,
      clientMessageId: "55555555-5555-4555-8555-555555555555",
    });
    expect(turn.status).toBe(200);
    expect(provider.prompts).toHaveLength(1);
    expect(turn.prompt).toContain("Zephyr-17");
    expect(turn.prompt).not.toContain("Basil-99");
    expect(turn.events.at(-1)).toEqual({ type: "saved", ok: true });
  });

  it("legacy request without persistence ids still uses the client history (unchanged)", async () => {
    const turn = await post({ message: ASK, messages: [{ role: "user", content: SPOOF }, { role: "user", content: ASK }] });
    expect(turn.prompt).toContain("Basil-99");
  });

  it("reused id with a different message → 409 and no provider call", async () => {
    const turn = await post({ message: "What is the capital of France?", threadId: THREAD, clientMessageId: TURN_1 });
    expect(turn.status).toBe(409);
    expect(JSON.parse(turn.raw).code).toBe("TURN_CONFLICT");
    expect(provider.prompts).toHaveLength(0);
    expect(ai.ai_messages.map((row) => row.content)).toEqual([STORED, "Bodyweight squats."]);
  });

  it("identical retry of a completed turn replays storage, no provider call", async () => {
    const turn = await post({ message: STORED, threadId: THREAD, clientMessageId: TURN_1 });
    expect(turn.status).toBe(200);
    expect(provider.prompts).toHaveLength(0);
    expect(turn.raw).toContain("dante-history-replay");
    expect(ai.ai_messages).toHaveLength(2);
  });

  it("another user's thread id → 404 and no provider call", async () => {
    ai.ai_threads[0].user_id = "99999999-9999-4999-8999-999999999999";
    const turn = await post({ message: ASK, threadId: THREAD, clientMessageId: "66666666-6666-4666-8666-666666666666" });
    expect(turn.status).toBe(404);
    expect(provider.prompts).toHaveLength(0);
  });
});
