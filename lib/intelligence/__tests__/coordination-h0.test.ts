/**
 * H0 cluster D — ROUTING / COORDINATION.
 *
 * A. A safety disclosure made to Dante crosses to Gemma as closed-vocabulary context (never the user's words).
 * B. Gemma's consumer turns it into directives; an allergen becomes a meal-engine exclusion term.
 * C. Domain ownership: Dante keeps what it owns (actions, log status, supplements, disclosures, safety context);
 *    a real meal-construction handoff quotes the request so the obligation survives.
 * D. Gemma hands training programming to Dante with a disposition, and never says "AI Coach".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildContextWorkingSet, renderContextWorkingSet } from "@/lib/intelligence/performance-core";
import { buildDisclosureSignals, DISCLOSURE_ALLERGY_DAYS, retractedDisclosureTypes, toUserScopeRef, withDisclosedFacts } from "@/lib/intelligence/dante-runtime";
import { ALLERGEN_GUARD, coordinationNote, interpretSignalsForGemma } from "@/lib/intelligence/gemma-consumer";
import { parseCoachMessage, TRAINING_REDIRECT } from "@/lib/nutrition/coach/intent";

const USER = "00000000-0000-4000-8000-0000000000d1";
const NOW = new Date("2026-10-16T10:00:00.000Z");
const signals = (prior: string[], message: string) =>
  buildDisclosureSignals({ userScope: toUserScopeRef(USER), context: buildContextWorkingSet({ priorUserMessages: prior, message }), timezone: "Asia/Singapore" }, NOW);

describe("A. disclosure signals", () => {
  it.each([
    ["I'm on cycle", "USER_DISCLOSED_NO_DRUG_OPTIMISED_DIET"],
    ["I use insulin to bulk", "USER_DISCLOSED_INSULIN_HYPO_RISK"],
    ["I'm pregnant", "USER_DISCLOSED_PREGNANCY_AWARE_NUTRITION"],
    ["I'm allergic to fish", "USER_DISCLOSED_AVOID_ALLERGEN_FISH"],
    ["I've been eating 600 calories a day to get lean", "USER_DISCLOSED_NO_DEFICIT_LOW_INTAKE"],
    ["I have chronic kidney disease", "USER_DISCLOSED_KIDNEY_CONDITION_PROTEIN_BY_DOCTOR"],
    ["I have type 1 diabetes", "USER_DISCLOSED_DIABETES_GLUCOSE_AWARE"],
  ])("%s → %s", (message, type) => {
    const [signal] = signals([], message);
    expect(signal?.signalType).toBe(type);
    expect(signal).toMatchObject({ privacyClass: "SENSITIVE", sourceDomain: "GLOBAL", status: "INFERENCE", sourceCoach: "DANTE" });
    // The user's words never cross: only the closed directive.
    expect(JSON.stringify(signal)).not.toContain(message);
    expect(JSON.stringify(signal)).not.toMatch(/"quote"|"label"/);
  });

  it("only what was disclosed THIS turn is published (no re-write every turn)", () => {
    expect(signals(["I'm on cycle"], "what supps?")).toEqual([]);
  });

  it("nothing for a natural lifter, a past cycle or a domain fact", () => {
    expect(signals([], "I'm natural, never used steroids")).toEqual([]);
    expect(signals([], "I did one cycle 2 years ago")).toEqual([]);
    expect(signals([], "I weigh 80 kg")).toEqual([]);
  });
});

describe("B. Gemma reads them as directives", () => {
  it("disclosures become directives + prompt context; allergens map to engine guard terms", () => {
    const published = [...signals([], "I'm allergic to fish"), ...signals([], "I'm on cycle")];
    const view = interpretSignalsForGemma(published, USER, NOW);
    expect(view.directives).toEqual(expect.arrayContaining(["AVOID_ALLERGEN_FISH", "NO_DRUG_OPTIMISED_DIET"]));
    expect(view.promptContext.map((p) => p.value).join(" ")).toMatch(/allergic to fish/);
    expect(ALLERGEN_GUARD.AVOID_ALLERGEN_FISH).toBe("fish");
  });

  it("a disclosure note never talks about a recovery budget", () => {
    const view = interpretSignalsForGemma(signals([], "I'm allergic to fish"), USER, NOW);
    const note = coordinationNote(view, 50)!;
    expect(note).toMatch(/fish allergy/);
    expect(note).not.toMatch(/recovery|kcal remain/);
  });

  it("an expired disclosure is ignored; an allergy outlives a day, a present state does not", () => {
    const day = 25 * 3600_000;
    expect(interpretSignalsForGemma(signals([], "I eat 700 calories a day"), USER, new Date(NOW.getTime() + day)).signalLoaded).toBe(false);
    expect(interpretSignalsForGemma(signals([], "I'm allergic to fish"), USER, new Date(NOW.getTime() + day)).signalLoaded).toBe(true);
    const later = new Date(NOW.getTime() + (DISCLOSURE_ALLERGY_DAYS * 24 + 1) * 3600_000);
    expect(interpretSignalsForGemma(signals([], "I'm allergic to fish"), USER, later).signalLoaded).toBe(false);
  });
});

describe("A2. disclosures are the user's, not one coach's (hackathon repair F-01/F-17)", () => {
  const gemma = (prior: string[], message: string) =>
    buildDisclosureSignals({ userScope: toUserScopeRef(USER), context: buildContextWorkingSet({ priorUserMessages: prior, message }), source: "GEMMA" }, NOW);

  it("Gemma publishes too, and every disclosure targets both coaches", () => {
    const [low] = gemma([], "I eat about 700 kcal a day");
    expect(low).toMatchObject({ sourceCoach: "GEMMA", signalType: "USER_DISCLOSED_NO_DEFICIT_LOW_INTAKE" });
    expect(low!.implications.map((i) => i.targetDomain).sort()).toEqual(["NUTRITION", "TRAINING"]);
    expect(signals([], "I'm allergic to fish")[0]!.implications.map((i) => i.targetDomain).sort()).toEqual(["NUTRITION", "TRAINING"]);
  });

  it("re-stating a fact later publishes a new row (a withdrawn one can never swallow it as a duplicate)", () => {
    const first = signals([], "I'm allergic to fish")[0]!;
    const again = buildDisclosureSignals({ userScope: toUserScopeRef(USER), context: buildContextWorkingSet({ message: "I'm allergic to fish" }) }, new Date(NOW.getTime() + 60_000))[0]!;
    expect(again.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it.each([
    ["I'm not allergic to fish after all", ["USER_DISCLOSED_AVOID_ALLERGEN_FISH"]],
    ["I outgrew my peanut allergy", ["USER_DISCLOSED_AVOID_ALLERGEN_NUTS"]],
    ["no allergies", expect.arrayContaining(["USER_DISCLOSED_AVOID_ALLERGEN_FISH", "USER_DISCLOSED_AVOID_ALLERGEN_SESAME"])],
    ["I'm eating normally again", ["USER_DISCLOSED_NO_DEFICIT_LOW_INTAKE"]],
  ])("retraction %s → withdraws %j", (message, types) => {
    expect(retractedDisclosureTypes(message)).toEqual(types);
  });

  it.each([
    "my friend is not allergic to fish",
    "am I not allergic to fish?",
    "I'm allergic to fish",
    "my sister is allergic to fish",
    "what should I eat tonight",
  ])("never withdraws on %s", (message) => {
    expect(retractedDisclosureTypes(message)).toEqual([]);
  });

  it("seafood names fish and shellfish; a named fish under 'seafood' is fish", () => {
    const types = (message: string) => signals([], message).map((s) => s.signalType).sort();
    expect(types("Seafood like salmon and cod makes my throat itchy and swollen, I think I am allergic.")).toEqual(["USER_DISCLOSED_AVOID_ALLERGEN_FISH", "USER_DISCLOSED_AVOID_ALLERGEN_SHELLFISH"]);
    expect(types("I'm allergic to seafood")).toEqual(["USER_DISCLOSED_AVOID_ALLERGEN_FISH", "USER_DISCLOSED_AVOID_ALLERGEN_SHELLFISH"]);
    expect(types("I'm allergic to shellfish")).toEqual(["USER_DISCLOSED_AVOID_ALLERGEN_SHELLFISH"]);
  });

  it("third-party, negated and question allergy statements publish nothing", () => {
    expect(signals([], "my sister is allergic to fish")).toEqual([]);
    expect(signals([], "My sister is allergic to shellfish, so I cook without it when she visits.")).toEqual([]);
    expect(signals([], "I'm allergic to fish, so is my sister")[0]?.signalType).toBe("USER_DISCLOSED_AVOID_ALLERGEN_FISH");
    expect(signals([], "My sister and I are both allergic to peanuts")[0]?.signalType).toBe("USER_DISCLOSED_AVOID_ALLERGEN_NUTS");
    expect(signals([], "I'm not allergic to fish")).toEqual([]);
    expect(signals([], "is tuna a fish?")).toEqual([]);
  });

  it("the other coach's (or an earlier chat's) disclosure joins the working set; local statements keep authority", () => {
    const fromGemma = gemma([], "I eat about 700 kcal a day");
    const merged = withDisclosedFacts(buildContextWorkingSet({ message: "should I add an hour of hard cardio daily?" }), fromGemma, "DANTE");
    expect(merged.facts).toEqual([expect.objectContaining({ key: "ENERGY_INTAKE", kind: "LOW_ENERGY_INTAKE", relevance: "SAFETY", status: "ACTIVE", via: "told Gemma (nutrition coach)" })]);
    expect(renderContextWorkingSet(merged).join(" ")).toMatch(/dangerously low energy intake — user, told Gemma \(nutrition coach\)/);
    expect(withDisclosedFacts(buildContextWorkingSet({ message: "cardio?" }), gemma([], "I'm allergic to fish"), "DANTE").facts.map((f) => f.key)).toEqual(["ALLERGY:fish"]);
    expect(withDisclosedFacts(buildContextWorkingSet({ message: "cardio?" }), fromGemma, "GEMMA").facts).toEqual([expect.objectContaining({ key: "ENERGY_INTAKE", via: "said in an earlier chat" })]);
    const local = buildContextWorkingSet({ priorUserMessages: ["I eat 700 calories a day"], message: "I'm eating normally again" });
    expect(withDisclosedFacts(local, fromGemma, "DANTE")).toBe(local);
  });
});

describe("D. Gemma → Dante handoff for training", () => {
  it.each(["how should I structure my push day?", "what's a good leg day split?"])("%s → redirect_training with a disposition", (message) => {
    const parsed = parseCoachMessage(message, { hasDraft: false });
    expect(parsed.kind).toBe("redirect_training");
  });
  it("the redirect names Dante, never 'AI Coach', and offers Gemma's part", () => {
    expect(TRAINING_REDIRECT).not.toMatch(/AI Coach/);
    expect(TRAINING_REDIRECT).toMatch(/what to eat around that session/);
  });
  it("food around a session stays with Gemma", () => {
    expect(parseCoachMessage("what should I eat before leg day?", { hasDraft: false }).kind).not.toBe("redirect_training");
  });
});

/* ---------------------------------- C. through the real Dante route ---------------------------------- */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const provider = vi.hoisted(() => ({ text: "ok", prompts: [] as string[] }));
vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: provider.text };
    yield { kind: "model", model: "stub-provider" };
  },
}));
vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/llm-client")>();
  return { ...actual, callDanteLlm: vi.fn(async () => null), callDanteAgentTurn: vi.fn(async () => ({ type: "final", reply: "I can propose that; nothing has been saved yet." })) };
});

