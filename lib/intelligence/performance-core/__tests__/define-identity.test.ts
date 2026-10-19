/**
 * H0 P1: DEFINE is answered only by a grounded identity proposition about the target entity.
 * ENTITY_RECOGNIZED != IDENTITY_GROUNDED; KNOWN_IDENTITY != PROVEN_BENEFIT.
 */
import { describe, expect, it } from "vitest";

import { decideDanteLanguage } from "@/lib/dante-language";

import {
  applyScopedAnswerIntegrity,
  buildAnswerTrace,
  buildIntelligenceBrief,
  completeObligations,
  deriveObligations,
  identitySatisfiesDefine,
  KNOWLEDGE_GAPS,
  KNOWLEDGE_RECORDS,
  obligationDisposition,
  resolveKnowledge,
  validateRegistry,
} from "..";

const brief = (message: string) => buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true });
const answered = (reply: string, question: string) => obligationDisposition("DEFINE", reply, brief(question), question) === "ANSWERED";
const scoped = (draft: string, question: string, language: "en" | "vi" = "en") =>
  applyScopedAnswerIntegrity({ draft, question, brief: brief(question), language });

/** Metamorphic set: same contract, only the identity payload changes. */
const KNOWN: Array<[string, RegExp]> = [
  ["CoQ10", /^CoQ10 \(coenzyme Q10.*\) is a fat-soluble compound/],
  ["creatine", /^Creatine is a compound/],
  ["taurine", /^Taurine is a sulfur-containing amino acid/],
  ["TUDCA", /^TUDCA \(tauroursodeoxycholic acid\) is a bile acid/],
  ["NAC", /^NAC \(N-acetylcysteine\) is a modified form of the amino acid cysteine/],
  ["RPE", /^RPE \(rating of perceived exertion\) is a 1-10 scale/],
  ["RIR", /RIR \(reps in reserve\) is the number of reps/],
  ["deload", /^A deload is a planned short period/],
  ["progressive overload", /^Progressive overload is gradually increasing/],
];

const FALSE_PASS = [
  "The evidence is limited.",
  "It is unclear whether it works.",
  "There are not enough studies.",
  "It may help some people.",
  "Ask a doctor.",
  "There is no matching evidence.",
  "The research is mixed.",
];

