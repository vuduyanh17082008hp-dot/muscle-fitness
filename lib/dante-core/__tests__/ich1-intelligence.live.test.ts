/**
 * ICH-1 — OPT-IN live-provider smoke through the real Dante route. Skipped unless ICH1_LIVE=1.
 *
 *   ICH1_LIVE=1 npx vitest run lib/dante-core/__tests__/ich1-intelligence.live.test.ts
 *
 * Real OpenAI calls (key read from .env.local), real outbound retrieval, the durable-state fake table instead of a
 * database (so there is no personal athlete data in the prompt). It prints each reply with the integrity verdict on the
 * FINAL text. It asserts only Tier-A facts (language control, no safety misfire); everything else is for a human or an
 * independent grader to read. A handful of implementer-written prompts is a smoke test, not evidence of generalisation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const live = await vi.hoisted(async () => {
  const enabled = process.env.ICH1_LIVE === "1";
  if (enabled) {
    try {
      // Only the provider settings are read; nothing is printed.
      const { readFileSync } = await import("node:fs");
      for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
        const match = line.match(/^(OPENAI_[A-Z0-9_]+|DANTE_[A-Z0-9_]*MODEL[A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // no .env.local → the suite below reports the provider as not configured
    }
  }
  return { enabled };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { isOpenAiConfigured } from "@/lib/dante-core/openai/config";
import { buildIntelligenceBrief, checkOutputIntegrity } from "@/lib/intelligence/performance-core";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

type History = Array<{ role: "user" | "assistant"; content: string }>;
const VI: History = [
  { role: "user", content: "nên tập tới thất bại mỗi set không" },
  { role: "assistant", content: "Không cần tập tới thất bại mỗi set; dừng trước 1-2 rep vẫn hiệu quả." },
];
const viShare = (text: string) => {
  const words = text.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  return words.length ? words.filter((word) => /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(word)).length / words.length : 0;
};

async function ask(message: string, history: History = []) {
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [...history, { role: "user", content: message }] }) }));
  const events = parseChatStreamChunk("", await response.text()).events;
  const done = events.find((e) => e.type === "done");
  const delta = events.find((e) => e.type === "delta");
  const error = events.find((e) => e.type === "error");
  const text = delta && delta.type === "delta" ? delta.text : "";
  const brief = buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: history.filter((turn) => turn.role === "user").map((turn) => turn.content), canRetrieve: true });
  const violations = checkOutputIntegrity({ reply: text, brief }).map((violation) => `${violation.code}:${violation.detail}`);
  console.log(`\n=== ${message}\nmodel=${done && done.type === "done" ? done.model : "-"} safety=${done && done.type === "done" ? Boolean(done.safetyTriggered) : "-"} integrity=${violations.join(" | ") || "clean"}${error && error.type === "error" ? ` ERROR=${error.error}` : ""}\n${text}\n`);
  return { text, violations, safety: done && done.type === "done" ? Boolean(done.safetyTriggered) : false, status: response.status };
}

describe.skipIf(!live.enabled)("ICH-1 live provider smoke (opt-in)", () => {
  beforeEach(() => {
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-0000000000e1" } }, error: null }) }, from: vi.fn((name: string) => from(name)) } as never);
  });

  it("the provider is configured", () => {
    expect(isOpenAiConfigured()).toBe(true);
  });

  it.each([
    "yo what supplements should i take as a 18 years old natural gym rat",
    "do I need BCAA if I already eat enough protein?",
    "I barely eat fish, should I take omega-3?",
    "give me a natural test booster",
    "What does TUDCA do?",
    "should I train to failure every set?",
    "cardio is killing my gains right?",
    "carbs at night make me fat?",
  ])("answers: %s", async (message) => {
    const turn = await ask(message);
    expect(turn.status).toBe(200);
    expect(turn.text.length).toBeGreaterThan(20);
    expect(turn.safety).toBe(false);
  }, 120_000);

  it("'in english bro' inside a Vietnamese conversation is answered in English", async () => {
    const turn = await ask("in english bro", VI);
    expect(viShare(turn.text)).toBeLessThan(0.2);
  }, 120_000);

  it("'sao mày vô duyên thế' is not treated as a safety or distress turn", async () => {
    const turn = await ask("sao mày vô duyên thế", VI);
    expect(turn.safety).toBe(false);
    expect(turn.text.length).toBeGreaterThan(5);
  }, 120_000);
});
