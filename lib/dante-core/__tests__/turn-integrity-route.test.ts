/**
 * Turn integrity through the REAL Dante route. Retrieval: a literature search that did not finish is FAILED, a finished search
 * with no hit is EMPTY, and every provider call made after retrieval sees the settled brief (not the pre-retrieval one).
 * Only the provider stream, the classifier call and the network are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const provider = vi.hoisted(() => ({ replies: [] as string[], fallback: "Keep it simple today.", prompts: [] as string[] }));

vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/client")>()),
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: provider.replies.shift() ?? provider.fallback };
    yield { kind: "model", model: "stub-provider" };
  },
}));

vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/llm-client")>();
  return { ...actual, callDanteLlm: vi.fn(async () => null) };
});

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-0000000000d1";

async function post(message: string): Promise<string> {
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    }),
  );
  const delta = parseChatStreamChunk("", await response.text()).events.find((e) => e.type === "delta");
  return delta && delta.type === "delta" ? delta.text : "";
}

const networkDown = vi.fn(async () => {
  throw new Error("network disabled in tests");
});
/** Every literature source answers, with zero hits. */
const emptyHits = vi.fn(async (url: string | URL | Request) => {
  const href = String(url);
  if (/esearch/.test(href)) return new Response(JSON.stringify({ esearchresult: { idlist: [] } }));
  if (/europepmc/.test(href)) return new Response(JSON.stringify({ resultList: { result: [] } }));
  if (/medlineplus/.test(href)) return new Response("<nlmSearchResult></nlmSearchResult>");
  throw new Error("unexpected fetch");
});

describe("turn integrity through the real route", () => {
  beforeEach(() => {
    provider.replies = [];
    provider.prompts.length = 0;
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
      from: vi.fn((name: string) => from(name)),
    } as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a search that did not finish is reported as unfinished, not as no evidence found", async () => {
    vi.stubGlobal("fetch", networkDown);
    provider.fallback = "TUDCA is a bile acid.";
    const text = await post("What does TUDCA do?");
    expect(text).toMatch(/could not finish the evidence check/i);
    expect(text).not.toMatch(/in what I can check\./i);
  });

  it("a finished search with no hit is a corpus miss, not a failure", async () => {
    vi.stubGlobal("fetch", emptyHits);
    provider.fallback = "TUDCA is a bile acid.";
    const text = await post("What does TUDCA do?");
    expect(text).toMatch(/benefit is not established/i);
    expect(text).not.toMatch(/could not finish/i);
  });

  it("a provider call made after retrieval carries the settled brief", async () => {
    vi.stubGlobal("fetch", networkDown);
    await post("Only considering rain, should I skip the gym, and based on recovery, what should I log? Also what does TUDCA do?");
    const afterRetrieval = provider.prompts.find((prompt) => prompt.includes("OBLIGATION_ENVELOPES="));
    expect(afterRetrieval).toBeDefined();
    expect(afterRetrieval).not.toMatch(/KNOWLEDGE_STATE: RETRIEVAL_REQUIRED/);
    expect(afterRetrieval).toMatch(/KNOWLEDGE_STATE: KNOWLEDGE_INSUFFICIENT/);
  });

  it("the provider prompt carries every mandatory instruction section whole", async () => {
    vi.stubGlobal("fetch", networkDown);
    await post("How many sets should I do for chest this week?");
    const prompt = provider.prompts.at(-1) ?? "";
    for (const header of ["TRUST BOUNDARY", "CONTEXT PRIORITY", "SUPPLEMENTS", "HEALTH SAFETY", "EMERGENCY ESCALATION", "EPISTEMIC DISCIPLINE", "TOOL AUTHORITY"]) {
      expect(prompt).toContain(header);
    }
    const instructions = prompt.slice(0, prompt.indexOf("CLIENT PROFILE"));
    expect(instructions).not.toMatch(/condensed for model context budget/);
    expect(prompt).not.toMatch(/finish with a short section called/);
  });
});
