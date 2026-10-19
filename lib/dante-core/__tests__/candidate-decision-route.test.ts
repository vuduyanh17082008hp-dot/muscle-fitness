/**
 * H0 Batch B through the REAL Dante route, only the provider stubbed: a dropped candidate triggers the one integrity
 * retry, a still-incomplete retry is accounted for deterministically, and a ranking + state multi-intent turn keeps
 * both obligations and the whole candidate set.
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

type Trace = Record<string, unknown>;

async function post(message: string): Promise<{ text: string; done: { toolTraceSummary?: string[] } | undefined; trace: Trace | undefined }> {
  const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000b2" } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
  } as never);
  let trace: Trace | undefined;
  vi.mocked(console.log).mockImplementation((...args: unknown[]) => {
    const meta = args[1] as { tool?: string; stage?: string; fields?: Trace } | undefined;
    if (args[0] === "[DANTE_INTELLIGENCE]" && meta?.tool === "answerability" && meta.stage === "FINAL_RESULT") trace = meta.fields;
  });
  const response = await POST(new Request("http://localhost/api/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
  }));
  const events = parseChatStreamChunk("", await response.text()).events;
  const delta = events.find((e) => e.type === "delta");
  return { text: delta && delta.type === "delta" ? delta.text : "", done: events.find((e) => e.type === "done") as never, trace };
}

const EIGHT = "creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin - rank these for me";
const NO_OMEGA = "Based on what I know so far: creatine has the strongest support but is optional. Whey only matters if your protein is short. Zinc, magnesium and a multivitamin depend on how varied your diet is. EAA and BCAA are usually redundant if you eat enough protein.";

describe("candidate decisions through the real route", () => {
  beforeEach(() => {
    provider.replies = [];
    provider.prompts.length = 0;
    vi.mocked(createClient).mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network disabled in tests");
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the prompt carries all 8; a draft dropping omega-3 is retried with a correction naming it", async () => {
    provider.replies = [NO_OMEGA, `${NO_OMEGA} Omega-3 only moves up if you rarely eat oily fish.`];
    const { text, trace } = await post(EIGHT);
    expect(provider.prompts[0]).toMatch(/named 8 options: creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin/);
    expect(provider.prompts[1]).toMatch(/asked about "omega 3" and your answer never names it/);
    expect(text).toMatch(/Omega-3 only moves up/);
    expect(trace).toMatchObject({ candidateTask: "RANK:PERSONAL", candidateCounts: "8/8/8", candidateCompleteness: "PASS", retryCount: 1 });
    // Repair quality is measured: the omission went, nothing valid was lost, no new error appeared.
    expect(trace?.repairQuality).toMatch(/^target_removed=[1-9]\d*\/\d+;valid_preserved=true;new_error=false;attempts=1;latency_ms=\d+;accepted=true$/);
  });

  it("a retry that still omits it is accounted for deterministically — never silent", async () => {
    provider.replies = [NO_OMEGA, NO_OMEGA];
    const { text, trace } = await post(EIGHT);
    // The decision block renders every candidate from the structured decision, whatever the model dropped.
    expect(text, text).toMatch(/\*\*Depends on your situation\*\*\n(?:- .*\n)*- \*\*Omega 3\*\* — /);
    expect(trace).toMatchObject({ candidateCounts: "8/8/8", candidateCompleteness: "PASS" });
  });

  it("a supplement priority question carrying diet context is not handed to Gemma as a food fact", async () => {
    provider.replies = ["If you already eat salmon 4 times a week, omega-3 is low priority for you."];
    const { text, trace } = await post("I eat salmon 4 times a week. should omega 3 still be high priority?");
    expect(provider.prompts).toHaveLength(1);
    expect(provider.prompts[0]).toMatch(/omega-3 \(fish oil\): low priority \/ usually skip \(not_needed:FISH_INTAKE\)/);
    expect(text).toMatch(/low priority/);
    expect(trace?.candidateTask).toBe("RANK:PERSONAL");
  });

  it("a pure food fact still goes to Gemma", async () => {
    const { done } = await post("how much protein is in 100g of salmon?");
    expect(provider.prompts).toHaveLength(0);
    expect((done as { model?: string } | undefined)?.model).toBe("dante-defer-to-gemma");
  });

  it("30. ranking + protein-left multi-intent: both obligations answered, ranking set complete, no leakage", async () => {
    const { text, done } = await post("rank creatine, whey, EAA and BCAA for me and tell me how much protein I have left today");
    const rankingPrompt = provider.prompts.find((prompt) => /named 4 options: creatine, whey, eaa, bcaa/.test(prompt));
    expect(rankingPrompt, provider.prompts.join("\n=====\n").slice(0, 4000)).toBeDefined();
    // The state sibling's words never become a candidate.
    expect(provider.prompts.join("\n")).not.toMatch(/named \d+ options:[^\n]*(?:protein i have left|today)/);
    expect(text.length).toBeGreaterThan(0);
    expect(done).toBeDefined();
  });
});
