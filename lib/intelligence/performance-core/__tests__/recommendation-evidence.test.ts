/**
 * General recommendation & evidence contract (H0). BEST REQUEST != AUTOMATIC RANKING; CANONICAL SOURCE != RELEVANT SOURCE.
 * Semantic contracts only — outcome, eligibility, scoped claims, claim-linked sources, retrieved-document relevance.
 * No model prose is asserted.
 */
import { describe, expect, it } from "vitest";
import {
  buildAnswerTrace, buildIntelligenceBrief, checkOutputIntegrity, citedCanonicalSources, claimEvidenceScopes, retrievedDocumentRelevant,
  settleBrief, type BriefInput, type IntelligenceBrief,
} from "..";
import { screenSafety } from "@/lib/nutrition/coach/orchestration/safety";

const input = (message: string): BriefInput => ({
  message, coach: "DANTE", canRetrieve: true,
  supplementScreen: ((kind) => (kind === "supplement_claim" || kind === "supplement_medical" || kind === "medication" ? kind : null))(screenSafety(message)?.kind),
});
const brief = (message: string): IntelligenceBrief => buildIntelligenceBrief(input(message));
const recordIds = (b: IntelligenceBrief) => b.knowledge.records.map((record) => record.id);
const claimsOf = (b: IntelligenceBrief, id: string) => b.knowledge.records.find((record) => record.id === id)?.claims ?? [];
const BASELINE_ONLY = ["supplement-whey", "supplement-bcaa", "supplement-multivitamin"];

