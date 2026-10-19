/**
 * H0 closure: STRUCTURED DECISION > MODEL WORDING, and structured candidate delivery.
 * The tier is the server's (policy.ts::decideCandidates); prose may express, add nuance or challenge conditionally, never
 * restate a candidate in the opposite class. Candidate turns render DECISION DATA → ITEM ARRAY → DETERMINISTIC RENDERER.
 */
import { describe, expect, it } from "vitest";
import {
  applyScopedAnswerIntegrity,
  buildIntelligenceBrief,
  candidateItems,
  checkOutputIntegrity,
  renderCandidateAnswer,
  tierContradictions,
  type IntelligenceBrief,
} from "@/lib/intelligence/performance-core";
import { candidateCompleteness } from "@/lib/intelligence/performance-core/candidates";

const brief = (message: string) => buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true });
const tiers = (b: IntelligenceBrief) => Object.fromEntries(b.candidates!.priorities.map((p) => [p.candidate, p.tier]));
const flagged = (reply: string, b: IntelligenceBrief) => tierContradictions(reply, b).map((c) => c.candidate);
const codes = (reply: string, b: IntelligenceBrief) => checkOutputIntegrity({ reply, brief: b }).map((v) => v.code);

describe("canonical decisions per context (the owner)", () => {
  it.each([
    ["low fish intake", "I almost never eat fish. rank omega 3, creatine and whey for me", { "omega 3": "CONDITIONAL", creatine: "HIGH_UTILITY" }],
    ["adequate fish intake", "I eat salmon 4 times a week. rank omega 3, creatine and whey for me", { "omega 3": "LOW_VALUE" }],
    ["adequate protein", "I already hit my protein target from food. rank whey, eaa and bcaa for me", { whey: "LOW_VALUE", eaa: "LOW_VALUE", bcaa: "LOW_VALUE" }],
    ["inadequate protein", "I struggle to reach my protein target. rank whey, eaa and bcaa for me", { whey: "CONDITIONAL", bcaa: "LOW_VALUE" }],
    ["varied diet", "my diet is very varied. rank zinc, magnesium and multivitamin for me", { zinc: "LOW_VALUE", magnesium: "LOW_VALUE", multivitamin: "LOW_VALUE" }],
    ["unknown micronutrient state", "rank zinc, magnesium and multivitamin for me", { zinc: "CONDITIONAL", magnesium: "CONDITIONAL", multivitamin: "CONDITIONAL" }],
  ])("%s", (_name, message, expected) => {
    expect(tiers(brief(message))).toMatchObject(expected);
  });
});

describe("prose cannot contradict the tier", () => {
  const lowFish = brief("I almost never eat fish. rank omega 3, creatine and whey for me");
  const highFish = brief("I eat salmon 4 times a week. rank omega 3, creatine and whey for me");
  const buy = brief("I don't want to waste money. should I buy creatine, bcaa, zinc or fish oil?");

  it("CONTEXT_DEPENDENT → 'high priority' / 'must buy' / 'essential for you' are contradictions", () => {
    expect(flagged("Omega-3 is a high priority for you.", lowFish)).toEqual(["omega 3"]);
    expect(flagged("Fish oil is a must-buy.", lowFish)).toEqual(["omega 3"]);
    expect(flagged("Omega-3 is essential for you.", lowFish)).toEqual(["omega 3"]);
    expect(codes("Omega-3 is a high priority for you.", lowFish)).toContain("TIER_PROSE_CONTRADICTION");
  });

  it("CONTEXT_DEPENDENT → conditional wording is allowed (expressing / challenging conditionally)", () => {
    expect(flagged("Omega-3 may be useful depending on how often you eat oily fish.", lowFish)).toEqual([]);
    expect(flagged("Omega-3 is worth considering if you rarely eat fish.", lowFish)).toEqual([]);
    expect(flagged("Omega-3 isn't a must-buy.", lowFish)).toEqual([]);
  });

  it("LOW_PRIORITY → 'top priority' is a contradiction", () => {
    expect(flagged("Omega-3 should be your top priority.", highFish)).toEqual(["omega 3"]);
  });

  it("USUALLY_SKIP → 'you should buy this' is a contradiction", () => {
    expect(flagged("BCAA: you should buy it.", buy)).toEqual(["bcaa"]);
  });

  it("HIGH_PRIORITY → 'skip it' is a contradiction; a comparison sentence naming two candidates is not a tier statement", () => {
    expect(flagged("Creatine is not worth the money.", buy)).toEqual(["creatine"]);
    expect(flagged("Creatine is a higher priority than BCAA.", buy)).toEqual([]);
  });

  it("an essential NUTRIENT is not a priority claim (known NECESSITY false positive)", () => {
    expect(flagged("Zinc is an essential mineral.", buy)).toEqual([]);
  });

  it("the correction brief names the decided class", () => {
    const violations = checkOutputIntegrity({ reply: "Omega-3 is a high priority for you.", brief: lowFish });
    expect(violations).toContainEqual({ code: "TIER_PROSE_CONTRADICTION", detail: "omega 3|CONDITIONAL" });
  });
});

