/**
 * H0 Batch B: purchase decision / candidate completeness / context-aware ranking. Deterministic only — structure and
 * policy, never prose. Live behaviour: lib/dante-core/__tests__/candidate-decision.live.test.ts (opt-in).
 *
 *   REQUESTED = EVALUATED = RENDERED · CONDITIONAL PRIORITY > FAKE ABSOLUTE RANKING · VERIFIED STATE > GENERIC QUESTION
 */
import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "@/lib/dante-core/openai/prompt-budget";
import {
  applyScopedAnswerIntegrity,
  buildAnswerTrace,
  buildIntelligenceBrief,
  checkOutputIntegrity,
  renderCandidateAnswer,
  settleBrief,
  type IntelligenceBrief,
} from "@/lib/intelligence/performance-core";
import { candidateCompleteness } from "@/lib/intelligence/performance-core/candidates";

const brief = (message: string, prior: string[] = []) => buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: prior, canRetrieve: true });
const decision = (b: IntelligenceBrief) => b.candidates!;
const tierOf = (b: IntelligenceBrief, label: string) => decision(b).priorities.find((p) => p.candidate === label)?.tier;
const order = (b: IntelligenceBrief) => decision(b).priorities.map((p) => p.candidate);
const codes = (reply: string, b: IntelligenceBrief) => checkOutputIntegrity({ reply, brief: b }).map((v) => v.code);

const EIGHT = "creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin";
const EIGHT_LABELS = ["creatine", "whey", "bcaa", "eaa", "zinc", "magnesium", "omega 3", "multivitamin"];

describe("22/33. explicit 8-candidate set: requested = evaluated = rendered", () => {
  const b = brief(`${EIGHT} - rank these for me`);

  it("extracts all 8, keeps BCAA and EAA distinct, and evaluates every one", () => {
    const request = decision(b).request;
    expect(request.task).toBe("RANK");
    expect(request.criterion).toBe("PERSONAL");
    expect(request.candidates.map((c) => c.label)).toEqual(EIGHT_LABELS);
    expect(new Set(request.candidates.map((c) => c.entity)).size).toBe(8);
    expect(decision(b).priorities).toHaveLength(8);
    expect(new Set(order(b))).toEqual(new Set(EIGHT_LABELS));
  });

  it("no top-N cap: every candidate's record or gap is in scope", () => {
    expect(b.knowledge.records.map((r) => r.id)).toEqual(expect.arrayContaining([
      "supplement-creatine", "supplement-whey", "supplement-bcaa", "supplement-eaa", "supplement-omega3", "supplement-multivitamin",
    ]));
    expect(b.knowledge.gaps.map((g) => g.topic)).toEqual(expect.arrayContaining(["zinc", "magnesium"]));
  });

  it("priority is conditional where context is unknown — no exact 1..8 order", () => {
    expect(decision(b).dependsOnUnknown).toBe(true);
    expect(decision(b).exactOrderJustified).toBe(false);
    expect(tierOf(b, "creatine")).toBe("HIGH_UTILITY");
    expect(tierOf(b, "whey")).toBe("CONDITIONAL");
    expect(tierOf(b, "omega 3")).toBe("CONDITIONAL");
    expect(tierOf(b, "bcaa")).toBe("LOW_VALUE");
    expect(order(b).indexOf("eaa")).toBeLessThan(order(b).indexOf("bcaa"));
    expect(b.recommendation).toMatchObject({ eligibility: "CAN_RANK", reasons: ["candidate_priority:PERSONAL"] });
  });

  it("the prompt names all 8 and forbids a fake 1..8 order", () => {
    for (const label of EIGHT_LABELS) expect(b.promptBlock).toContain(`- ${label}:`);
    expect(b.promptBlock).toMatch(/named 8 options[\s\S]*Account for EVERY one/);
    expect(b.promptBlock).toMatch(/not a numbered 1\.\.8 ranking/);
    expect(b.promptBlock).toMatch(/based on what you know so far/);
    // The route cuts a brief over 2600 tokens in the middle (fitTextToTokenBudget): stay under it, and lead with the
    // decision so even a cut brief keeps it.
    const input = { message: `${EIGHT} - rank these for me`, coach: "DANTE" as const, canRetrieve: true };
    const settled = settleBrief(buildIntelligenceBrief(input), input, false, "EMPTY");
    expect(estimateTokenCount(settled.promptBlock)).toBeLessThan(2600);
    expect(settled.promptBlock.indexOf("CANDIDATE DECISION")).toBeLessThan(settled.promptBlock.indexOf("CANONICAL KNOWLEDGE"));
  });

  it("a reply that drops omega-3 fails completeness, is flagged, and is accounted for deterministically", () => {
    const draft = "Based on what I know so far: creatine is the one with strong support. Whey depends on your protein. If your diet is varied, zinc, magnesium and a multivitamin add little. EAA and BCAA are usually redundant.";
    expect(candidateCompleteness(draft, decision(b))).toEqual({ requested: 8, rendered: 7, missing: ["omega 3"] });
    expect(codes(draft, b)).toContain("CANDIDATE_OMITTED");
    const repaired = renderCandidateAnswer(draft, b, "en");
    expect(repaired).toMatch(/\*\*Depends on your situation\*\*\n(?:- .*\n)*- \*\*Omega 3\*\* — .*more worth it if oily fish is rarely eaten/);
    expect(candidateCompleteness(repaired, decision(b)).missing).toEqual([]);
    const final = applyScopedAnswerIntegrity({ draft, question: `${EIGHT} - rank these for me`, brief: b, language: "en" }).reply;
    expect(final).toMatch(/omega 3/i);
    const trace = buildAnswerTrace({ message: `${EIGHT} - rank these for me`, brief: b, violationCodes: [], missing: [], retryCount: 0, reply: final });
    expect(trace).toMatchObject({ candidateTask: "RANK:PERSONAL", candidateCounts: "8/8/8", candidateCompleteness: "PASS" });
  });

  it("omega-3 written as 'fish oil' still counts as rendered (alias), a complete reply adds nothing", () => {
    const full = "If your protein is covered: creatine first; whey only if protein is short; fish oil if you rarely eat fish; zinc, magnesium and a multivitamin only for a restricted diet; EAA and BCAA usually skip.";
    expect(candidateCompleteness(full, decision(b)).missing).toEqual([]);
    // The prose stays as written; the decision block is added beside it, never in place of it.
    expect(renderCandidateAnswer(full, b, "en").startsWith(full)).toBe(true);
    expect(codes(full, b)).not.toContain("CANDIDATE_OMITTED");
  });
});

