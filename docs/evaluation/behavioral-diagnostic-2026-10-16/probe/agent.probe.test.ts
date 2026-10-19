import { it, vi } from "vitest";
import { readFileSync } from "node:fs";
for (const line of readFileSync("C:/Dev/Projects/muscle-fitness-claude/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^(OPENAI_[A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { POST } from "@/app/api/chatbot/route";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "@/lib/dante-core/__tests__/support/fake-coherence-supabase";
it("agent probe", async () => {
  const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-00000000abcd" } }, error: null }) }, from: vi.fn((n: string) => from(n)), rpc: vi.fn(async () => ({ data: [{ allowed: true, remaining: 10, retry_after_seconds: 0 }], error: null })) } as never);
  const errs: unknown[] = [];
  const orig = console.error;
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { errs.push(a.map((x) => (x instanceof Error ? x.stack : typeof x === "string" ? x : JSON.stringify(x))).join(" ")); });
  for (const message of ["add 150g greek yogurt to my snack", "add 3 boiled eggs to my breakfast"]) {
    const res = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }) }));
    const t = await res.text();
    orig("=== " + message + " status " + res.status + "\n" + t.slice(0, 1200));
  }
  orig("ERRORS:\n" + errs.join("\n---\n").slice(0, 4000));
}, 240000);
