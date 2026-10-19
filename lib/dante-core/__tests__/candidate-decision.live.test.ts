/**
 * H0 Batch B purchase decision / candidate completeness / context-aware ranking — OPT-IN live-provider smoke through
 * the real Dante route. Skipped unless CANDIDATE_LIVE=1.
 *
 *   CANDIDATE_LIVE=1 npx vitest run lib/dante-core/__tests__/candidate-decision.live.test.ts
 *
 * Real OpenAI calls (key read from .env.local), the fake coherence table instead of a database. Prints each final reply
 * with its trace. A smoke test, not an evaluation: it asserts the structured contract (task, criterion, counts,
 * completeness), never prose quality.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const live = await vi.hoisted(async () => {
  const enabled = process.env.CANDIDATE_LIVE === "1";
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
  const stages: Record<string, Record<string, unknown>> = {};
  const original = console.log;
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    const meta = args[1] as { tool?: string; stage?: string; fields?: Record<string, unknown> } | undefined;
    if (args[0] === "[DANTE_INTELLIGENCE]" && meta?.tool === "answerability" && meta.fields && meta.stage) stages[meta.stage] = meta.fields;
  });
  const started = Date.now();
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }) }));
  const events = parseChatStreamChunk("", await response.text()).events;
  spy.mockRestore();
  const delta = events.find((e) => e.type === "delta");
  const done = events.find((e) => e.type === "done");
  const text = delta && delta.type === "delta" ? delta.text : "";
  const model = done && done.type === "done" ? done.model : "-";
  const trace = stages.FINAL_RESULT;
  original(`\n=== ${message}  (${Math.round((Date.now() - started) / 1000)}s)\nmodel=${model}\ntrace=${JSON.stringify(trace ?? null)}\n${text}\n`);
  return { text, trace };
}

describe.skipIf(!live.enabled)("candidate decision live smoke (opt-in)", () => {
  beforeEach(() => {
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000b3" } }, error: null }) }, from: vi.fn((name: string) => from(name)) } as never);
  });

  it("the provider is configured", () => {
    expect(isOpenAiConfigured()).toBe(true);
  });

  it("1. eight supplements, rank for me → 8/8 accounted for", async () => {
    const turn = await ask("creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin - rank these for me");
    expect(turn.trace).toMatchObject({ candidateTask: "RANK:PERSONAL", candidateCounts: "8/8/8", candidateCompleteness: "PASS" });
  }, 240_000);

  it("2. purchase anxiety → purchase decision, not education", async () => {
    const turn = await ask("im planning on buying some supps right now, maybe from nutricost, but im scared that i might buy some things i dont really need, can u give me some advice");
    expect(turn.trace?.candidateTask).toBe("BUY:PURCHASE");
  }, 240_000);

  it("3. protein already covered → whey / EAA / BCAA", async () => {
    const turn = await ask("I already hit my protein target every day. rank whey, EAA and BCAA for me");
    expect(turn.trace).toMatchObject({ candidateCounts: "3/3/3", candidateCompleteness: "PASS" });
  }, 240_000);

  it("4. barely eat fish → omega-3", async () => {
    const turn = await ask("I barely eat fish. should omega 3 be high priority for me?");
    expect(turn.trace?.candidateTask).toBe("RANK:PERSONAL");
  }, 240_000);

  it("5. salmon 4x/week → omega-3", async () => {
    const turn = await ask("I eat salmon 4 times a week. should omega 3 still be high priority?");
    expect(turn.trace?.candidateTask).toBe("RANK:PERSONAL");
  }, 240_000);

  it("6. varied diet → zinc / magnesium / multivitamin", async () => {
    const turn = await ask("should i buy zinc, magnesium or a multivitamin if my diet is already varied?");
    expect(turn.trace).toMatchObject({ candidateCounts: "3/3/3", candidateCompleteness: "PASS" });
  }, 240_000);

  it("7. exercises for chest growth", async () => {
    const turn = await ask("rank bench press, dumbbell press and dips for chest growth");
    expect(turn.trace ?? { candidateCompleteness: "NO_TRACE" }).toMatchObject({ candidateCompleteness: "PASS" });
  }, 240_000);

  it("8. foods for pre-workout", async () => {
    const turn = await ask("rank rice, potatoes and oats for pre-workout");
    expect(turn.trace ?? { candidateCompleteness: "NO_TRACE" }).toMatchObject({ candidateCompleteness: "PASS" });
  }, 240_000);
});
