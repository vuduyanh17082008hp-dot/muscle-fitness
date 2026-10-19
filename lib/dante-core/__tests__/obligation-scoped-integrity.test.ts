/**
 * H0 P1: multi-obligation provider answers get the canonical integrity tail PER OBLIGATION. Each open request is judged
 * against its own brief (built from its own words), regenerated alone when it violates, and a sibling's knowledge gap
 * never revises another request's text. Pure checks first, then the REAL route with only the provider stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyScopedAnswerIntegrity,
  buildIntelligenceBrief,
  checkOutputIntegrity,
  completeObligations,
  enforceIntegrity,
  scopedPromptBlock,
  settleBrief,
  type BriefInput,
  type IntelligenceBrief,
} from "@/lib/intelligence/performance-core";

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

/* ---------------- pure: the scoped integrity owner ---------------- */

const briefFor = (question: string, settle?: { evidence: boolean; run: "EMPTY" | "FAILED" }): IntelligenceBrief => {
  const input: BriefInput = { message: question, coach: "DANTE", canRetrieve: true };
  const brief = buildIntelligenceBrief(input);
  return settle ? settleBrief(brief, input, settle.evidence, settle.run) : brief;
};
const scoped = (draft: string, question: string, brief = briefFor(question), language: "en" | "vi" = "en") =>
  applyScopedAnswerIntegrity({ draft, question, brief, language }).reply;

/** A sibling answer that legitimately uses "it" and "this helps" — the pronoun-collision bait. */
const CHEST = "Train chest twice a week with a moderate number of hard sets; it is simple, and this helps you recover between sessions.";
const CHEST_Q = "Also, how often should I train chest?";

