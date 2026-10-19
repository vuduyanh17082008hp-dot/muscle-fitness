import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const provider = vi.hoisted(() => ({ prompts: [] as string[] }));
vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/client")>()),
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: "PROVIDER_REPLY" };
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

const real = console.log;
describe("probe", () => {
  beforeEach(() => {
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000c1" } }, error: null }) }, from: vi.fn((n: string) => from(n)) } as never);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no net"); }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  for (const m of ["best exercise for shoulder pain", "my chest hurts but what is creatine", "my ankle hurts when I squat, what can I train today", "yellow eyes, should I take creatine"]) {
    it(m, async () => {
      const before = provider.prompts.length;
      const res = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: m, messages: [{ role: "user", content: m }] }) }));
      const ev = parseChatStreamChunk("", await res.text()).events;
      const d = ev.find((e) => e.type === "delta"); const done = ev.find((e) => e.type === "done");
      real(`\n=== ${m}\nmodel=${done && done.type === "done" ? done.model : "-"} calls=${provider.prompts.length - before}\n${d && d.type === "delta" ? d.text : ""}`);
      expect(1).toBe(1);
    }, 60000);
  }
});
