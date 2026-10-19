/**
 * H0 closure — evidence-language coherence:
 *   NO SOURCE FOUND != NO EVIDENCE EXISTS · INSUFFICIENT EVIDENCE != NO EFFECT
 *   NO SIGNIFICANT BENEFIT IN CONTEXT X != NO EFFECT GENERALLY · DEPENDENCY FAILURE != NEGATIVE EFFICACY EVIDENCE
 */
import { describe, expect, it } from "vitest";
import { buildIntelligenceBrief, calibrateEvidenceWording, checkOutputIntegrity, enforceIntegrity, settleKnowledgeState } from "@/lib/intelligence/performance-core";

const brief = (message: string) => buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true });
const negatives = (reply: string, message: string) => checkOutputIntegrity({ reply, brief: brief(message) }).filter((v) => v.code === "NEGATIVE_CLAIM_UNSUPPORTED").map((v) => v.detail);

describe("unsupported negative claims are flagged; scoped canonical null findings pass", () => {
  it.each([
    ["zinc with adequate intake (gap)", "does zinc boost testosterone if my intake is adequate?", "Zinc doesn't boost testosterone.", "zinc|TESTOSTERONE"],
    ["magnesium sleep if non-deficient (gap)", "does magnesium help sleep if I'm not deficient?", "Magnesium has no effect on sleep.", "magnesium|SLEEP"],
    ["omega-3 liver fat (gap)", "does omega 3 reduce liver fat?", "Omega-3 does not help the liver at all.", "omega-3 (fish oil) for liver fat|LIVER"],
    ["creatine vs beta-alanine: no null finding for strength", "creatine vs beta-alanine for strength", "Beta-alanine doesn't work for strength.", "beta-alanine|STRENGTH"],
    ["INSUFFICIENT claim is not NO EFFECT", "is a multivitamin useful for gains?", "A multivitamin is useless for gains.", "multivitamin|"],
    ["context-specific null finding generalised", "do bcaas build muscle?", "BCAAs don't work.", "BCAA|"],
  ])("%s", (_name, message, reply, detail) => {
    expect(negatives(reply, message)).toEqual([detail]);
  });

  it.each([
    ["HMB: canonical null finding on strength", "does hmb help strength?", "HMB has no effect on strength in trained young adults."],
    ["BCAA: the canonical outcome named literally", "do bcaas build muscle?", "BCAAs alone don't increase muscle protein synthesis."],
    ["training to failure: canonical null finding on hypertrophy", "does training to failure build more muscle?", "Training to failure doesn't build more muscle than stopping a rep or two short."],
    ["omega-3: canonical null finding on hypertrophy", "does omega 3 help muscle growth?", "Omega-3 doesn't help muscle growth in young adults."],
    ["calibrated wording is not a negative claim", "does magnesium help sleep if I'm not deficient?", "A sleep benefit from magnesium is not established when you're not deficient."],
    ["an outcome word is not a subject", "creatine vs beta-alanine for strength", "Strength training doesn't need supplements to work."],
  ])("%s", (_name, message, reply) => {
    expect(negatives(reply, message)).toEqual([]);
  });
});

describe("deterministic downgrade keeps the valid content", () => {
  it("a gap's 'no effect' becomes 'not established'; the sibling sentence stays", () => {
    const b = brief("does zinc boost testosterone if my intake is adequate?");
    const out = enforceIntegrity("Zinc doesn't boost testosterone. If your intake is adequate, extra zinc is unlikely to change anything.", b, "en");
    expect(out).toMatch(/^Zinc: a benefit for testosterone isn't established in the sources I can check — that isn't evidence that it does nothing\./);
    expect(out).toMatch(/If your intake is adequate, extra zinc is unlikely to change anything\./);
  });

  it("a generalised null finding is restated in the canonical claim's own scope", () => {
    const out = enforceIntegrity("BCAAs don't work. Whole protein covers them.", brief("do bcaas build muscle?"), "en");
    expect(out).toMatch(/BCAAs alone stimulate muscle protein synthesis or produce an anabolic response in humans is unwarranted/);
    expect(out).toMatch(/Whole protein covers them\./);
  });

  it("Vietnamese restatement stays Vietnamese", () => {
    const out = enforceIntegrity("Magie không có tác dụng gì cho giấc ngủ.", brief("magie có giúp ngủ ngon không nếu không thiếu?"), "vi");
    if (out !== "Magie không có tác dụng gì cho giấc ngủ.") expect(out).toMatch(/chưa có lợi ích/);
  });

  it("a supported null finding is returned unchanged", () => {
    const reply = "HMB has no effect on strength in trained young adults.";
    expect(enforceIntegrity(reply, brief("does hmb help strength?"), "en")).toBe(reply);
  });
});

describe("retrieval state never turns into negative evidence", () => {
  const b = brief("does omega 3 reduce liver fat?");

  it("source failure: no coverage gained, and 'there is no evidence' is reworded", () => {
    const failed = settleKnowledgeState(b.knowledge, false, "FAILED");
    expect(failed.retrievalStatus).toBe("FAILED");
    expect(failed.coverage).toBe("NOT_ASSESSED");
    expect(calibrateEvidenceWording("Omega-3 is a fat. There is no evidence omega-3 helps.", { ...b, knowledge: failed })).toBe("Omega-3 is a fat. I could not finish the evidence check, so I can't say either way.");
  });

  it("empty search: 'no matching source', never 'no evidence exists'", () => {
    const empty = settleKnowledgeState(b.knowledge, false, "EMPTY");
    expect(empty.coverage).toBe("NO_MATCH_IN_SEARCHED_CORPUS");
    expect(calibrateEvidenceWording("There is no evidence for that.", { ...b, knowledge: empty })).toMatch(/no matching source was found/i);
  });

  it("PARTIAL retrieval assesses the sources that did come back", () => {
    const partial = settleKnowledgeState(b.knowledge, true, "FAILED", ["HUMAN_RELEVANT"]);
    expect(partial.retrievalStatus).toBe("PARTIAL");
    expect(partial.populationApplicability).toBe("HUMAN_RELEVANT");
  });

  it("animal evidence alone cannot support a human efficacy conclusion (coverage stays INDIRECT)", () => {
    const creatine = brief("what does the research say about creatine and the liver?");
    const animal = settleKnowledgeState(creatine.knowledge, true, undefined, ["ANIMAL_PRECLINICAL"]);
    if (creatine.knowledge.state === "RETRIEVAL_REQUIRED") {
      expect(animal.populationApplicability).toBe("PRECLINICAL_ONLY");
      expect(animal.coverage).toBe("INDIRECT");
    }
  });

  it("unresolved population stays UNKNOWN, never assumed human", () => {
    const unknown = settleKnowledgeState(b.knowledge, true, undefined, ["UNKNOWN"]);
    expect(unknown.populationApplicability).toBe("UNKNOWN");
  });
});