describe("§28 general recommendation — semantic contracts", () => {
  it("A. best supplement for sleep → outcome resolved, no baseline stack, no winner", () => {
    const b = brief("best supplement for sleep");
    expect(b.knowledge.requestedOutcome).toMatchObject({ phrase: "sleep", targetClass: "SUPPLEMENT", healthSensitive: false });
    expect(b.knowledge.openSupplementRequest).toBe(false);
    expect(recordIds(b)).not.toContain("supplement-creatine");
    for (const id of BASELINE_ONLY) expect(recordIds(b)).not.toContain(id);
    expect(b.recommendation.eligibility).toBe("CAN_EDUCATE");
    expect(b.promptBlock).toMatch(/RECOMMENDATION — nothing here establishes a best option for "sleep"/);
    // The known gap named for this outcome stays in scope as a gap: a benefit asserted for it is caught.
    expect(b.knowledge.gaps.map((gap) => gap.topic)).toContain("melatonin and sleep aids");
    expect(checkOutputIntegrity({ reply: "Melatonin has been shown to improve sleep quality.", brief: b }).map((v) => v.code)).toContain("UNVERIFIED_BENEFIT");
  });

  it("an outcome pick reaching a policy-boundary gap carries its posture (testosterone → booster boundary)", () => {
    const b = brief("best supplement for testosterone");
    expect(b.knowledge.gaps.map((gap) => gap.boundary)).toContain("HORMONAL_BOOSTER");
    expect(b.posture.contexts).toContain("HORMONAL_PED");
    expect(b.posture.noDosing).toBe(true);
  });

  it("B. best supplement for recovery → candidates carry only their recovery claims (performance claim out of scope)", () => {
    const b = brief("best supplement for recovery");
    const creatine = claimsOf(b, "supplement-creatine");
    expect(creatine.map((claim) => claim.outcome)).toEqual(["post-exercise recovery"]);
    expect(b.options.find((option) => option.recordId === "supplement-creatine")?.tier).not.toBe("HIGH_UTILITY");
    expect(b.recommendation.eligibility).toBe("CAN_EDUCATE");
  });

  it("C. best supplement for my liver → health-sensitive, clarification, screened as a clinical outcome", () => {
    for (const message of ["best supplement for my liver", "what is the best supps for my liver", "best supp for liver"]) {
      const b = brief(message);
      expect(b.knowledge.requestedOutcome).toMatchObject({ targetClass: "SUPPLEMENT", healthSensitive: true });
      expect(b.recommendation.eligibility).toBe("NEEDS_CLARIFICATION");
      expect(screenSafety(message)?.kind).toBe("supplement_claim");
      expect(recordIds(b)).not.toContain("supplement-creatine");
    }
  });

  it("D. best exercise for chest growth → coaching-practice pick allowed, no restriction line", () => {
    const b = brief("best exercise for chest growth");
    expect(b.knowledge.requestedOutcome).toMatchObject({ phrase: "chest growth", targetClass: "EXERCISE", healthSensitive: false });
    expect(b.recommendation.eligibility).toBe("CAN_RANK");
    expect(b.promptBlock).not.toMatch(/RECOMMENDATION —/);
  });

  it("E. best exercise for shoulder pain → symptom outcome, no ranking before clarification", () => {
    const b = brief("best exercise for shoulder pain");
    expect(b.knowledge.requestedOutcome).toMatchObject({ targetClass: "EXERCISE", healthSensitive: true });
    expect(b.recommendation.eligibility).toBe("NEEDS_CLARIFICATION");
    expect(b.promptBlock).toMatch(/"shoulder pain" is a health-sensitive outcome/);
  });

  it("F. best food for cholesterol → general food guidance, no single best food, not a clarification wall", () => {
    const b = brief("best food for cholesterol");
    expect(b.recommendation.eligibility).toBe("CAN_EDUCATE");
    expect(b.promptBlock).toMatch(/General food guidance is fine/);
  });

  it("G. best meal for recovery → low-risk nutrition pick, unrestricted", () => {
    const b = brief("best meal for recovery");
    expect(b.recommendation.eligibility).toBe("CAN_RANK");
    expect(b.promptBlock).not.toMatch(/RECOMMENDATION —/);
  });

  it("H. compare creatine vs beta-alanine for strength → named compare keeps both records with all claims", () => {
    const b = brief("compare creatine vs beta-alanine for strength");
    expect(b.recommendation.eligibility).toBe("NOT_REQUESTED");
    expect(recordIds(b)).toEqual(expect.arrayContaining(["supplement-creatine", "supplement-beta-alanine"]));
    expect(claimsOf(b, "supplement-beta-alanine").some((claim) => /strength/.test(claim.outcome) && claim.evidenceStrength === "INSUFFICIENT")).toBe(true);
  });

  it("I. does omega-3 reduce liver fat? → evidence question, not a pick; omega-3's other claims never back it", () => {
    const b = brief("does omega-3 reduce liver fat?");
    expect(b.knowledge.requestedOutcome).toMatchObject({ ask: "EFFECT", phrase: "liver fat", healthSensitive: true });
    expect(b.recommendation.eligibility).toBe("NOT_REQUESTED");
    // No canonical claim covers omega-3 × liver fat: it is a known gap for that pair, so retrieval is selective and
    // the existing benefit enforcement applies; the omega-3 record (hypertrophy, status, soreness) is not in scope.
    expect(recordIds(b)).not.toContain("supplement-omega3");
    expect(b.knowledge.gaps.map((gap) => gap.topic)).toEqual(["omega-3 (fish oil) for liver fat"]);
    expect(b.knowledge.state).toBe("RETRIEVAL_REQUIRED");
    expect(b.posture.decision).toBe("DOWNGRADE_CLAIM");
    expect(citedCanonicalSources(b.knowledge, "Omega-3 has been studied in fatty liver disease.").some((source) => /jager/.test(source.sourceId))).toBe(false);
    expect(checkOutputIntegrity({ reply: "Omega-3 can help reduce liver fat.", brief: b }).map((v) => v.code)).toContain("UNVERIFIED_BENEFIT");
  });

  it("an evidence question keeps the claims that DO cover its outcome, and leaves performance questions whole", () => {
    expect(claimsOf(brief("does creatine help recovery?"), "supplement-creatine").map((claim) => claim.outcome)).toEqual(["post-exercise recovery"]);
    expect(claimsOf(brief("does caffeine improve endurance?"), "supplement-caffeine").map((claim) => claim.outcome)).toEqual(["acute exercise performance"]);
    expect(claimsOf(brief("does creatine help with strength?"), "supplement-creatine")).toHaveLength(4);
    expect(brief("is creatine bad for my kidneys?").knowledge.requestedOutcome).toBeNull();
  });

  it("J. what should I take for better focus? → SUPPLEMENT × focus, nothing in the registry covers it", () => {
    const b = brief("what should I take for better focus?");
    expect(b.knowledge.requestedOutcome).toMatchObject({ phrase: "focus", targetClass: "SUPPLEMENT" });
    expect(b.knowledge.coverage).toBe("NO_MATCH_IN_SEARCHED_CORPUS");
    expect(b.recommendation.eligibility).toBe("CAN_EDUCATE");
  });

  it("a scoped pick is allowed when the outcome's own claims support it (endurance → caffeine)", () => {
    const b = brief("best supplement for endurance");
    expect(b.recommendation).toEqual({ eligibility: "CAN_RANK", reasons: ["supported_for_outcome:caffeine"] });
    expect(b.promptBlock).toMatch(/Pick only on the claims above for that outcome/);
  });

  it("the open baseline question is unchanged, with or without its performance purpose", () => {
    for (const message of ["what supplements should I take", "best supplement for strength", "best supplements for muscle growth"]) {
      const b = brief(message);
      expect(b.knowledge.openSupplementRequest).toBe(true);
      expect(b.posture.decision).toBe("CLARIFY");
      expect(b.recommendation.eligibility).toBe("CAN_RANK");
    }
  });

  it("safety stays deterministic: a PED is outside authority, a hormone outcome waits, a pregnancy defers", () => {
    expect(brief("best steroid cycle for mass").recommendation.eligibility).toBe("OUTSIDE_AUTHORITY");
    expect(brief("best supplement for testosterone").recommendation.eligibility).toBe("NEEDS_CLARIFICATION");
    const pregnant = brief("I'm pregnant, best supplement for sleep?");
    expect(pregnant.posture.decision).toBe("DEFER_TO_SPECIALIST");
    expect(pregnant.recommendation.eligibility).toBe("CAN_EDUCATE");
  });

  it("the trace carries outcome and eligibility", () => {
    const trace = buildAnswerTrace({ message: "best supplement for sleep", brief: brief("best supplement for sleep"), violationCodes: [], missing: [], retryCount: 0 });
    expect(trace.requestedOutcome).toBe("SUPPLEMENT:sleep");
    expect(trace.recommendation).toBe("CAN_EDUCATE");
    expect(buildAnswerTrace({ message: "What is casein?", brief: brief("What is casein?"), violationCodes: [], missing: [], retryCount: 0 }).recommendation).toBe("NOT_REQUESTED");
  });
});

