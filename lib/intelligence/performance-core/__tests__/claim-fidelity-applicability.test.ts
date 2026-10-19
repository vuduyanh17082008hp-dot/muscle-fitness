/**
 * H0 claim fidelity + population applicability + safe continuation (pure). FINAL_MATERIAL_CLAIM_SCOPE must be a subset
 * of SUPPORTED_EVIDENCE_SCOPE; ENTITY_MATCH + OUTCOME_MATCH is not HUMAN_APPLICABILITY; a safe boundary is not a
 * complete answer. Every assertion is on structure (codes, statuses), never on model prose.
 */
import { describe, expect, it } from "vitest";
import {
  buildAnswerTrace, buildIntelligenceBrief, checkOutputIntegrity, enforceIntegrity, integrityCorrectionBrief, knowledgeEvidenceLine,
  retrievedDocumentRelevant, retrievedPopulation, safeContinuationPresent, settleBrief, turnApplicability, type BriefInput,
} from "..";

const input = (message: string): BriefInput => ({ message, coach: "DANTE", canRetrieve: true });
const brief = (message: string) => buildIntelligenceBrief(input(message));
const codes = (reply: string, b: ReturnType<typeof brief>) => checkOutputIntegrity({ reply, brief: b }).map((v) => v.code);
const scope = (reply: string, b: ReturnType<typeof brief>) => checkOutputIntegrity({ reply, brief: b }).filter((v) => v.code === "CLAIM_SCOPE_BROADENED").map((v) => v.detail);

