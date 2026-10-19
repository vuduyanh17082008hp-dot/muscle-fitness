/**
 * H0 entity resolution: RETRIEVAL_MATCH != IDENTITY_MATCH. Only an alias names an entity; a term that retrieval routes
 * to a parent topic (sibling, symptom, product class, different drug) never inherits the parent's identity.
 */
import { describe, expect, it } from "vitest";

import {
  applyScopedAnswerIntegrity,
  buildAnswerTrace,
  buildIntelligenceBrief,
  KNOWLEDGE_GAPS,
  KNOWLEDGE_RECORDS,
  resolveKnowledge,
  validateRegistry,
} from "..";

const brief = (message: string) => buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true });
const scoped = (draft: string, question: string, language: "en" | "vi" = "en") =>
  applyScopedAnswerIntegrity({ draft, question, brief: brief(question), language });
const topics = (message: string) => (resolveKnowledge({ message, canRetrieve: true }).identityMatches ?? []).map((entity) => entity.topic);
const retrieved = (message: string) => {
  const found = resolveKnowledge({ message, canRetrieve: true });
  return [...found.records, ...found.gaps].map((entity) => entity.topic);
};

const WHEY = /^Whey protein is/;
const MAGNESIUM = /^Magnesium is/;
const DELOAD = /^A deload is/;
const ELECTROLYTES = /^Electrolytes are/;
const MELATONIN = /^Melatonin is/;
const PED_GROUP = /^Prohormones, SARMs and anabolic steroids are/;

