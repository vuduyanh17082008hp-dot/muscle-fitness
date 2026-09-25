/**
 * Live-wiring proof for Phase 2 / Task 1: the real chatbot route handler, driven by SEPARATE HTTP requests that
 * carry no chat history, must load durable VersionedState, persist v_n+1 (and the post-turn state where the
 * reply goes through the Phase 2 overlay), and never let a store failure block the reply.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { restoreVersionedState } from "@/lib/dante-core/coherence/reducer";
import { createClient } from "@/lib/supabase/server";
import {
  createFakeCoherenceTable,
  fakeCoherenceFrom,
  type FakeCoherenceTable,
} from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DANGER = "I've had chest pain since my last set of bench press.";
const CAFFEINE = "I've had 300mg caffeine today. Will that make me stronger for bench?";

function clientFor(table: FakeCoherenceTable, opts: { coherenceDown?: boolean } = {}) {
  const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: vi.fn((name: string) => {
      if (opts.coherenceDown && name === "dante_coherence_state") throw new Error("coherence table unavailable");
      return from(name);
    }),
  };
}

/** One independent HTTP request: a single message, no `messages` history beyond the message itself. */
async function post(message: string): Promise<{ status: number; events: ChatStreamEvent[]; trace: string[]; text: string }> {
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    }),
  );
  const raw = await response.text();
  const events = parseChatStreamChunk("", raw).events;
  const done = events.find((e) => e.type === "done");
  const delta = events.find((e) => e.type === "delta");
  return {
    status: response.status,
    events,
    trace: done && done.type === "done" ? done.toolTraceSummary : [],
    text: delta && delta.type === "delta" ? delta.text : "",
  };
}

function storedState(table: FakeCoherenceTable) {
  const row = table.rows.get(USER_ID);
  return row ? restoreVersionedState(row.state) : null;
}

describe("chatbot route — durable Phase 2 state across separate HTTP requests", () => {
  let table: FakeCoherenceTable;

  beforeEach(() => {
    table = createFakeCoherenceTable();
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
  });

  it("carries the safety lifecycle ENTER → PERSIST → ESCALATE through independent requests", async () => {
    const seen: string[] = [];
    const messages = [DANGER, DANGER, "It's getting worse, the pain is spreading to my arm."];
    for (const [index, expected] of ["ENTER", "PERSIST", "ESCALATE"].entries()) {
      const r = await post(messages[index]);
      expect(r.status).toBe(200);
      expect(r.trace.some((t) => /phase2:state=(?:new|durable);store=committed/.test(t))).toBe(true);
      seen.push(r.trace.find((t) => t.startsWith("phase2:entry")) ?? "");
      expect(storedState(table)?.safety.phase).toBe(expected);
    }
    // The 2nd and 3rd requests loaded durable state; nothing was reconstructed from chat history.
    expect(seen[1]).toMatch(/safe=PERSIST/);
    expect(seen[2]).toMatch(/safe=ESCALATE/);
    expect(storedState(table)?.safety.consecutiveSafetyTurns).toBe(3);
    // Versions only ever moved forward and every write was applied (no stale write sneaked in or was needed).
    const versions = table.writes.map((w) => w.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(table.writes.every((w) => w.applied)).toBe(true);
  });

  it("persists the post-turn state (response/advice/question signatures) for replies through the overlay", async () => {
    const first = await post(CAFFEINE);
    expect(first.status).toBe(200);
    expect(first.trace.some((t) => /phase2:state=new;store=committed/.test(t))).toBe(true);
    expect(first.trace.some((t) => /post=ok/.test(t))).toBe(true);

    const afterFirst = storedState(table);
    expect(afterFirst?.lastResponseSignature).toBeTruthy();
    expect(afterFirst?.lastAdviceSignature).toBeTruthy();
    expect(afterFirst?.lastUserQuestionSignature).toBeTruthy();
    // v_n+1 (turn) and v_n+2 (post-turn) were both committed.
    expect(table.writes.filter((w) => w.applied)).toHaveLength(2);

    const second = await post(CAFFEINE);
    expect(second.trace.some((t) => /phase2:state=durable;store=committed/.test(t))).toBe(true);
    const afterSecond = storedState(table);
    expect(afterSecond?.turnCount).toBe(2);
    expect(afterSecond?.version).toBeGreaterThan(afterFirst?.version ?? 0);
  });

  it("never blocks the reply when the state store is unavailable (fail-open)", async () => {
    vi.mocked(createClient).mockResolvedValue(clientFor(table, { coherenceDown: true }) as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await post(CAFFEINE);
    warn.mockRestore();
    expect(r.status).toBe(200);
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.trace.some((t) => /phase2:state=new;store=unavailable;v=none/.test(t))).toBe(true);
    expect(table.rows.size).toBe(0);
  });
});
