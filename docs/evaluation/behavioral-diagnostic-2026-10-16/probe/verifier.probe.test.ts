import { it, vi } from "vitest";
import { readFileSync } from "node:fs";
for (const line of readFileSync("C:/Dev/Projects/muscle-fitness-claude/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^(OPENAI_[A-Z0-9_]+|DANTE_[A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dante-core/verifier", async (orig) => {
  const actual = await orig<typeof import("@/lib/dante-core/verifier")>();
  return { ...actual, verifyFinalResponse: (input: Parameters<typeof actual.verifyFinalResponse>[0]) => { const r = actual.verifyFinalResponse(input); if (!r.passed) process.stderr.write("VERIFIER_FAIL " + JSON.stringify(r).slice(0, 700) + "\n  TEXT: " + input.replyText.slice(0, 400).replace(/\n/g, " ") + "\n"); return r; } };
});
import { POST } from "@/app/api/chatbot/route";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "@/lib/dante-core/__tests__/support/fake-coherence-supabase";
it("verifier probe", async () => {
  const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-00000000abce" } }, error: null }) }, from: vi.fn((n: string) => from(n)), rpc: vi.fn(async () => ({ data: [{ allowed: true, remaining: 10, retry_after_seconds: 0 }], error: null })) } as never);
  for (const [prior, message] of [[["I weigh 80 kg", "actually 60 kg"], "how much protein should I eat per day?"], [[], "what should I eat and how should I train today?"]] as Array<[string[], string]>) {
    const res = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [...prior, message].map((content) => ({ role: "user", content })) }) }));
    process.stderr.write("=== " + message + " → " + (await res.text()).slice(0, 300).replace(/\n/g, " ") + "\n");
  }
}, 240000);