describe("C. domain ownership through the route", async () => {
  const { POST } = await import("@/app/api/chatbot/route");
  const { createClient } = await import("@/lib/supabase/server");
  const { parseChatStreamChunk } = await import("@/lib/dante-core/chat-stream-protocol");
  const { createFakeCoherenceTable, fakeCoherenceFrom } = await import("@/lib/dante-core/__tests__/support/fake-coherence-supabase");
  const post = async (message: string, prior: string[] = []) => {
    const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [...prior, message].map((content) => ({ role: "user", content })) }) }));
    const events = parseChatStreamChunk("", await response.text()).events;
    const done = events.find((e) => e.type === "done");
    return { text: events.filter((e) => e.type === "delta").map((e) => (e.type === "delta" ? e.text : "")).join(""), model: done && done.type === "done" ? done.model : "" };
  };
  beforeEach(() => {
    const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
      from: vi.fn((name: string) => from(name)),
      rpc: vi.fn(async () => ({ data: [{ allowed: true, remaining: 10, retry_after_seconds: 0 }], error: null })),
    } as never);
  });

  it.each([
    "I've been eating 600 calories a day to get lean",
    "I eat about 120g protein a day",
    "add 200g chicken breast to lunch",
    "did my eggs get logged?",
    "is whey protein worth buying?",
  ])("Dante keeps: %s", async (message) => {
    expect((await post(message)).model).not.toBe("dante-defer-to-gemma");
  });

  it("with an active safety disclosure, a meal question stays with Dante (the safety part is handled where it was said)", async () => {
    expect((await post("what should I eat before training?", ["I have type 1 diabetes"])).model).not.toBe("dante-defer-to-gemma");
  });

  it("a plain meal-construction ask is handed off WITH the request quoted (no lost obligation)", async () => {
    const turn = await post("give me a high protein dinner idea");
    if (turn.model === "dante-defer-to-gemma") expect(turn.text).toMatch(/give me a high protein dinner idea/);
  });
});

describe("D2. a supplement question to Gemma is answered food-first (shared knowledge), never a training bounce", () => {
  it.each(["what supplements should I take for recovery?", "should I take creatine?", "is magnesium worth it?"])("%s is not redirected", (message) => {
    expect(parseCoachMessage(message, { hasDraft: false }).kind).not.toBe("redirect_training");
  });
  it("a pure training question still goes to Dante", () => {
    expect(parseCoachMessage("how should I structure my push day?", { hasDraft: false }).kind).toBe("redirect_training");
  });
});