describe("claim fidelity — broadening is detected from the claims, not a phrase list", () => {
  const compare = brief("compare creatine vs beta-alanine for strength");

  it("A. creatine → high-intensity performance; 'creatine builds strength' broadens the outcome", () => {
    expect(scope("Creatine builds strength.", compare)).toEqual(["supplement-creatine|STRENGTH|OUTCOME"]);
    expect(scope("Creatine improves strength gains over time.", compare)).toEqual(["supplement-creatine|STRENGTH|OUTCOME"]);
  });

  it("B. beta-alanine → 1-4 minute efforts; 'increases maximal strength' broadens (its strength claim is MIXED / insufficient)", () => {
    expect(scope("Beta-alanine increases maximal strength.", compare)).toEqual(["supplement-beta-alanine|STRENGTH|OUTCOME"]);
  });

  it("C. protein supports muscle only under its conditions; 'more protein always means more muscle' broadens the condition", () => {
    const protein = brief("how much protein do I need to build muscle?");
    expect(scope("More protein always means more muscle.", protein)).toEqual(["nutrition-protein-adequacy|HYPERTROPHY|CONDITION"]);
    expect(scope("More protein helps build muscle up to about 1.6 g per kg; past that it adds nothing.", protein)).toEqual([]);
  });

  it("D. narrower (or matching) wording is allowed", () => {
    expect(scope("Creatine can help repeated high-intensity performance.", compare)).toEqual([]);
    expect(scope("Beta-alanine may help hard efforts lasting one to four minutes.", compare)).toEqual([]);
    expect(scope("Creatine has stronger evidence for high-intensity performance; that is not the same as proving a strength-gain effect.", compare)).toEqual([]);
    // The claim text itself supports strength for caffeine, and soreness for omega-3 (as a 'may').
    expect(scope("Caffeine can help strength a little before a session.", brief("is caffeine good before lifting?"))).toEqual([]);
    expect(scope("Omega-3 may reduce soreness after hard sessions.", brief("is omega-3 worth it for lifting?"))).toEqual([]);
  });

  it("generalises to training and nutrition records through their own non-supporting claims", () => {
    expect(scope("Training every set to failure builds more muscle.", brief("should I train to failure?"))).toEqual(["training-failure|HYPERTROPHY|OUTCOME"]);
    // A training record that simply does not mention an outcome is not contradicted by it.
    expect(scope("Cardio improves endurance.", brief("will cardio kill my gains?"))).toEqual([]);
  });

  it("retry: the correction names the supported scope and asks to revise only that sentence", () => {
    const fix = integrityCorrectionBrief(checkOutputIntegrity({ reply: "Creatine builds strength.", brief: compare }));
    expect(fix).toMatch(/high-intensity exercise performance/);
    expect(fix).toMatch(/Revise only that sentence/);
  });

  it("deterministic last line: only the broadened sentence is narrowed; sibling comparison content is untouched", () => {
    const draft = "Both are well studied.\n- Creatine builds strength.\n- Beta-alanine helps efforts lasting 1 to 4 minutes.";
    const out = enforceIntegrity(draft, compare, "en");
    expect(out).toContain("Both are well studied.");
    expect(out).toContain("- Beta-alanine helps efforts lasting 1 to 4 minutes.");
    expect(out).not.toMatch(/builds strength/);
    expect(out).toMatch(/- Creatine monohydrate's evidence is for high-intensity exercise performance and training adaptations; that is not the same as an established effect on strength\./);
    expect(scope(out, compare)).toEqual([]);
    expect(enforceIntegrity("Creatine can help repeated high-intensity performance.", compare, "en")).toBe("Creatine can help repeated high-intensity performance.");
  });

  it("trace: claimScopeStatus records the revision", () => {
    const trace = (violationCodes: string[], initialViolationCodes: string[]) =>
      buildAnswerTrace({ message: "compare creatine vs beta-alanine for strength", brief: compare, violationCodes, missing: [], retryCount: 1, initialViolationCodes }).claimScopeStatus;
    expect(trace([], ["CLAIM_SCOPE_BROADENED"])).toBe("NARROWED_ON_REVISION");
    expect(trace(["CLAIM_SCOPE_BROADENED"], ["CLAIM_SCOPE_BROADENED"])).toBe("BROADENS");
    expect(trace([], [])).toBe("MATCHES_OR_NARROWS");
  });
});

describe("population applicability — relevant is not applicable", () => {
  const omega = brief("does omega-3 reduce liver fat?");
  const MOUSE = { title: "Omega-3 fatty acids reduce hepatic steatosis and liver fat in high-fat diet-fed mice", abstract: "C57BL/6 mice were fed... liver fat fell. These results may help patients with NAFLD." };
  const RCT = { title: "Omega-3 supplementation and liver fat in nonalcoholic fatty liver disease: a randomized, placebo-controlled trial", abstract: "Adults with NAFLD were randomized..." };
  const BARE = { title: "Omega-3 and liver fat", abstract: "" };

  it("A. human query + mouse study + outcome match → relevant, but preclinical, never direct human support", () => {
    expect(retrievedDocumentRelevant(omega.knowledge, MOUSE.title, MOUSE.abstract)).toBe(true);
    expect(retrievedPopulation(MOUSE.title, MOUSE.abstract)).toBe("ANIMAL_PRECLINICAL");
    const settled = settleBrief(omega, input("does omega-3 reduce liver fat?"), true, undefined, ["ANIMAL_PRECLINICAL", "ANIMAL_PRECLINICAL"]);
    expect(settled.knowledge.populationApplicability).toBe("PRECLINICAL_ONLY");
    expect(settled.knowledge.coverage).toBe("INDIRECT");
    expect(knowledgeEvidenceLine(settled.knowledge)).toMatch(/preclinical[\s\S]*not evidence of an effect in people/);
    expect(settled.promptBlock).toMatch(/POPULATION: every retrieved study here is preclinical/);
  });

  it("B. human RCT in the relevant population → eligible for direct / condition-specific support", () => {
    expect(retrievedPopulation(RCT.title, RCT.abstract)).toBe("HUMAN_RELEVANT");
    const settled = settleBrief(omega, input("does omega-3 reduce liver fat?"), true, undefined, ["HUMAN_RELEVANT"]);
    expect(settled.knowledge.populationApplicability).toBe("HUMAN_RELEVANT");
    expect(knowledgeEvidenceLine(settled.knowledge)).toBeNull();
  });

  it("C. population metadata absent → UNKNOWN, never guessed; health question gets the stricter line", () => {
    expect(retrievedPopulation(BARE.title, BARE.abstract)).toBe("UNKNOWN");
    const settled = settleBrief(omega, input("does omega-3 reduce liver fat?"), true, undefined, ["UNKNOWN"]);
    expect(settled.knowledge.populationApplicability).toBe("UNKNOWN");
    expect(knowledgeEvidenceLine(settled.knowledge)).toMatch(/could not be determined[\s\S]*do not state an effect in people/);
  });

  it("D. mixed mouse + human retrieval → MIXED: human evidence drives, animal stays background", () => {
    expect(turnApplicability(["ANIMAL_PRECLINICAL", "HUMAN_RELEVANT"])).toBe("MIXED");
    expect(turnApplicability(["HUMAN_RELEVANT", "UNKNOWN"])).toBe("HUMAN_RELEVANT");
    expect(turnApplicability(["ANIMAL_PRECLINICAL", "IN_VITRO"])).toBe("PRECLINICAL_ONLY");
    expect(turnApplicability([])).toBe("NOT_ASSESSED");
    const settled = settleBrief(omega, input("does omega-3 reduce liver fat?"), true, undefined, ["ANIMAL_PRECLINICAL", "HUMAN_RELEVANT"]);
    expect(knowledgeEvidenceLine(settled.knowledge)).toMatch(/Only the human studies can support a statement about people/);
  });

  it("an animal paper's background mention of patients does not make it human; a cell study is IN_VITRO", () => {
    expect(retrievedPopulation("Fish oil and hepatic lipid accumulation", "In rats fed a high-fat diet, fish oil lowered liver triglycerides; NAFLD affects many patients.")).toBe("ANIMAL_PRECLINICAL");
    expect(retrievedPopulation("DHA lowers lipid accumulation in HepG2 cells", "")).toBe("IN_VITRO");
    expect(retrievedPopulation("Omega-3 in NAFLD: evidence from mouse models and a randomized trial in adults", "")).toBe("MIXED");
  });

  it("an explicitly preclinical sentence is background; the same effect stated for people is still an unverified benefit", () => {
    expect(codes("In mice, omega-3 reduced liver fat.", omega)).not.toContain("UNVERIFIED_BENEFIT");
    expect(codes("Omega-3 reduces liver fat.", omega)).toContain("UNVERIFIED_BENEFIT");
    expect(codes("In mice, omega-3 reduced liver fat, so it should help people too.", omega)).toContain("UNVERIFIED_BENEFIT");
  });
});

describe("safe continuation — a safe boundary is not task completion", () => {
  const shoulder = brief("best exercise for shoulder pain");

  it("the pick is bounded and the brief asks for continuation, not a referral", () => {
    expect(shoulder.recommendation.eligibility).toBe("NEEDS_CLARIFICATION");
    expect(shoulder.promptBlock).toMatch(/SAFE CONTINUATION — the boundary limits the pick, not the help/);
  });

  it("boundary-only reply → SAFE_CONTINUATION_MISSING; bounded help + one question → none", () => {
    const boundaryOnly = "I can't recommend a specific exercise for shoulder pain. Please see a physiotherapist. Where exactly does it hurt?";
    expect(codes(boundaryOnly, shoulder)).toContain("SAFE_CONTINUATION_MISSING");
    expect(safeContinuationPresent(boundaryOnly)).toBe(false);
    const useful = [
      "I can't pick one exercise for shoulder pain from that alone, because the right choice depends on what is provoking it.",
      "For now, train around it rather than through it: keep pressing and overhead work in a pain-free range with lighter loads.",
      "Swap any movement that reproduces the pain for one that doesn't, and keep the rest of your session as planned.",
      "Get it assessed soon if it is sharp, keeps you up at night, comes with weakness or numbness, or followed a fall.",
      "Where exactly is the pain, and which movements bring it on?",
    ].join(" ");
    expect(codes(useful, shoulder)).not.toContain("SAFE_CONTINUATION_MISSING");
    expect(codes(useful, shoulder)).not.toContain("RANKING_NOT_ELIGIBLE");
    const trace = (reply: string) => buildAnswerTrace({ message: "best exercise for shoulder pain", brief: shoulder, violationCodes: [], missing: [], retryCount: 0, reply }).safeContinuationStatus;
    expect(trace(useful)).toBe("PRESENT");
    expect(trace(boundaryOnly)).toBe("MISSING");
    expect(buildAnswerTrace({ message: "best exercise for chest growth", brief: brief("best exercise for chest growth"), violationCodes: [], missing: [], retryCount: 0, reply: "x" }).safeContinuationStatus).toBe("NOT_APPLICABLE");
  });

  it("a list of specific exercises from one symptom is a prescription (live failure: 5 named rehab exercises)", () => {
    const listed = "For shoulder pain, here are some exercises:\n1. **Pendulum swings**: let the arm hang.\n2. **Wall angels**: slide your arms.\n3. **Sleeper stretch**: lie on your side.\nStop anything painful. Where does it hurt?";
    expect(checkOutputIntegrity({ reply: listed, brief: shoulder }).filter((v) => v.code === "RANKING_NOT_ELIGIBLE").map((v) => v.detail)).toEqual(["list"]);
    const inline = "Here are some exercises: **Pendulum swings** first. 2. **Wall angels** next. 3. **Band external rotation** after. 4. **Sleeper stretch** last. Where does it hurt?";
    expect(checkOutputIntegrity({ reply: inline, brief: shoulder }).map((v) => v.detail)).toContain("list");
    // An unrestricted pick may still be a list.
    expect(codes(listed, brief("best exercise for chest growth"))).not.toContain("RANKING_NOT_ELIGIBLE");
  });

  it("the correction keeps the boundary and asks for bounded help", () => {
    expect(integrityCorrectionBrief(checkOutputIntegrity({ reply: "Please see a physiotherapist.", brief: shoulder }))).toMatch(/Keep the boundary[\s\S]*train around it/);
  });
});