describe("§29 / §31 sources — claim-linked, not dumped", () => {
  it("open request: 10 canonical sources in scope, only those of records the reply discusses are shown (+ background)", () => {
    const b = brief("what supplements should I take");
    expect(citedCanonicalSources(b.knowledge).length).toBeGreaterThanOrEqual(8);
    const shown = citedCanonicalSources(b.knowledge, "Food and sleep first. Creatine is the one well-supported option, and vitamin D depends on a blood test.");
    const ids = shown.map((source) => source.sourceId);
    expect(ids).toContain("kreider-2017-issn-creatine");
    expect(ids.some((id) => /whey|bcaa|omega|multivit|caffeine|guest/.test(id))).toBe(false);
    expect(shown.length).toBeLessThan(citedCanonicalSources(b.knowledge).length);
  });

  it("canonical != relevant: an outcome pick never cites a creatine paper, however the reply is worded", () => {
    const b = brief("best supplement for sleep");
    const shown = citedCanonicalSources(b.knowledge, "Creatine is popular, but no supplement here is established for sleep.");
    expect(shown.some((source) => /creatine|kreider|antonio/.test(source.sourceId))).toBe(false);
  });

  it("principles are BACKGROUND, the asked entity DIRECT; a non-candidate topic on an outcome pick is BACKGROUND", () => {
    const scopes = claimEvidenceScopes(brief("is creatine good for strength").knowledge);
    expect(scopes.filter((scope) => scope.recordId === "supplement-creatine").every((scope) => scope.support === "DIRECT")).toBe(true);
    expect(scopes.filter((scope) => scope.recordId === "supplement-principles").every((scope) => scope.support === "BACKGROUND")).toBe(true);
    for (const scope of scopes) expect(scope.sourceIds.length + (scope.conclusion === "UNKNOWN" ? 1 : 0)).toBeGreaterThan(0);
    const sleep = claimEvidenceScopes(brief("best supplement for sleep").knowledge);
    expect(sleep.filter((scope) => scope.recordId === "training-recovery-sleep").every((scope) => scope.support === "BACKGROUND")).toBe(true);
    expect(sleep.filter((scope) => scope.recordId === "supplement-ashwagandha").every((scope) => scope.support === "DIRECT")).toBe(true);
  });

  it("retrieved documents: relevant / irrelevant / not assessable", () => {
    const gap = brief("What does TUDCA do?").knowledge;
    expect(retrievedDocumentRelevant(gap, "Tauroursodeoxycholic acid (TUDCA) in cholestatic liver disease")).toBe(true);
    expect(retrievedDocumentRelevant(gap, "Creatine supplementation and sprint performance")).toBe(false);
    expect(retrievedDocumentRelevant(brief("best food for cholesterol").knowledge, "Soluble fibre and LDL cholesterol")).toBe(true);
    expect(retrievedDocumentRelevant(brief("best food for cholesterol").knowledge, "Protein timing in athletes")).toBe(false);
    // Live-smoke shapes: an outcome word only somewhere in an abstract is not enough.
    const chest = brief("best exercise for chest growth").knowledge;
    expect(retrievedDocumentRelevant(chest, "Pulmonary arterial enlargement predicts long-term survival in COPD patients.", "chest CT ... growth")).toBe(false);
    expect(retrievedDocumentRelevant(chest, "Physical fitness and anthropometrical profile of judo athletes", "chest circumference")).toBe(false);
    const omega = brief("does omega-3 reduce liver fat?").knowledge;
    expect(retrievedDocumentRelevant(omega, "Omega-3 fatty acids for nonalcoholic fatty liver disease: a meta-analysis", "liver fat content fell")).toBe(true);
    expect(retrievedDocumentRelevant(omega, "Omega-3 and muscle soreness", "")).toBe(false);
    expect(retrievedDocumentRelevant(brief("hello there").knowledge, "Anything")).toBeNull();
  });

  it("retrieval executed != relevant evidence found: irrelevant hits settle like an empty search, failure stays FAILED", () => {
    const tudca = input("What does TUDCA do?");
    const base = buildIntelligenceBrief(tudca);
    const irrelevant = settleBrief(base, tudca, false, "IRRELEVANT").knowledge;
    expect(irrelevant.retrievalStatus).toBe("SUCCESS");
    expect(irrelevant.coverage).toBe("NO_MATCH_IN_SEARCHED_CORPUS");
    expect(irrelevant.retrievalReasons).toContain("retrieval_no_relevant_hits");
    const failed = settleBrief(base, tudca, false, "FAILED").knowledge;
    expect(failed.retrievalStatus).toBe("FAILED");
    expect(failed.coverage).toBe("NOT_ASSESSED");
    const relevant = settleBrief(base, tudca, true, "EMPTY").knowledge;
    expect(relevant.coverage).toBe("INDIRECT");
  });
});