describe("identity grounding is separate from entity recognition", () => {
  it.each(KNOWN.map(([name]) => name))("%s is KNOWN and GROUNDED", (name) => {
    const found = resolveKnowledge({ message: `What is ${name}?`, canRetrieve: true });
    expect(found.entityStatus).toBe("KNOWN");
    expect(found.identityGrounding).toBe("GROUNDED");
  });

  it("an unknown product is not grounded and keeps its clarification", () => {
    const found = resolveKnowledge({ message: "What is xyzabc supplement?", canRetrieve: true });
    expect(found.entityStatus).toBe("UNKNOWN_ENTITY");
    expect(found.identityGrounding).toBe("ABSENT");
    const out = scoped("Xyzabc is a plant extract that boosts recovery.", "What is xyzabc supplement?");
    expect(out.reply).toMatch(/can't confidently identify "xyzabc"/);
    expect(out.reply).not.toMatch(/plant extract/);
    expect(out.missing).toEqual([]);
  });

  it("a canonical record without an authored identity is PARTIAL, not GROUNDED", () => {
    expect(resolveKnowledge({ message: "What is training volume?", canRetrieve: true }).identityGrounding).toBe("PARTIAL");
  });

  it("the trace carries identity grounding", () => {
    const trace = buildAnswerTrace({ message: "What is CoQ10 exactly?", brief: brief("What is CoQ10 exactly?"), violationCodes: [], missing: [], retryCount: 0 });
    expect(trace.identityGrounding).toBe("GROUNDED");
    expect(trace.questionTypes).toEqual(["DEFINE"]);
  });

  it("every supplement and every gap carries an identity, and each one satisfies DEFINE for its own entity", () => {
    expect(validateRegistry()).toEqual([]);
    const defined = [...KNOWLEDGE_RECORDS, ...KNOWLEDGE_GAPS].flatMap((entity) => [entity, ...(entity.related ?? [])]).filter((entity) => entity.identity);
    expect(defined.length).toBeGreaterThanOrEqual(29);
    for (const entity of defined) {
      const question = `What is ${entity.aliases![0]}?`;
      expect(identitySatisfiesDefine(entity.identity!.en, brief(question)), entity.topic).toBe(true);
      expect(identitySatisfiesDefine(entity.identity!.vi, brief(`${entity.aliases![0]} là gì?`)), `${entity.topic} vi`).toBe(true);
    }
  });

  it("an identity never states a benefit", () => {
    for (const entity of [...KNOWLEDGE_RECORDS, ...KNOWLEDGE_GAPS].flatMap((entity) => [entity, ...(entity.related ?? [])])) {
      if (!entity.identity) continue;
      expect(entity.identity.en, entity.topic).not.toMatch(/\b(?:improves?|boosts?|helps?|protects?|builds? muscle|increases? (?:muscle|strength)|recovery|treats?|prevents?)\b/i);
    }
  });
});

describe("DEFINE completion — false passes closed", () => {
  it("A: 'The evidence is limited.' does not define CoQ10", () => {
    expect(answered("The evidence is limited.", "What is CoQ10 exactly?")).toBe(false);
  });

  it("B: a grounded identity sentence defines CoQ10", () => {
    expect(answered("CoQ10 is a naturally occurring compound involved in cellular energy transfer.", "What is CoQ10 exactly?")).toBe(true);
  });

  it.each(FALSE_PASS)("'%s' is not a definition", (reply) => {
    for (const [name] of KNOWN) expect(answered(reply, `What is ${name}?`)).toBe(false);
  });

  it.each([
    "CoQ10 is popular with older lifters.",
    "CoQ10 is not well studied in athletes.",
    "The evidence for CoQ10 is weak.",
    "Whether CoQ10 helps recovery is unclear.",
    "CoQ10 is a supplement.",
    "CoQ10 is found in many multivitamins.",
    "It is a compound the body makes.",
  ])("an evaluative, locating or unbound sentence is not a definition: %s", (reply) => {
    expect(answered(reply, "What is CoQ10?")).toBe(false);
  });

  it("the live failure: an evidence-only reply gets the grounded identity first, not a registry meta-line", () => {
    const live = "The evidence on CoQ10 for performance is limited and mixed. Talk to a healthcare professional before starting it.";
    const completed = completeObligations(live, "what is CoQ10 exactly", brief("what is CoQ10 exactly"));
    expect(completed.reply).toMatch(/^CoQ10 \(coenzyme Q10/);
    expect(completed.reply).not.toMatch(/project registry/);
    expect(completed.missing).toEqual([]);
  });

  it.each(KNOWN)("C–F metamorphic: '%s' with a non-answer gets its own identity and nothing else changes", (name, identity) => {
    const out = scoped("The evidence is limited.", `What is ${name}?`);
    expect(out.reply).toMatch(identity);
    expect(out.missing).toEqual([]);
    expect(out.reply).not.toMatch(/doctor|pharmacist/i);
    expect(out.reply).not.toMatch(/\b(?:improves?|boosts?|protects?)\b/i);
  });

  it("a model definition that already answers is left alone", () => {
    const own = "Creatine is a compound stored mostly in muscle as phosphocreatine.";
    expect(scoped(own, "What is creatine?").reply).toBe(own);
    expect(scoped("RPE stands for rating of perceived exertion, a 1-10 effort scale.", "What is RPE?").reply).toBe("RPE stands for rating of perceived exertion, a 1-10 effort scale.");
  });
});

describe("fused identity + unsupported benefit", () => {
  it("identity survives, the benefit goes, DEFINE stays satisfied", () => {
    const out = scoped("CoQ10 is a fat-soluble compound the body makes itself and definitely boosts recovery.", "What is CoQ10 exactly?");
    expect(out.reply).toMatch(/CoQ10 is a fat-soluble compound the body makes itself/);
    expect(out.reply).not.toMatch(/definitely boosts recovery/);
    expect(out.missing).toEqual([]);
  });

  it("TUDCA: identity kept, organ benefit removed, no dose added", () => {
    const out = scoped("TUDCA is a bile acid that protects the liver.", "What is TUDCA?");
    expect(out.reply).toMatch(/^TUDCA is a bile acid/);
    expect(out.reply).not.toMatch(/protects/);
    expect(out.reply).not.toMatch(/\d+\s*mg/);
    expect(out.missing).toEqual([]);
  });
});

describe("question classes stay separate", () => {
  it("define, evidence, and both", () => {
    expect(deriveObligations("What is CoQ10?")).toEqual(["DEFINE"]);
    expect(deriveObligations("Does CoQ10 improve recovery?")).toEqual(["ASSESS_EVIDENCE"]);
    expect(deriveObligations("What is CoQ10 and does it improve recovery?")).toEqual(["DEFINE", "ASSESS_EVIDENCE"]);
  });

  it("asking for a pick or a personal value is not a definition request", () => {
    for (const message of ["what is the best supps for my liver", "What is my recovery score?", "What's the best time to take creatine?", "Thực phẩm bổ sung tốt nhất là gì?"]) {
      expect(deriveObligations(message)).not.toContain("DEFINE");
    }
  });

  it("DEFINE + ASSESS_EVIDENCE: identity added and the benefit stays unestablished", () => {
    const out = scoped("The evidence is limited.", "What is CoQ10 and does it improve recovery?");
    expect(out.reply).toMatch(/^CoQ10 \(coenzyme Q10/);
    expect(out.missing).toEqual([]);
  });
});

describe("Vietnamese", () => {
  it.each([
    ["CoQ10 là gì?", /^CoQ10 \(coenzyme Q10, còn gọi là ubiquinone/],
    ["Creatine là gì?", /^Creatine là một hợp chất/],
    ["RPE là gì?", /^RPE \(rating of perceived exertion\) là thang 1-10/],
  ])("%s gets a Vietnamese identity", (question, identity) => {
    expect(deriveObligations(question)).toEqual(["DEFINE"]);
    const out = scoped("Bằng chứng còn hạn chế.", question, "vi");
    expect(out.reply).toMatch(identity);
    expect(out.missing).toEqual([]);
  });

  it("a bare 'X là gì' is answered in Vietnamese, not routed as English", () => {
    for (const message of ["CoQ10 là gì", "Creatine là gì?", "RPE là gì?"]) expect(decideDanteLanguage({ currentMessage: message }).language).toBe("vi");
    expect(decideDanteLanguage({ currentMessage: "What is CoQ10?" }).language).toBe("en");
  });

  it("an arbitrary 'là' sentence is not a definition", () => {
    expect(answered("Bằng chứng về CoQ10 là hạn chế.", "CoQ10 là gì?")).toBe(false);
    expect(answered("Điều quan trọng là hỏi bác sĩ.", "CoQ10 là gì?")).toBe(false);
    expect(answered("CoQ10 là một hợp chất tan trong chất béo.", "CoQ10 là gì?")).toBe(true);
  });
});
