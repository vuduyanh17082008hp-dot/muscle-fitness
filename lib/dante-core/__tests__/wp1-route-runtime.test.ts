/**
 * H0 WP1 through the REAL Dante route and the REAL provider client: only `fetch` is faked. The provider answers with
 * SSE; the literature hosts are routed to a real local socket that sends headers and then stalls the body (the shape
 * of the previous 25-minute hang). Asserts terminal state inside the budget, attempt counts, and that a client that
 * left gets no post-turn state commit.
 */
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/llm-client")>();
  return { ...actual, callDanteLlm: vi.fn(async () => null) };
});

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { EARLY_READ_MS, RETRIEVAL_PHASE_MS } from "@/lib/dante-core/turn-budget";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom, type FakeCoherenceTable } from "./support/fake-coherence-supabase";

const realFetch = globalThis.fetch;
let stalled: Server;
let stalledUrl = "";
const providerCalls: string[] = [];
let providerMode: "answer" | "hang" = "answer";

const sseBody = (text: string, signal?: AbortSignal | null) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      if (providerMode === "hang") {
        // Never finishes on its own; ends only when the request's signal aborts — like a real streaming socket.
        signal?.addEventListener("abort", () => controller.error(signal.reason));
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`));
      controller.close();
    },
  });

beforeAll(async () => {
  stalled = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"esearchresult":{"idlist":["1"');
  });
  await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
  const address = stalled.address();
  stalledUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
});
afterAll(() => {
  stalled.closeAllConnections();
  stalled.close();
});

let table: FakeCoherenceTable;
beforeEach(() => {
  providerCalls.length = 0;
  providerMode = "answer";
  vi.stubEnv("OPENAI_API_KEY", "test");
  table = createFakeCoherenceTable();
  const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000c1" } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
  } as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.openai.com/")) {
      providerCalls.push(url);
      return new Response(sseBody("TUDCA is a bile acid; human evidence for liver outcomes in lifters is limited.", init?.signal), { status: 200 });
    }
    // Every literature host stalls mid-body on a REAL socket: the real abort must end it.
    if (/eutils\.ncbi|ebi\.ac\.uk|wsearch\.nlm/.test(url)) return realFetch(stalledUrl, { signal: init?.signal });
    throw new Error("network disabled in tests");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const MESSAGE = "what does the research say about tudca";

async function post(message: string, signal?: AbortSignal) {
  const response = await POST(new Request("http://localhost/api/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    signal,
  }));
  const events = parseChatStreamChunk("", await response.text()).events;
  const done = events.find((e) => e.type === "done") as { toolTraceSummary?: string[]; model?: string } | undefined;
  return { events, done, wp1: done?.toolTraceSummary?.find((line) => line.startsWith("wp1:")) ?? "" };
}

describe("WP1 runtime through the real route", () => {
  it("B. stalled literature bodies: the turn still answers, inside the retrieval phase bound, sources TIMED_OUT", async () => {
    const started = Date.now();
    const { done, wp1 } = await post(MESSAGE);
    const ms = Date.now() - started;
    expect(done?.model, JSON.stringify(done)).not.toMatch(/fallback/);
    expect(wp1, JSON.stringify(done)).toMatch(/src=[^;]*pubmed:TIMED_OUT/);
    expect(wp1).toMatch(/phase=TIMED_OUT/);
    expect(wp1).toMatch(/provider=1;semantic=0/);
    expect(ms).toBeLessThan(RETRIEVAL_PHASE_MS + 5_000);
  }, 30_000);

  it("G. a client that leaves mid-generation: no fallback, no extra provider attempt, no post-turn state commit", async () => {
    providerMode = "hang";
    const client = new AbortController();
    const done = post("how many sets should I do for chest this week", client.signal);
    await vi.waitFor(() => expect(providerCalls.length).toBe(1), { timeout: 15_000 });
    const writesBefore = table.writes.length;
    client.abort(Object.assign(new Error("client closed"), { name: "ResponseAborted" }));
    const { events } = await done;
    expect(events.filter((e) => e.type === "delta")).toHaveLength(0);
    expect(providerCalls).toHaveLength(1);
    expect(table.writes.length).toBe(writesBefore);
  }, 30_000);

  it("F. two concurrent turns: each bounded by its own budget, both terminal, CAS keeps one state line", async () => {
    const [a, b] = await Promise.all([post("how many sets should I do for chest this week"), post("how long should I rest between squat sets")]);
    for (const turn of [a, b]) {
      expect(turn.done).toBeDefined();
      expect(turn.wp1).toMatch(/provider=1;semantic=0/);
    }
    expect(providerCalls).toHaveLength(2);
    expect(table.writes.filter((w) => w.applied).every((w, i, all) => i === 0 || w.version > all[i - 1].version)).toBe(true);
  }, 30_000);

  it("H. a hung early Supabase read (profiles.timezone): bounded at EARLY_READ_MS, PostgREST signal aborted, turn still answers", async () => {
    const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
    let profileSignal: AbortSignal | null = null;
    // Only the route's early point read (the FIRST select "timezone") hangs; the athlete-context loads answer normally.
    const hungProfiles = {
      select: () => hungProfiles,
      eq: () => hungProfiles,
      abortSignal: (signal: AbortSignal) => {
        profileSignal = signal;
        return hungProfiles;
      },
      maybeSingle: () => new Promise(() => {}),
    };
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000c1" } }, error: null }) },
      from: vi.fn((name: string) => {
        if (name !== "profiles") return from(name);
        const real = from(name) as { select: (columns: string) => unknown };
        return {
          ...real,
          select: (columns: string) => (columns === "timezone" && !profileSignal ? hungProfiles : real.select(columns)),
        };
      }),
    } as never);
    const started = Date.now();
    const { done, wp1 } = await post("how many sets should I do for chest this week");
    const ms = Date.now() - started;
    expect(done?.model, JSON.stringify(done)).not.toMatch(/fallback/);
    expect(wp1, JSON.stringify(done)).toMatch(/dep=[^;]*timezone:TIMED_OUT/);
    expect(wp1).toMatch(/provider=1;semantic=0/);
    expect((profileSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(ms).toBeLessThan(EARLY_READ_MS + 5_000);
  }, 30_000);
});