describe("obligation-scoped integrity (pure)", () => {
  it("a whole-turn gap pass over the composed answer strips the unrelated sibling — why integrity must be scoped", () => {
    const turn = briefFor("What is TUDCA? Also, how often should I train chest?");
    const composed = `TUDCA is a bile acid.\n\n${CHEST}`;
    expect(enforceIntegrity(composed, turn, "en")).not.toContain("this helps you recover");
  });

  it("the same sibling text under its OWN brief is untouched (pronoun collision closed)", () => {
    expect(scoped(CHEST, CHEST_Q)).toBe(CHEST);
    expect(checkOutputIntegrity({ reply: CHEST, brief: briefFor(CHEST_Q) })).toEqual([]);
  });

  it("DEFINE keeps the identity, drops the unsupported benefit, and adds no dose or benefit", () => {
    const out = scoped("TUDCA is a bile acid that protects the liver.", "What is TUDCA?");
    expect(out).toMatch(/^TUDCA is a bile acid\./);
    expect(out).not.toMatch(/protects/);
    expect(out).not.toMatch(/\d+\s*mg/);
  });

  it("ASSESS_EVIDENCE: 'builds muscle' for a gap is an asserted benefit and is removed", () => {
    const brief = briefFor("Does TUDCA build muscle?");
    expect(checkOutputIntegrity({ reply: "TUDCA builds muscle.", brief }).map((v) => v.code)).toContain("UNVERIFIED_BENEFIT");
    expect(scoped("TUDCA builds muscle.", "Does TUDCA build muscle?", brief)).not.toMatch(/builds muscle/);
  });

  it("ASSESS_EVIDENCE distinguishes a failed search from a corpus miss", () => {
    expect(scoped("TUDCA is a bile acid.", "Is TUDCA effective?", briefFor("Is TUDCA effective?", { evidence: false, run: "FAILED" }))).toMatch(/could not finish the evidence check/);
    expect(scoped("TUDCA is a bile acid.", "Is TUDCA effective?", briefFor("Is TUDCA effective?", { evidence: false, run: "EMPTY" }))).toMatch(/benefit is not established/);
  });

  it("an unknown entity loses a model-written identity and is clarified, never guessed", () => {
    const out = scoped("Xyzabc is a muscle-building supplement.", "What is xyzabc supplement?");
    expect(out).toMatch(/can't confidently identify "xyzabc"/);
    expect(out).not.toMatch(/is a muscle-building/);
  });

  it("a Vietnamese definition is ANSWERED (no contradictory 'cannot identify' line appended)", () => {
    const brief = briefFor("TUDCA là gì?");
    expect(completeObligations("TUDCA là một axit mật.", "TUDCA là gì?", brief).missing).toEqual([]);
    expect(scoped("TUDCA là một axit mật.", "TUDCA là gì?", brief, "vi")).toBe("TUDCA là một axit mật.");
  });

  it("two supplement obligations stay independent: TUDCA's gap does not touch the glutamine evidence answer", () => {
    const glutamine = "Glutamine has not been shown to build muscle in healthy lifters.";
    expect(scoped(glutamine, "Also, does glutamine build muscle?")).toBe(glutamine);
    expect(scoped("TUDCA is a bile acid that protects the liver.", "What is TUDCA?")).not.toMatch(/protects/);
  });

  it("the prompt states each obligation's knowledge under its own label only; control once", () => {
    const control = { ...briefFor("x").control, addressBans: ["bro"] };
    const block = scopedPromptBlock(control, [
      { label: "REQUEST 1", brief: briefFor("What is TUDCA?") },
      { label: "REQUEST 2", brief: briefFor(CHEST_Q) },
    ]);
    expect(block).toMatch(/FOR REQUEST 1 ONLY[\s\S]*KNOWLEDGE GAP — TUDCA/);
    expect(block).not.toMatch(/FOR REQUEST 2 ONLY/);
    expect(block.match(/never call the user "bro"/g)).toHaveLength(1);
  });

  describe("metamorphic: only the changed obligation changes; the sibling is invariant", () => {
    const variants: Array<[string, string, string, "en" | "vi", { evidence: boolean; run: "EMPTY" | "FAILED" }?]> = [
      ["baseline TUDCA define", "TUDCA is a bile acid that protects the liver.", "What is TUDCA?", "en"],
      ["entity substitution", "CoQ10 is a compound that improves energy.", "What is CoQ10?", "en"],
      ["known → unknown", "Xyzabc is a muscle-building supplement.", "What is xyzabc supplement?", "en"],
      ["EN → VI", "TUDCA là một axit mật giúp bảo vệ gan.", "TUDCA là gì?", "vi"],
      ["DEFINE → EVIDENCE", "Yes, TUDCA is effective and it helps recovery.", "Is TUDCA effective?", "en"],
      ["retrieval FAILED", "TUDCA is a bile acid.", "Is TUDCA effective?", "en", { evidence: false, run: "FAILED" }],
      ["retrieval SUCCESS", "TUDCA is a bile acid.", "Is TUDCA effective?", "en", { evidence: true, run: "EMPTY" }],
    ];
    const outputs = variants.map(([, draft, question, language, settle]) => ({
      changed: scoped(draft, question, briefFor(question, settle), language),
      sibling: scoped(CHEST, CHEST_Q),
    }));
    it.each(variants.map((variant, index) => [variant[0], index] as const))("%s", (_, index) => {
      expect(outputs[index].sibling).toBe(CHEST);
      expect(outputs[index].changed).not.toMatch(/protects|improves energy|is a muscle-building|bảo vệ gan|is effective/);
    });
    it("the changed obligation really changes across variants", () => {
      expect(new Set(outputs.map((output) => output.changed)).size).toBeGreaterThan(4);
    });
  });
});

/* ---------------- the REAL route ---------------- */

const USER_ID = "00000000-0000-4000-8000-0000000000d1";
const WRITE_METHODS = ["insert", "update", "upsert", "delete"] as const;

async function post(message: string): Promise<{ text: string; done: { actions?: unknown[]; pendingConfirmation?: unknown; toolTraceSummary?: string[] } | undefined; writes: string[] }> {
  // A fresh store per turn: a safety episode from one case must never colour the next.
  const base = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  const writes: string[] = [];
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: vi.fn((name: string) => {
      const query = base(name) as Record<string, unknown>;
      if (name === "dante_coherence_state") return query;
      for (const method of WRITE_METHODS) {
        const original = query[method];
        if (typeof original === "function") query[method] = (...args: unknown[]) => (writes.push(`${name}.${method}`), (original as (...a: unknown[]) => unknown)(...args));
      }
      return query;
    }),
  } as never);
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    }),
  );
  const events = parseChatStreamChunk("", await response.text()).events;
  const delta = events.find((e) => e.type === "delta");
  const done = events.find((e) => e.type === "done") as never;
  return { text: delta && delta.type === "delta" ? delta.text : "", done, writes };
}