describe("7/18. normalization respects entity identity", () => {
  it("CoQ10 / coenzyme Q10 collapse to one candidate", () => {
    const b = brief("rank coq10, coenzyme q10 and creatine");
    expect(decision(b).request.candidates.map((c) => c.entity)).toEqual(["CoQ10", "creatine monohydrate"]);
  });

  it("BCAA != EAA, whey != casein, magnesium != ZMA", () => {
    const b = brief("rank whey, casein, magnesium, zma, bcaa and eaa");
    expect(decision(b).request.candidates.map((c) => c.entity)).toEqual(["whey protein", "casein", "magnesium", "ZMA", "BCAA", "EAA"]);
    // A related entity never borrows its parent's priority.
    expect(tierOf(b, "casein")).toBe("NOT_ASSESSED");
    expect(tierOf(b, "zma")).toBe("NOT_ASSESSED");
  });
});

describe("23/21. purchase intent is a purchase decision, not education", () => {
  const message = "im planning on buying some supps right now, maybe from nutricost, but im scared that i might buy some things i dont really need, can u give me some advice";
  const b = brief(message);

  it("BUY × anti-waste over the open baseline, prose words never parsed as candidates", () => {
    expect(decision(b).request).toMatchObject({ task: "BUY", criterion: "PURCHASE", antiWaste: true, candidates: [] });
    expect(b.knowledge.openSupplementRequest).toBe(true);
    expect(tierOf(b, "BCAA")).toBe("LOW_VALUE");
    expect(tierOf(b, "creatine monohydrate")).toBe("HIGH_UTILITY");
    expect(b.missingContext.length).toBeLessThanOrEqual(2);
  });

  it("the prompt optimises for not buying, not for listing products", () => {
    expect(b.promptBlock).toMatch(/PURCHASE DECISION, not education/);
    expect(b.promptBlock).toMatch(/you probably don't need X/);
    expect(b.promptBlock).toMatch(/FOUNDATION: food covers the foundation/);
    expect(b.promptBlock).toMatch(/Never call a product fake food, never treat natural as better by default/);
  });
});

describe("24/25/14/15. whey / EAA / BCAA follow protein state", () => {
  it("adequate protein: none is needed, BCAA never above EAA, reasons cite protein", () => {
    const b = brief("I already hit my protein target every day. rank whey, EAA and BCAA for me");
    expect(b.need.proteinAdequate).toBe("YES");
    expect(decision(b).priorities.map((p) => p.tier)).toEqual(["LOW_VALUE", "LOW_VALUE", "LOW_VALUE"]);
    expect(order(b)).toEqual(["whey", "eaa", "bcaa"]);
    expect(decision(b).priorities.find((p) => p.candidate === "whey")?.reasons).toContain("not_needed:PROTEIN_INTAKE");
    expect(decision(b).priorities.find((p) => p.candidate === "bcaa")?.reasons).toContain("subset_of:EAA:narrower_amino_acid_coverage");
    expect(b.promptBlock).toMatch(/protein adequate: yes/);
  });

  it("low protein: whey rises; BCAA does not become the protein substitute", () => {
    const b = brief("I struggle to get enough protein. rank whey, EAA and BCAA for me");
    expect(b.need.proteinAdequate).toBe("NO");
    expect(order(b)[0]).toBe("whey");
    expect(decision(b).priorities[0].reasons).toContain("depends_on:PROTEIN_INTAKE:applies");
    expect(tierOf(b, "bcaa")).toBe("LOW_VALUE");
    expect(decision(b).priorities.find((p) => p.candidate === "bcaa")?.reasons).toContain("fix_total_protein_first");
    expect(order(b).indexOf("eaa")).toBeLessThan(order(b).indexOf("bcaa"));
  });

  it("a structured list ranking BCAA above EAA is flagged; the reverse and least-necessary order are not", () => {
    const b = brief("rank whey, EAA and BCAA for me");
    expect(codes("Depends on your protein:\n1. Whey\n2. BCAA\n3. EAA", b)).toContain("RANKING_ORDER_UNSUPPORTED");
    expect(codes("Depends on your protein:\n1. Whey\n2. EAA\n3. BCAA", b)).not.toContain("RANKING_ORDER_UNSUPPORTED");
    const least = brief("rank whey, EAA and BCAA by what is least necessary");
    expect(order(least)).toEqual(["bcaa", "eaa", "whey"]);
    expect(codes("If your protein is covered:\n1. BCAA\n2. EAA\n3. Whey", least)).not.toContain("RANKING_ORDER_UNSUPPORTED");
  });
});

describe("26/17/32. micronutrients: adequacy-sensitive, never an invented deficiency", () => {
  const ask = "should i buy zinc, magnesium or a multivitamin";
  it("A. varied diet → low priority; B. unknown → conditional + ask; C. restricted → possible gap", () => {
    const varied = brief(`${ask} if my diet is already varied?`);
    const unknown = brief(`${ask}?`);
    const vegan = brief(`${ask}? im vegan`);
    expect(decision(varied).priorities.map((p) => p.tier)).toEqual(["LOW_VALUE", "LOW_VALUE", "LOW_VALUE"]);
    expect(decision(unknown).priorities.map((p) => p.tier)).toEqual(["CONDITIONAL", "CONDITIONAL", "CONDITIONAL"]);
    expect(decision(vegan).priorities.map((p) => p.tier)).toEqual(["CONDITIONAL", "CONDITIONAL", "CONDITIONAL"]);
    expect(decision(unknown).dependsOnUnknown).toBe(true);
    expect(decision(vegan).dependsOnUnknown).toBe(false);
    expect(unknown.missingContext).toEqual(["DIET_QUALITY"]);
    expect(varied.missingContext).toEqual([]);
    for (const b of [unknown, vegan]) expect(decision(b).priorities.find((p) => p.candidate === "zinc")?.reasons).toContain("do_not_assume_deficiency");
    expect(decision(vegan).priorities.find((p) => p.candidate === "zinc")?.reasons).toContain("possible_intake_gap:DIET_QUALITY");
    expect(decision(varied).request).toMatchObject({ task: "BUY", criterion: "PURCHASE" });
  });

  it("32. 'rank zinc and magnesium for me' with unknown intake: conditional, and an unconditional reply is flagged", () => {
    const b = brief("rank zinc and magnesium for me");
    expect(decision(b).priorities.map((p) => p.tier)).toEqual(["CONDITIONAL", "CONDITIONAL"]);
    expect(codes("1. Zinc\n2. Magnesium", b)).toContain("UNCONDITIONAL_PRIORITY");
    expect(codes("It depends on your diet: if it is varied, neither zinc nor magnesium adds much.", b)).not.toContain("UNCONDITIONAL_PRIORITY");
  });
});

describe("27/18. omega-3 priority follows fish intake", () => {
  it("low / adequate / unknown fish intake give three different decisions", () => {
    const low = brief("I barely eat fish. should omega 3 be high priority for me?");
    const high = brief("I eat salmon 4 times a week. should omega 3 still be high priority?");
    const unknown = brief("should omega 3 be high priority for me?");
    expect(decision(low).priorities[0]).toMatchObject({ tier: "CONDITIONAL", reasons: ["depends_on:FISH_INTAKE:applies"] });
    expect(decision(high).priorities[0]).toMatchObject({ tier: "LOW_VALUE", reasons: ["not_needed:FISH_INTAKE"] });
    expect(decision(unknown).priorities[0]).toMatchObject({ tier: "CONDITIONAL", reasons: ["depends_on:FISH_INTAKE:unknown"] });
    expect(decision(high).request.criterion).toBe("PERSONAL");
    expect(unknown.missingContext).toEqual(["FISH_INTAKE"]);
  });
});

describe("31. correction: the latest verified statement wins", () => {
  it("almost no fish → salmon 4×/week", () => {
    const b = brief("should omega-3 be high priority?", ["I eat almost no fish.", "actually I eat salmon 4 times a week."]);
    expect(b.need.lowFishIntake).toBe("NO");
    expect(tierOf(b, "omega-3 (fish oil)")).toBe("LOW_VALUE");
  });
  it("salmon 4×/week → actually almost no fish", () => {
    const b = brief("should omega-3 be high priority?", ["I eat salmon 4 times a week.", "actually I eat almost no fish now."]);
    expect(b.need.lowFishIntake).toBe("YES");
    expect(tierOf(b, "omega-3 (fish oil)")).toBe("CONDITIONAL");
  });
});

describe("28/8. the criterion decides the order", () => {
  const by = (criterion: string) => brief(`${EIGHT} - rank these ${criterion}`);
  it("hypertrophy, general health, buy-first and least-necessary give different orders and rationale", () => {
    const hypertrophy = by("for hypertrophy");
    const health = by("for general health");
    const buyFirst = by("by what I should buy first");
    const least = by("by what is least necessary");
    expect([hypertrophy, health, buyFirst, least].map((b) => decision(b).request.criterion)).toEqual(["HYPERTROPHY", "GENERAL_HEALTH", "PURCHASE", "LEAST_NECESSARY"]);
    expect(order(hypertrophy)[0]).toBe("creatine");
    expect(tierOf(health, "creatine")).toBe("LOW_VALUE");
    expect(decision(health).priorities.find((p) => p.candidate === "creatine")?.reasons).toContain("criterion:general_health:performance_aid_not_a_health_need");
    expect(decision(hypertrophy).priorities.find((p) => p.candidate === "multivitamin")?.reasons).toContain("criterion:hypertrophy:not_a_direct_lever_unless_intake_is_low");
    expect(order(least)).toEqual([...order(buyFirst)].reverse());
    expect(new Set([hypertrophy, health, least].map((b) => order(b).join()))).toHaveProperty("size", 3);
    expect(least.promptBlock).toMatch(/PURCHASE DECISION/);
  });

  it("an unstated criterion over several options must be asked", () => {
    const b = brief("rank whey, casein and creatine");
    expect(decision(b).request.criterion).toBe("UNSPECIFIED");
    expect(b.promptBlock).toMatch(/CRITERION: nothing says what to rank by/);
    expect(codes("Whey, casein and creatine are all fine if your protein is low.", b)).toContain("RANKING_CRITERION_MISSING");
    expect(codes("Ranking for muscle gain — whey, casein and creatine; if your protein is low, whey first. Is muscle gain your goal?", b)).not.toContain("RANKING_CRITERION_MISSING");
  });
});

describe("29. no fake certainty on an exact 1..N request", () => {
  it("exact order requested but not justified → the prompt refuses false precision; a bare 1..8 list is flagged", () => {
    const b = brief(`give me the exact best order from 1 to 8: ${EIGHT}`);
    expect(decision(b).request).toMatchObject({ exactOrderRequested: true });
    expect(decision(b).request.candidates).toHaveLength(8);
    expect(decision(b).exactOrderJustified).toBe(false);
    expect(b.promptBlock).toMatch(/exact order would be misleading here/);
    const bare = EIGHT_LABELS.map((label, index) => `${index + 1}. ${label}`).join("\n");
    expect(codes(bare, b)).toContain("UNCONDITIONAL_PRIORITY");
  });
});

describe("37. the candidate contract is general (training, food)", () => {
  it("exercises: 3/3 kept, criterion hypertrophy, ranked on coaching practice", () => {
    const b = brief("rank bench press, dumbbell press and dips for chest growth");
    expect(decision(b).request).toMatchObject({ task: "RANK", criterion: "HYPERTROPHY", criterionPhrase: "chest growth" });
    expect(decision(b).request.candidates.map((c) => c.label)).toEqual(["bench press", "dumbbell press", "dips"]);
    expect(decision(b).priorities.every((p) => p.tier === "NOT_ASSESSED")).toBe(true);
    expect(b.promptBlock).toMatch(/named 3 options: bench press, dumbbell press, dips/);
    expect(codes("For chest growth: bench press and dumbbell press both work well.", b)).toEqual(["CANDIDATE_OMITTED"]);
    expect(candidateCompleteness("Bench press, dumbbell presses and a dip all work.", decision(b)).missing).toEqual([]);
  });

  it("foods: 'for pre-workout' is a criterion, never the pre-workout product", () => {
    const b = brief("rank rice, potatoes and oats for pre-workout");
    expect(decision(b).request).toMatchObject({ criterion: "OUTCOME", criterionPhrase: "pre-workout" });
    expect(decision(b).request.candidates.map((c) => c.label)).toEqual(["rice", "potatoes", "oats"]);
    expect(b.knowledge.records.map((r) => r.id)).not.toContain("supplement-caffeine");
    expect(b.knowledge.identityMatches).toEqual([]);
    expect(b.knowledge.requestedOutcome).toMatchObject({ targetClass: "UNSPECIFIED", healthSensitive: false });
    expect(candidateCompleteness("Rice and potato are quick carbs; oats digest slower.", decision(b)).missing).toEqual([]);
  });

  it("a health-sensitive criterion still routes to clarification", () => {
    const b = brief("rank creatine, collagen and omega 3 for my knee pain");
    expect(b.recommendation.eligibility).toBe("NEEDS_CLARIFICATION");
  });
});

describe("38. safety keeps authority over ranking", () => {
  it("creatine, caffeine, anavar, DNP: all acknowledged, PEDs outside scope, the safe items still ranked", () => {
    // H0 cluster B/G: restricted content limits the drug items; it never erases the safe ones (diagnostic E09 erased them).
    const b = brief("rank creatine, caffeine, anavar and DNP");
    expect(decision(b).request.candidates).toHaveLength(4);
    expect(tierOf(b, "anavar")).toBe("OUTSIDE_SCOPE");
    expect(tierOf(b, "dnp")).toBe("OUTSIDE_SCOPE");
    expect(b.posture).toMatchObject({ noDosing: true });
    expect(b.posture.decision).not.toBe("HARD_STOP");
    expect(b.posture.contexts).toContain("HORMONAL_PED");
    expect(b.recommendation.eligibility).toBe("CAN_RANK");
    expect(b.promptBlock).toMatch(/anavar: outside safe coaching scope/);
  });
});

describe("non-decision turns are untouched", () => {
  it.each([
    "should I take creatine?",
    "what sort of exercises should I do for chest",
    "can I skip leg day this week",
    "should I buy new running shoes",
    "what is creatine",
    "compare creatine and beta-alanine",
  ])("%s → no candidate decision", (message) => {
    expect(brief(message).candidates ?? null).toBeNull();
  });
});