describe("deterministic restatement after a failed repair: valid content kept, no silent rerank", () => {
  it("multi-candidate: the contradicting sentence goes, the block restates the decided class, other prose stays", () => {
    const b = brief("I almost never eat fish. rank omega 3, creatine and whey for me");
    const draft = "Here's how I'd think about it.\n\nOmega-3 is a high priority for you. Creatine has the strongest evidence overall. Whey helps only if food can't cover protein.";
    const out = renderCandidateAnswer(draft, b, "en");
    expect(out).not.toMatch(/Omega-3 is a high priority/);
    expect(out).toMatch(/Creatine has the strongest evidence overall/);
    expect(out).toMatch(/\*\*Depends on your situation\*\*\n- \*\*Omega 3\*\*/);
    expect(tierContradictions(out, b)).toEqual([]);
    // Order in the block = the decision's order: nothing is reranked to match the prose.
    const order = [...out.matchAll(/^- \*\*([^*]+)\*\*/gm)].map((m) => m[1].toLowerCase());
    expect(order).toEqual(b.candidates!.priorities.map((p) => p.candidate));
  });

  it("single-candidate: the contradicting sentence is replaced by one restatement line, the rest is untouched", () => {
    const b = brief("should omega 3 be high priority for me?");
    const draft = "Omega-3 fats are found in oily fish. Omega-3 is a top priority for you. Ask yourself how often you eat fish.";
    const out = renderCandidateAnswer(draft, b, "en");
    expect(out).toMatch(/^Omega-3 fats are found in oily fish\./);
    expect(out).not.toMatch(/top priority/);
    expect(out).toMatch(/Ask yourself how often you eat fish\./);
    expect(out).toMatch(/\*\*Omega-3 \(fish oil\)\*\* — .*more worth it if oily fish is rarely eaten/);
  });

  it("a clean single-candidate reply is returned exactly as written", () => {
    const b = brief("should omega 3 be high priority for me?");
    const clean = "It depends on how often you eat oily fish: worth considering if rarely, less needed if twice a week or more.";
    expect(renderCandidateAnswer(clean, b, "en")).toBe(clean);
  });
});

describe("structured delivery: renderer owns order, numbering, tiers, completeness", () => {
  const EIGHT = "creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin - rank these for me";

  it("8-supplement ranking: 8 requested = 8 evaluated = 8 rendered, tier headings in stable order, no fake 1..8", () => {
    const b = brief(EIGHT);
    const out = applyScopedAnswerIntegrity({ draft: "Based on what I know so far, here's the picture.\n\n1. Creatine\n2.\n3. Whey", question: EIGHT, brief: b, language: "en" }).reply;
    expect(candidateItems(b.candidates!, "en")).toHaveLength(8);
    expect(candidateCompleteness(out, b.candidates).missing).toEqual([]);
    expect([...out.matchAll(/^- \*\*/gm)]).toHaveLength(8);
    // The model's own (broken) numbered list is gone: no empty item, no "2." with nothing after it.
    expect(out).not.toMatch(/^\d+\.\s*$/m);
    const headings = [...out.matchAll(/^\*\*([^*]+)\*\*$/gm)].map((m) => m[1]);
    expect(headings).toEqual(["High priority (still optional)", "Depends on your situation", "Low priority — usually skip"]);
    expect(out.indexOf("Based on what I know so far")).toBeLessThan(out.indexOf("**High priority"));
  });

  it("an exact order is numbered 1..N continuously only when the decision justifies it", () => {
    const b = brief("I already hit my protein target from food and eat salmon twice a week. rank creatine, omega 3 and bcaa for me");
    const block = renderCandidateAnswer("", b, "en");
    if (b.candidates!.exactOrderJustified) expect(block).toMatch(/^1\. \*\*/m);
    else expect(block).not.toMatch(/^\d+\. /m);
  });

  it("purchase: NO PURCHASE is a valid outcome; nothing is pushed beyond the one high-priority item", () => {
    const b = brief("I don't want to waste money. should I buy creatine, bcaa, zinc or fish oil?");
    const out = renderCandidateAnswer("Short answer: you need less than you think.", b, "en");
    expect(out).toMatch(/You don't need to buy any of these to make progress\. If you buy only one, start with Creatine\./);
    const none = brief("my diet is very varied and I eat salmon 4 times a week. should I buy zinc, magnesium or fish oil?");
    expect(renderCandidateAnswer("", none, "en")).toMatch(/Buying none of these right now is a reasonable choice\./);
  });

  it("Vietnamese answers render Vietnamese headings and conditions", () => {
    const b = brief(EIGHT);
    const out = renderCandidateAnswer("", b, "vi");
    expect(out).toMatch(/\*\*Tùy tình huống của bạn\*\*/);
    expect(out).toMatch(/đáng cân nhắc hơn nếu hiếm khi ăn cá béo/);
    expect(out).not.toMatch(/more worth it if/);
  });

  it("training ranking: nothing is assessed, so the model's own order is kept and nothing is dropped", () => {
    const b = brief("rank bench press, push ups and dips for chest growth");
    const draft = "1. Bench press — easiest to load progressively.\n2. Dips — big stretch on the chest.\n3. Push ups — great for volume.";
    expect(renderCandidateAnswer(draft, b, "en")).toBe(draft);
    expect(tierContradictions("Bench press is your top priority.", b)).toEqual([]);
  });

  it("food ranking: every listed food is a candidate (\"as <criterion>\" ends the list), a dropped one is accounted for", () => {
    const b = brief("rank banana, oats and rice cakes as pre-workout food");
    expect(b.candidates!.request.candidates.map((c) => c.label)).toEqual(["banana", "oats", "rice cakes"]);
    const out = renderCandidateAnswer("1. Banana\n2. Oats", b, "en");
    expect(out).toMatch(/Also on your list:\n- Rice cakes: /);
  });
});