describe("§30 claim scope / §32 no premature ranking — verifier", () => {
  it("a named winner on a CAN_EDUCATE pick is a violation; describing candidates with limits is not", () => {
    const b = brief("best supplement for recovery");
    expect(checkOutputIntegrity({ reply: "Creatine is the best supplement for recovery.", brief: b }).map((v) => v.code)).toContain("RANKING_NOT_ELIGIBLE");
    expect(checkOutputIntegrity({ reply: "Creatine may help recovery, but that is not established; vitamin D's effect is mixed.", brief: b }).map((v) => v.code)).not.toContain("RANKING_NOT_ELIGIBLE");
  });

  it("a health-sensitive pick must end on the deciding question, and must not rank", () => {
    const b = brief("best supplement for testosterone");
    const codes = (reply: string) => checkOutputIntegrity({ reply, brief: b }).filter((v) => v.code === "RANKING_NOT_ELIGIBLE").map((v) => v.detail);
    expect(codes("My top pick is ashwagandha.")).toEqual(expect.arrayContaining(["testosterone", "question"]));
    expect(codes("No supplement is established for that here. Is this about symptoms or a blood test result?")).toEqual([]);
  });

  it("a performance claim never becomes a health pick: liver scope holds only the claim that names the liver", () => {
    const b = brief("best supplement for my liver");
    const claims = b.knowledge.records.filter((record) => record.supplement).flatMap((record) => record.claims);
    expect(claims.every((claim) => /liver/.test(claim.outcome))).toBe(true);
    expect(claims.every((claim) => claim.claimType === "UNKNOWN")).toBe(true);
  });

  it("a clear low-risk performance pick is not blocked", () => {
    const b = brief("best exercise for chest hypertrophy");
    expect(checkOutputIntegrity({ reply: "The best exercise for chest hypertrophy is usually a press you can load and progress, like the bench press.", brief: b }).map((v) => v.code)).not.toContain("RANKING_NOT_ELIGIBLE");
  });
});

describe("§33 DEFINE / entity fixes are untouched by the recommendation layer", () => {
  it.each([
    ["What is CoQ10 exactly?", "GROUNDED"],
    ["What is casein?", "GROUNDED"],
    ["what is TRT", "GROUNDED"],
    ["what is ZMA", "GROUNDED"],
    ["what is overtraining", "GROUNDED"],
  ])("%s → identity %s, no recommendation", (message, grounding) => {
    const b = brief(message);
    expect(b.knowledge.identityGrounding).toBe(grounding);
    expect(b.recommendation.eligibility).toBe("NOT_REQUESTED");
    expect(b.knowledge.requestedOutcome).toBeNull();
  });

  it("unknown entity stays UNKNOWN_ENTITY", () => {
    expect(brief("what is zorbex supplement?").knowledge.entityStatus).toBe("UNKNOWN_ENTITY");
  });
});
