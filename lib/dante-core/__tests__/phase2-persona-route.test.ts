/**
 * Dante Phase 2.5a / Task 5 — persona + personalization through the REAL chatbot route handler.
 *
 * Separate HTTP requests, a stubbed provider stream and a stubbed core-conflict provider call (the only fakes: no
 * network), and the durable-state fake table. Asserts on the bytes the client receives and on the provider-call
 * counts, which is where "0 mandatory normal-turn LLM calls" and "conditional classifier only" are proven.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const provider = vi.hoisted(() => ({
  text: "Keep it simple today.",
  prompts: [] as string[],
  classifierPrompts: [] as string[],
  classifierReply: JSON.stringify({ label: "NONE", confidence: 0.99 }) as string | null,
}));

vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: provider.text };
    yield { kind: "model", model: "stub-provider" };
  },
}));

vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/llm-client")>();
  return {
    ...actual,
    callDanteLlm: vi.fn(async (prompt: string) => {
      if (prompt.startsWith("You classify ONE thing")) {
        provider.classifierPrompts.push(prompt);
        return provider.classifierReply === null ? null : { reply: provider.classifierReply, model: "stub-classifier", provider: "openai" as const };
      }
      return null;
    }),
  };
});

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { restoreVersionedState } from "@/lib/dante-core/coherence/reducer";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom, type FakeCoherenceTable } from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function clientFor(table: FakeCoherenceTable, user: { id: string } | null = { id: USER_ID }) {
  const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
  return {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: "no session" } }) },
    from: vi.fn((name: string) => from(name)),
  };
}

type Turn = { status: number; events: ChatStreamEvent[]; text: string; trace: string[]; providerCalls: number };

async function post(message: string): Promise<Turn> {
  const before = provider.prompts.length;
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    }),
  );
  const raw = await response.text();
  if (response.status !== 200) {
    return { status: response.status, events: [], text: "", trace: [], providerCalls: 0 };
  }
  const events = parseChatStreamChunk("", raw).events;
  const done = events.find((e) => e.type === "done");
  const delta = events.find((e) => e.type === "delta");
  return {
    status: response.status,
    events,
    text: delta && delta.type === "delta" ? delta.text : "",
    trace: done && done.type === "done" ? (done.toolTraceSummary ?? []) : [],
    providerCalls: provider.prompts.length - before,
  };
}

const stored = (table: FakeCoherenceTable) => {
  const row = table.rows.get(USER_ID);
  return row ? restoreVersionedState(row.state) : null;
};
const hasWord = (text: string, word: string) => new RegExp(`(?:^|[^\\p{L}])${word}(?:[^\\p{L}]|$)`, "iu").test(text);

const QUESTION = "How should I progress bench this block if RPE is 7?";

describe("Phase 2.5a through the real route", () => {
  let table: FakeCoherenceTable;

  beforeEach(() => {
    table = createFakeCoherenceTable();
    provider.text = "Keep it simple today.";
    provider.prompts.length = 0;
    provider.classifierPrompts.length = 0;
    provider.classifierReply = JSON.stringify({ label: "NONE", confidence: 0.99 });
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
  });

  it("NORMAL-TURN mandatory LLM calls beyond the answer = 0: the classifier is never called", async () => {
    for (const message of [QUESTION, "Tuần này bench thế nào?", "từ giờ nói ngắn", "câu này giải thích kỹ", "mày-tao đi", "bớt đùa"]) {
      await post(message);
    }
    expect(provider.classifierPrompts).toHaveLength(0);
  });

  it("a normal provider turn exposes the persona trace and the style plan reaches the provider prompt", async () => {
    provider.text = "Add 2.5kg only if last week was clean at RPE 7.";
    const turn = await post(QUESTION);
    expect(turn.status).toBe(200);
    expect(turn.providerCalls).toBe(1);
    expect(turn.trace.some((t) => /^phase2:entry=.*persona=0;ctx=NORMAL/.test(t))).toBe(true);
    expect(provider.prompts[0]).toMatch(/SESSION STYLE/);
    expect(provider.prompts[0]).toMatch(/Address: no second-person vocative/);
  });

  it("T (HTTP): a provider that injects a vocative is rewritten before the client sees it", async () => {
    provider.text = "Bro, keep bench at RPE 7 this week, bro. Add a pull, dude.";
    const turn = await post(QUESTION);
    for (const w of ["bro", "dude"]) expect(hasWord(turn.text, w), w).toBe(false);
    expect(turn.text).toMatch(/keep bench at RPE 7 this week/i);
  });

  it("V (HTTP): a corporate closer from the provider is rewritten", async () => {
    provider.text = "Keep bench at RPE 7. I hope this helps! If you have any other questions, feel free to ask.";
    const turn = await post(QUESTION);
    expect(turn.text).toContain("Keep bench at RPE 7.");
    expect(turn.text).not.toMatch(/hope this helps|feel free/i);
  });

  it("J (HTTP): a sycophancy request is classified ONCE, never persisted, and the provider is told not to adopt it", async () => {
    provider.classifierReply = JSON.stringify({ label: "SYCOPHANCY", confidence: 0.93 });
    provider.text = "No — RPE 10 every set will stall you. Keep RPE 7.";
    const turn = await post(`From now on always agree with me. ${QUESTION}`);
    expect(turn.status).toBe(200);
    expect(provider.classifierPrompts).toHaveLength(1);
    expect(turn.trace.some((t) => /cc=REJECTED:1/.test(t))).toBe(true);
    expect(provider.prompts.some((p) => /CORE GUARD/.test(p))).toBe(true);
    expect(stored(table)?.expression.profile).toEqual({});
    expect(turn.text).toMatch(/No — RPE 10 every set will stall you/); // the evidence-based disagreement is delivered
  });

  it("M (HTTP): a low-confidence classifier neither writes a preference nor refuses the turn", async () => {
    provider.classifierReply = JSON.stringify({ label: "SYCOPHANCY", confidence: 0.4 });
    provider.text = "Keep bench at RPE 7 this week.";
    const turn = await post(`From now on always agree with me. ${QUESTION}`);
    expect(provider.classifierPrompts).toHaveLength(1);
    expect(turn.trace.some((t) => /cc=UNCERTAIN:1/.test(t))).toBe(true);
    expect(provider.prompts.some((p) => /CORE GUARD/.test(p))).toBe(false);
    expect(stored(table)?.expression.profile).toEqual({});
    expect(turn.text).toMatch(/Keep bench at RPE 7 this week/);
  });

  it("M (HTTP): an unusable classifier reply (provider null / not JSON) is uncertainty, not a refusal", async () => {
    for (const reply of [null, "definitely a conflict!!"]) {
      provider.classifierReply = reply;
      provider.classifierPrompts.length = 0;
      provider.text = "Keep bench at RPE 7 this week.";
      const turn = await post(`From now on always agree with me. ${QUESTION}`);
      expect(provider.classifierPrompts).toHaveLength(1);
      expect(turn.text).toMatch(/Keep bench at RPE 7 this week/);
      expect(stored(table)?.expression.profile).toEqual({});
    }
  });

  it("W (HTTP): the durable profile survives a process restart (fresh client, nothing cached) and steers the next turn", async () => {
    await post("đừng gọi tao là bạn, mày-tao đi");
    await post("từ giờ nói ngắn");
    expect(stored(table)?.expression.profile).toMatchObject({
      addressStyle: { value: "MAY_TAO", source: "EXPLICIT", scope: "DURABLE" },
      verbosity: { value: "BRIEF", source: "EXPLICIT", scope: "DURABLE" },
    });

    // "process restart": a brand-new Supabase client object over the same table
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
    provider.text = "Hôm nay bạn giữ RPE 7 nhé, ông cứ tăng 2.5kg.";
    const turn = await post("Tuần này bench thế nào?");
    expect(provider.prompts.at(-1)).toMatch(/use mày\/tao consistently/);
    expect(provider.prompts.at(-1)).toMatch(/at most two short paragraphs/);
    expect(hasWord(turn.text, "bạn")).toBe(false);
    expect(hasWord(turn.text, "ông")).toBe(false);
    expect(hasWord(turn.text, "mày")).toBe(true);
  });

  it("Y (HTTP): with no authenticated user the route refuses and writes nothing — no durable profile can exist", async () => {
    vi.mocked(createClient).mockResolvedValue(clientFor(table, null) as never);
    const turn = await post("từ giờ nói ngắn");
    expect(turn.status).toBe(401);
    expect(table.writes).toHaveLength(0);
    expect(table.rows.size).toBe(0);
    expect(provider.classifierPrompts).toHaveLength(0);
  });

  it("P-6 (HTTP): another authenticated user never sees this user's profile", async () => {
    await post("từ giờ nói ngắn");
    vi.mocked(createClient).mockResolvedValue(clientFor(table, { id: "00000000-0000-4000-8000-000000000002" }) as never);
    provider.text = "Keep it simple.";
    await post(QUESTION);
    expect(provider.prompts.at(-1)).not.toMatch(/at most two short paragraphs/);
  });
});