describe("negative: a related term never inherits the parent identity", () => {
  it.each([
    ["What is casein?", "casein", /^Casein is the main protein in milk/, WHEY],
    ["What is TRT?", "TRT", /^TRT \(testosterone replacement therapy\) is a prescription hormone therapy/, PED_GROUP],
    ["What is HGH?", "HGH", /^HGH \(human growth hormone, somatropin\) is a hormone/, PED_GROUP],
    ["What is DNP?", "DNP", /^DNP \(2,4-dinitrophenol\) is an industrial chemical/, PED_GROUP],
    ["What is clenbuterol?", "clenbuterol", /^Clenbuterol is a beta-2 agonist drug/, PED_GROUP],
    ["What is ZMA?", "ZMA", /^ZMA is a branded supplement formula/, MAGNESIUM],
    ["What is overtraining?", "overtraining", /^Overtraining \(overtraining syndrome\) is/, DELOAD],
    ["What is overreaching?", "overreaching", /^Overreaching is a temporary drop/, DELOAD],
    ["What is a cramp?", "muscle cramp", /^A muscle cramp is/, ELECTROLYTES],
    ["What is a sleep aid?", "sleep aid", /^Sleep aid is a broad label/, MELATONIN],
  ])("%s → its own identity, not the parent's", (question, topic, own, parent) => {
    const found = resolveKnowledge({ message: question, canRetrieve: true });
    expect(found.entityStatus).toBe("KNOWN");
    expect(found.identityGrounding).toBe("GROUNDED");
    expect(topics(question)).toEqual([topic]);
    const out = scoped("The evidence is limited.", question);
    expect(out.reply).toMatch(own);
    expect(out.reply).not.toMatch(parent);
    expect(out.missing).toEqual([]);
  });

  it("the brief only offers the asked entity's definition", () => {
    const prompt = brief("What is casein?").promptBlock;
    expect(prompt).toMatch(/Casein is the main protein in milk/);
    expect(prompt).not.toMatch(/Whey protein is the protein fraction/);
  });

  it("a model answer that defines the parent instead does not satisfy DEFINE for the asked term", () => {
    const out = scoped("Whey protein is the protein fraction of milk that stays in the liquid when cheese is made.", "What is casein?");
    expect(out.reply).toMatch(/^Casein is the main protein in milk/);
  });

  it("a subtype with no identity of its own is RELATED_TOPIC and gets no neighbour's identity", () => {
    for (const question of ["What is rad140?", "What is tribulus?", "What is chondroitin?", "What is fatigue?"]) {
      const found = resolveKnowledge({ message: question, canRetrieve: true });
      expect(found.entityStatus, question).toBe("RELATED_TOPIC");
      expect(found.identityGrounding, question).toBe("ABSENT");
      expect(found.identityMatches, question).toEqual([]);
      const out = scoped("The evidence is limited.", question);
      expect(out.reply, question).not.toMatch(/ is (?:a|an|the) /);
      expect(out.reply, question).toMatch(/can't confirm what \w+ is/);
      expect(out.reply, question).not.toMatch(/can't confirm what (?:prohormones|testosterone boosters|glucosamine|deload)/i);
    }
    expect(brief("What is rad140?").promptBlock).toMatch(/related context, not the thing asked about/);
  });

  it("bare 'failure' is not training to failure", () => {
    expect(topics("What is heart failure?")).toEqual([]);
    expect(topics("What is training to failure?")).toEqual(["training to failure"]);
  });
});

describe("positive: exact aliases, abbreviations and synonyms share one identity", () => {
  it.each([
    ["CoQ10", "coenzyme Q10", "CoQ10"],
    ["RPE", "rating of perceived exertion", "RIR / RPE"],
    ["RIR", "reps in reserve", "RIR / RPE"],
    ["NAC", "N-acetylcysteine", "NAC (N-acetylcysteine)"],
    ["BCAA", "branched-chain amino acids", "BCAA"],
    ["EAA", "essential amino acids", "EAA"],
    ["whey", "whey protein", "whey protein"],
  ])("%s ↔ %s", (short, long, topic) => {
    expect(topics(`What is ${short}?`)).toEqual([topic]);
    expect(topics(`What is ${long}?`)).toEqual([topic]);
    expect(resolveKnowledge({ message: `What is ${long}?`, canRetrieve: true }).identityGrounding).toBe("GROUNDED");
  });
});

describe("retrieval stays broad, identity stays precise", () => {
  it("casein still retrieves the protein-supplement knowledge", () => {
    expect(retrieved("casein protein")).toContain("whey protein");
    expect(topics("casein protein")).toEqual(["casein"]);
  });

  it("ZMA, cramp, TRT, sleep aid and overtraining still reach their parent topic for retrieval", () => {
    expect(retrieved("What is ZMA?")).toContain("magnesium");
    expect(retrieved("What is a cramp?")).toContain("electrolytes");
    expect(retrieved("What is TRT?")).toContain("prohormones, SARMs and anabolic agents");
    expect(retrieved("What is a sleep aid?")).toContain("melatonin and sleep aids");
    expect(retrieved("What is overtraining?")).toContain("deload and fatigue");
  });

  it("the trace carries identity and retrieval matches separately", () => {
    const trace = buildAnswerTrace({ message: "What is casein?", brief: brief("What is casein?"), violationCodes: [], missing: [], retryCount: 0 });
    expect(trace.identityMatch).toEqual(["casein"]);
    expect(trace.retrievalMatch).toContain("whey protein");
    expect(trace.retrievalMatch).not.toContain("casein");
  });

  it("the registry: every identity has an alias, no alias names two entities", () => {
    expect(validateRegistry()).toEqual([]);
    const related = [...KNOWLEDGE_RECORDS, ...KNOWLEDGE_GAPS].flatMap((entity) => entity.related ?? []);
    expect(related.length).toBeGreaterThanOrEqual(12);
  });
});

describe("multi-intent: identity stays scoped to its own clause", () => {
  it("casein + protein state: casein is defined, the protein-state sentence is untouched", () => {
    const question = "What is casein, and how much protein do I have left?";
    const state = "You have 42 g of protein left today.";
    const out = scoped(state, question);
    expect(out.reply).toMatch(/^Casein is the main protein in milk/);
    expect(out.reply).not.toMatch(WHEY);
    expect(out.reply).toContain(state);
  });

  it("TRT + training today: TRT is defined, the training-state sentence is untouched", () => {
    const question = "What is TRT, and should I train today?";
    const state = "Your readiness score is 72, so a normal session fits today.";
    const out = scoped(state, question);
    expect(out.reply).toMatch(/^TRT \(testosterone replacement therapy\)/);
    expect(out.reply).not.toMatch(PED_GROUP);
    expect(out.reply).toContain("72");
  });
});

describe("Vietnamese: same contract", () => {
  it.each([
    ["Casein là gì?", /^Casein là protein chính trong sữa/, /^Whey protein là/],
    ["TRT là gì?", /^TRT \(testosterone replacement therapy, liệu pháp thay thế testosterone\)/, /^Prohormone, SARM/],
    ["ZMA là gì?", /^ZMA là một công thức/, /^Magie/],
    ["Overtraining là gì?", /^Overtraining \(hội chứng tập luyện quá sức\)/, /^Deload/],
    ["Chuột rút là gì?", /^Chuột rút \(muscle cramp\)/, /^Chất điện giải/],
  ])("%s", (question, own, parent) => {
    const out = scoped("Bằng chứng còn hạn chế.", question, "vi");
    expect(out.reply).toMatch(own);
    expect(out.reply).not.toMatch(parent);
    expect(out.missing).toEqual([]);
  });
});
