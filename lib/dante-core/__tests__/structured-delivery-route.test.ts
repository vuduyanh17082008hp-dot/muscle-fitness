/**
 * H0 closure — structured answer delivery through the REAL route (provider stubbed). Root causes this pins:
 * - evidence-lite split sentences on \s+ (newlines included), merging every list into one paragraph;
 * - the Final Coherence Gate treated any "1."/"2."/"3." line as questionnaire numbering and its repair deleted those
 *   markers (items 4+ kept theirs) — the "first number disappears" defect;
 * - several surface passes collapsed whitespace with \s{2,} / \s+\n, erasing paragraph breaks so a caveat joined the
 *   last list item.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const provider = vi.hoisted(() => ({ reply: "" }));
vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/client")>()),
  streamDanteReply: async function* () {
    yield { kind: "delta", text: provider.reply };
    yield { kind: "model", model: "stub-provider" };
  },
}));
vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/dante-core/llm-client")>()), callDanteLlm: vi.fn(async () => null) }));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { hasQuestionNumbering } from "@/lib/dante-core/coherence/realize";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

async function post(message: string, reply: string): Promise<string> {
  provider.reply = reply;
  const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000d9" } }, error: null }) }, from: vi.fn((name: string) => from(name)) } as never);
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }) }));
  const delta = parseChatStreamChunk("", await response.text()).events.find((e) => e.type === "delta");
  return delta && delta.type === "delta" ? delta.text : "";
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network disabled in tests"); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LIST = "It depends on what is causing it, so start conservatively. Focus on:\n\n1. **Pain-free range**: move only where it does not hurt.\n2. **Lighter loads**: drop the weight while it settles.\n3. **Swap provoking moves**: replace overhead pressing for now.\n\nIf it keeps getting worse, get it assessed. Where exactly is the pain, and which movements provoke it?";

describe("a numbered list survives the whole route unchanged", () => {
  it.each(["best exercise for shoulder pain", "how should I warm up before squats?"])("%s", async (message) => {
    const text = await post(message, LIST);
    expect(text).toMatch(/Focus on:\n\n1\. \*\*Pain-free range\*\*/);
    expect(text).toMatch(/\n2\. \*\*Lighter loads\*\*/);
    expect(text).toMatch(/\n3\. \*\*Swap provoking moves\*\*: replace overhead pressing for now\.\n\nIf it keeps getting worse/);
  }, 60_000);

  it("a five-item list keeps 1..5 (the repair used to strip only 1–3)", async () => {
    const five = `Warm-up order:\n\n${["Easy cardio for five minutes.", "Hip circles.", "Bodyweight squats.", "Empty-bar sets.", "Two ramp-up sets."].map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nThen start your working sets.`;
    const text = await post("how should I warm up before squats?", five);
    for (const n of [1, 2, 3, 4, 5]) expect(text).toMatch(new RegExp(`(?:^|\\n)${n}\\. `));
  }, 60_000);
});

describe("brief verbosity never drops a rendered decision", () => {
  it("all 8 candidates survive realizePersona in brief mode (was 8 in → 0 out)", async () => {
    const { realizePersona } = await import("@/lib/dante-core/coherence/realize");
    const { createInitialState } = await import("@/lib/dante-core/coherence/reducer");
    const { buildIntelligenceBrief, renderCandidateAnswer } = await import("@/lib/intelligence/performance-core");
    const message = "creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin - rank these for me, keep it short";
    const draft = renderCandidateAnswer("Short version.\n\nA long caveat paragraph.\n\nAnother one.", buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true }), "en");
    const snapshot = createInitialState({ now: new Date().toISOString(), language: "en" });
    const out = realizePersona({ draft, language: "en", address: snapshot.address.value, safetyPhase: "NONE", snapshot: { ...snapshot, verbosity: { ...snapshot.verbosity, value: "brief" } } as typeof snapshot, message, repetitionAction: "none", handledCount: 1 });
    expect((out.match(/^- \*\*/gm) ?? []).length).toBe(8);
    expect(out).toMatch(/\*\*Low priority — usually skip\*\*/);
  });
});

describe("questionnaire numbering is still caught, ordinary lists are not", () => {
  it("numbered questions / 'Question 1' are questionnaire numbering", () => {
    expect(hasQuestionNumbering("1. Where is the pain?\n2. Since when?")).toBe(true);
    expect(hasQuestionNumbering("Question 1: how old are you")).toBe(true);
  });
  it("a numbered list of steps is not", () => {
    expect(hasQuestionNumbering(LIST)).toBe(false);
  });
});
