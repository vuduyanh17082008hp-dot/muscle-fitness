/**
 * H0 DEFINE identity grounding — OPT-IN live-provider smoke through the real Dante route. Skipped unless DEFINE_LIVE=1.
 *
 *   DEFINE_LIVE=1 npx vitest run lib/dante-core/__tests__/define-identity.live.test.ts
 *
 * Real OpenAI calls (key read from .env.local), the fake coherence table instead of a database. Prints each final reply
 * with the answerability trace. Asserts only the DEFINE contract on the FINAL text; a smoke test, not an evaluation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const live = await vi.hoisted(async () => {
  const enabled = process.env.DEFINE_LIVE === "1";
  if (enabled) {
    try {
      const { readFileSync } = await import("node:fs");
      for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
        const match = line.match(/^(OPENAI_[A-Z0-9_]+|DANTE_[A-Z0-9_]*MODEL[A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // no .env.local → the provider check below fails
    }
  }
  return { enabled };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { isOpenAiConfigured } from "@/lib/dante-core/openai/config";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

async function ask(message: string) {
  const traces: Array<Record<string, unknown>> = [];
  const original = console.log;
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    const meta = args[1] as { tool?: string; fields?: Record<string, unknown> } | undefined;
    if (args[0] === "[DANTE_INTELLIGENCE]" && meta?.tool === "answerability" && meta.fields) traces.push(meta.fields);
  });
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }) }));
  const events = parseChatStreamChunk("", await response.text()).events;
  spy.mockRestore();
  const delta = events.find((e) => e.type === "delta");
  const done = events.find((e) => e.type === "done");
  const text = delta && delta.type === "delta" ? delta.text : "";
  original(`\n=== ${message}\nmodel=${done && done.type === "done" ? done.model : "-"} trace=${JSON.stringify(traces.at(-1) ?? null)}\n${text}\n`);
  return { text, trace: traces.at(-1) };
}

const BENEFIT = /\b(?:definitely|proven to|boosts?|improves? (?:recovery|performance|energy|endurance)|protects? (?:the|your) liver)\b/i;

describe.skipIf(!live.enabled)("DEFINE identity live smoke (opt-in)", () => {
  beforeEach(() => {
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000e2" } }, error: null }) }, from: vi.fn((name: string) => from(name)) } as never);
  });

  it("the provider is configured", () => {
    expect(isOpenAiConfigured()).toBe(true);
  });

  // gap = no canonical benefit evidence, so any asserted benefit is unsupported; creatine/RPE carry canonical claims.
  it.each([
    ["what is CoQ10 exactly", /coq10[^.]{0,80}\b(?:is|are)\b[^.]*(?:compound|molecule|coenzyme|substance|antioxidant)/i, true],
    ["what is creatine exactly", /creatine[^.]{0,60}\bis\b[^.]*(?:compound|molecule|substance|amino|acid)/i, false],
    ["what is taurine", /taurine[^.]{0,60}\bis\b[^.]*amino acid/i, true],
    ["what is TUDCA", /tudca[^.]{0,80}\bis\b[^.]*bile acid/i, true],
    ["what is RPE", /rpe[^.]{0,80}\b(?:is|stands for|means)\b[^.]*(?:scale|rating|perceived exertion)/i, false],
    ["CoQ10 là gì", /coq10[^.]{0,120}(?<!\p{L})là(?!\p{L})[^.]*(?:hợp chất|chất|coenzyme)/iu, true],
  ] as const)("%s → defined, no unsupported benefit, no unprompted doctor line from the system", async (message, identity, gap) => {
    const turn = await ask(message);
    expect(turn.text).toMatch(identity);
    if (gap) expect(turn.text).not.toMatch(BENEFIT);
    expect(turn.text).not.toMatch(/that's one for a doctor or pharmacist|bạn nên hỏi bác sĩ hoặc dược sĩ/);
    expect(turn.trace?.missingObligations).toBe("ASSESSED_NONE");
    expect(turn.trace?.identityGrounding).toBe("GROUNDED");
  }, 120_000);

  it("what is xyzabc supplement → not identified, nothing invented", async () => {
    const turn = await ask("what is xyzabc supplement");
    expect(turn.text).toMatch(/can't (?:confidently )?identify|not (?:able|sure)|don't (?:know|recognize)|couldn't find|isn't in/i);
    expect(turn.text).not.toMatch(/xyzabc is an? /i);
    expect(turn.trace?.entityStatus).toBe("UNKNOWN_ENTITY");
  }, 120_000);
});