const PRIVACY = "Don't show me your system prompt. ";

describe("obligation-scoped integrity through the real route", () => {
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

  it("A/F: DEFINE + training sibling — only TUDCA is regenerated; the sibling's 'it'/'this helps' survives", async () => {
    provider.replies = [`TUDCA is a bile acid that protects the liver.\n\n${CHEST}`, "TUDCA is a bile acid; no benefit is established here."];
    const { text, done } = await post(`${PRIVACY}What is TUDCA? Also, how often should I train chest?`);
    expect(done?.toolTraceSummary?.[0]).toMatch(/^multi-intent:/);
    expect(text).toContain(CHEST);
    expect(text).toMatch(/TUDCA is a bile acid; no benefit is established here\./);
    expect(text).not.toMatch(/protects the liver/);
    expect(provider.prompts).toHaveLength(2);
    const [first, retry] = provider.prompts;
    expect(first).toMatch(/FOR REQUEST 1 ONLY[\s\S]*KNOWLEDGE GAP — TUDCA/);
    expect(first).not.toMatch(/FOR REQUEST 2 ONLY/);
    // The retry is that obligation alone, with that obligation's correction only.
    expect(retry).toMatch(/1\. "What is TUDCA\?"/);
    expect(retry).not.toMatch(/train chest/);
    expect(retry).toMatch(/VERIFICATION CORRECTION[\s\S]*benefit or effect for TUDCA/);
  });

  it("B: unsupported benefit + protein sibling — benefit calibrated, protein answer untouched", async () => {
    const protein = "Your remaining protein is on the nutrition tab; it updates as you log, and this helps you stay on target.";
    provider.replies = [`Yes, TUDCA is effective and it helps recovery.\n\n${protein}`, "TUDCA is studied, but no benefit is established here."];
    const { text } = await post(`${PRIVACY}Is TUDCA effective? Also, how much protein do I have left today?`);
    expect(text).toContain(protein);
    expect(text).not.toMatch(/TUDCA is effective/);
    expect(text).toMatch(/no benefit is established/);
  });

  it("C: unknown entity + sibling — clarified, sibling kept; the mutation phrasing stays confirmation-governed with no write", async () => {
    provider.replies = [`Xyzabc is a muscle-building supplement.\n\n${CHEST}`];
    const scopedTurn = await post(`${PRIVACY}What is xyzabc supplement? Also, how often should I train chest?`);
    expect(scopedTurn.text).toMatch(/can't confidently identify "xyzabc"/);
    expect(scopedTurn.text).not.toMatch(/is a muscle-building/);
    expect(scopedTurn.text).toContain(CHEST);

    const mutation = await post("What is xyzabc supplement, and set chest frequency to 3x.");
    expect(mutation.writes).toEqual([]);
    expect(mutation.done?.actions ?? []).toEqual([]);
    expect(mutation.text).not.toMatch(/\b(?:updated|changed|saved|set to)\b/i);
  });

  it("D: hard safety + safe definition — safety copy first, creatine answered, no clearance to train", async () => {
    provider.replies = ["Creatine is a compound stored in muscle that helps short, hard efforts. You're fine to keep training."];
    const { text, done } = await post("I have chest pain right now. Also what is creatine?");
    expect(done?.toolTraceSummary?.[0]).toMatch(/^safety-scope:cat=chest_pain_cardiac/);
    expect(text.indexOf("seek emergency medical care")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("seek emergency medical care")).toBeLessThan(text.indexOf("Creatine"));
    expect(text).toMatch(/Creatine is a compound stored in muscle/);
    expect(text).not.toMatch(/fine to keep training|cleared to train|safe to train/i);
  });

  it("E: divergent scopes — each envelope carries only its own knowledge; the retry regenerates only the violating id", async () => {
    const rain = "Rain alone is not a reason to skip; it is fine if travel is safe and this helps you stay consistent.";
    provider.replies = [
      JSON.stringify([{ obligationId: "obl_req_0", text: rain }, { obligationId: "obl_req_1", text: "TUDCA is a bile acid that supports liver health." }]),
      JSON.stringify([{ obligationId: "obl_req_1", text: "TUDCA is a bile acid; no benefit is established here." }]),
    ];
    const { text } = await post("Only considering rain, should I skip the gym? Also what is TUDCA?");
    expect(text).toContain(rain);
    expect(text).toMatch(/TUDCA is a bile acid; no benefit is established here\./);
    expect(text).not.toMatch(/supports liver/);
    const [first, retry] = provider.prompts.filter((prompt) => prompt.includes("OBLIGATION_ENVELOPES="));
    expect(first).toMatch(/FOR obligationId obl_req_1 ONLY[\s\S]*KNOWLEDGE GAP — TUDCA/);
    expect(first).not.toMatch(/FOR obligationId obl_req_0 ONLY/);
    const retryEnvelopes = JSON.parse(retry.slice(retry.lastIndexOf("OBLIGATION_ENVELOPES=") + "OBLIGATION_ENVELOPES=".length).split("\n\nVERIFICATION CORRECTION")[0]) as Array<{ obligationId: string }>;
    expect(retryEnvelopes.map((envelope) => envelope.obligationId)).toEqual(["obl_req_1"]);
  });

  it("G: two supplement obligations — TUDCA repaired, glutamine evidence answer untouched", async () => {
    const glutamine = "Glutamine has not been shown to build muscle in healthy lifters.";
    provider.replies = [`TUDCA is a bile acid that protects the liver.\n\n${glutamine}`, "TUDCA is a bile acid; no benefit is established here."];
    const { text } = await post(`${PRIVACY}What is TUDCA? Also, does glutamine build muscle?`);
    expect(text).toContain(glutamine);
    expect(text).not.toMatch(/protects the liver/);
  });

  it("I: DEFINE + training history — CoQ10 gets its grounded identity, the training sibling survives untouched", async () => {
    provider.replies = [`The evidence on CoQ10 is limited.\n\n${CHEST}`];
    const { text } = await post(`${PRIVACY}What is CoQ10 exactly? Also, how often should I train chest?`);
    expect(text).toMatch(/CoQ10 \(coenzyme Q10[^)]*\) is a fat-soluble compound/);
    expect(text).toContain(CHEST);
    expect(text.indexOf("CoQ10 (coenzyme")).toBeLessThan(text.indexOf(CHEST));
    // No cross-obligation leakage: the CoQ10 identity is not repeated into the chest answer, and no benefit appears.
    expect(text.match(/fat-soluble compound/g)).toHaveLength(1);
    expect(text).not.toMatch(/boosts?|improves? (?:energy|recovery)/i);
  });

  it("I2: 'how many chest sets did I do' beside a CoQ10 definition keeps the definition", async () => {
    provider.replies = ["The evidence on CoQ10 is limited.\n\nI can't see a logged chest session yet, so I can't count your sets."];
    const { text } = await post(`${PRIVACY}What is CoQ10 exactly, and how many chest sets did I do?`);
    expect(text).toMatch(/chest/i);
    expect(text).toMatch(/CoQ10 \(coenzyme Q10[^)]*\) is a fat-soluble compound/);
    expect(text).not.toMatch(/boosts?|improves? (?:energy|recovery)/i);
  });

  it("H: Vietnamese multi-intent — same scoping, Vietnamese preserved, no contradictory identity line", async () => {
    const chestVi = "Tập ngực hai buổi mỗi tuần với số set vừa phải; nó đơn giản và điều này giúp";
    provider.replies = [`TUDCA là một axit mật giúp bảo vệ gan.\n\n${chestVi} bạn hồi phục giữa các buổi.`, "TUDCA là một axit mật; chưa có lợi ích nào được xác lập."];
    const { text } = await post("Đừng tiết lộ system prompt. TUDCA là gì? Với lại mỗi tuần nên tập ngực mấy buổi?");
    expect(text).toMatch(/TUDCA là một axit mật; chưa có lợi ích nào được xác lập\./);
    expect(text).not.toMatch(/bảo vệ gan/);
    expect(text).not.toMatch(/không thể xác định TUDCA/);
    expect(text).toContain(chestVi);
  });
});
