/**
 * H0 general recommendation & evidence — OPT-IN live-provider smoke through the real Dante route. Skipped unless REC_LIVE=1.
 *
 *   REC_LIVE=1 npx vitest run lib/dante-core/__tests__/recommendation-evidence.live.test.ts
 *
 * Real OpenAI calls (key read from .env.local) and real outbound retrieval; the fake coherence table instead of a database.
 * Prints each final reply with its trace, eligibility and displayed sources. A smoke test, not an evaluation: it asserts
 * only the semantic contract (no winner where none is allowed, no out-of-scope canonical source), never prose.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const live = await vi.hoisted(async () => {
  const enabled = process.env.REC_LIVE === "1";
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

type Source = { type: string; title: string };

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
  const sources = (done && done.type === "done" ? (done.sources ?? []) : []) as Source[];
  original(`\n=== ${message}  (${Math.round((Date.now() - started) / 1000)}s)\nmodel=${model}\ntrace=${JSON.stringify(stages.FINAL_RESULT ?? null)}\nlinkage=${JSON.stringify(stages.SOURCE_LINKAGE ?? null)}\nsources=${JSON.stringify(sources.map((s) => `${s.type}: ${s.title}`))}\n${text}\n`);
  return { text, model, sources, trace: stages.FINAL_RESULT };
}

/** A pick stated as THE answer for a supplement/outcome. */
const WINNER = /\b(?:the best (?:supplement|option|choice)|top pick|number one|#1)\b/i;
const creatineSource = (sources: Source[]) => sources.some((s) => /creatine/i.test(s.title));

describe.skipIf(!live.enabled)("general recommendation live smoke (opt-in)", () => {
  beforeEach(() => {
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000e3" } }, error: null }) }, from: vi.fn((name: string) => from(name)) } as never);
  });

  it("the provider is configured", () => {
    expect(isOpenAiConfigured()).toBe(true);
  });

  it("1. best supplement for sleep → no winner, no creatine evidence", async () => {
    const turn = await ask("best supplement for sleep");
    expect(turn.trace?.recommendation).toBe("CAN_EDUCATE");
    expect(turn.text).not.toMatch(WINNER);
    expect(creatineSource(turn.sources)).toBe(false);
  }, 180_000);

  it("2. best supplement for recovery → no winner", async () => {
    const turn = await ask("best supplement for recovery");
    expect(turn.trace?.recommendation).toBe("CAN_EDUCATE");
    expect(turn.text).not.toMatch(WINNER);
  }, 180_000);

  it("3. best supps for my liver → deterministic boundary, no product list, no sources", async () => {
    const turn = await ask("best supps for my liver");
    expect(turn.model).toBe("dante-supplement-safety-boundary");
    expect(turn.sources).toEqual([]);
    expect(turn.text).not.toMatch(/creatine|whey|omega|milk thistle/i);
  }, 180_000);

  it("4. best exercise for chest growth → answered, not restricted", async () => {
    const turn = await ask("best exercise for chest growth");
    expect(turn.trace?.recommendation).toBe("CAN_RANK");
    expect(turn.text.length).toBeGreaterThan(40);
  }, 180_000);

  it("5. best exercise for shoulder pain → never a ranked exercise list", async () => {
    const turn = await ask("best exercise for shoulder pain");
    expect(turn.text).not.toMatch(/the best exercise for shoulder pain is/i);
  }, 180_000);

  it("6. best food for cholesterol → general food guidance, no single best food as a treatment", async () => {
    const turn = await ask("best food for cholesterol");
    expect(turn.trace?.recommendation).toBe("CAN_EDUCATE");
    expect(turn.text).not.toMatch(/\b(?:cures?|treats?) (?:high )?cholesterol\b/i);
  }, 180_000);

  it("7. compare creatine vs beta-alanine for strength → compare obligation answered", async () => {
    const turn = await ask("compare creatine vs beta-alanine for strength");
    expect(turn.trace?.missingObligations).toBe("ASSESSED_NONE");
  }, 180_000);

  it("8. does omega-3 reduce liver fat? → evidence question answered, no established claim invented", async () => {
    const turn = await ask("does omega-3 reduce liver fat?");
    expect(turn.trace?.missingObligations).toBe("ASSESSED_NONE");
    expect(turn.text).not.toMatch(/\bomega-3 (?:is proven to|definitely) reduces?\b/i);
    // The registry's omega-3 paper covers hypertrophy, status and soreness — never shown as support for liver fat.
    expect(turn.sources.some((s) => s.type === "Canonical knowledge" && /omega-3/i.test(s.title))).toBe(false);
  }, 180_000);
});
