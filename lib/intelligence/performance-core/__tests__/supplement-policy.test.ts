import { describe, expect, it } from "vitest";

import { buildIntelligenceBrief, extractNeedContext, type Coach, type OptionTier } from "..";

const brief = (message: string, extra: { coach?: Coach; prior?: string[]; athlete?: Parameters<typeof buildIntelligenceBrief>[0]["athlete"]; screen?: Parameters<typeof buildIntelligenceBrief>[0]["supplementScreen"]; hard?: boolean } = {}) =>
  buildIntelligenceBrief({ message, coach: extra.coach ?? "DANTE", priorUserMessages: extra.prior, athlete: extra.athlete, supplementScreen: extra.screen, hardSafetyTriggered: extra.hard, canRetrieve: (extra.coach ?? "DANTE") === "DANTE" });
const tier = (b: ReturnType<typeof brief>, topicStart: string): OptionTier | undefined => b.options.find((o) => o.topic.toLowerCase().startsWith(topicStart))?.tier;
const OPEN = "yo what supplements should i take as a 18 years old natural gym rat";

describe("need assessment — what is known about the person", () => {
  it("reads age, diet and context statements without assuming what was not said", () => {
    expect(extractNeedContext({ message: OPEN })).toMatchObject({ ageYears: 18, ageBand: "YOUNG_ADULT", proteinAdequate: "UNKNOWN", lowFishIntake: "UNKNOWN", medication: false });
    expect(extractNeedContext({ message: "do I need BCAA if I already eat enough protein?" }).proteinAdequate).toBe("YES");
    expect(extractNeedContext({ message: "I barely eat fish, should I take omega-3?" }).lowFishIntake).toBe("YES");
    expect(extractNeedContext({ message: "I struggle to hit my protein most days" }).proteinAdequate).toBe("NO");
    expect(extractNeedContext({ message: "I take medication, what supplements should I use?" }).medication).toBe(true);
    expect(extractNeedContext({ message: "I sleep 5 hours and drink 4 energy drinks a day" })).toMatchObject({ poorSleep: "YES", highStimulantUse: "YES" });
    expect(extractNeedContext({ message: "em 16 tuổi nên uống gì" })).toMatchObject({ ageYears: 16, ageBand: "MINOR" });
  });

  it("canonical state outranks what the user says about the same thing", () => {
    expect(extractNeedContext({ message: "I'm 25 and sleep great", athlete: { ageYears: 17, avgSleepHours: 5.4 } })).toMatchObject({ ageYears: 17, ageBand: "MINOR", poorSleep: "YES" });
  });

  it("context stated earlier in the conversation still counts", () => {
    expect(extractNeedContext({ message: "so should I take whey?", priorUserMessages: ["I already eat enough protein from food"] }).proteinAdequate).toBe("YES");
  });
});

describe("open request — never a generic stack", () => {
  const b = brief(OPEN);

  it("derives where each option sits instead of listing a stack", () => {
    expect(tier(b, "creatine")).toBe("HIGH_UTILITY");
    expect(tier(b, "whey")).toBe("CONDITIONAL");
    expect(tier(b, "caffeine")).toBe("CONDITIONAL");
    expect(tier(b, "omega-3")).toBe("CONDITIONAL");
    expect(tier(b, "multivitamin")).toBe("CONDITIONAL");
    expect(tier(b, "vitamin d")).toBe("CONDITIONAL");
    expect(tier(b, "bcaa")).toBe("LOW_VALUE");
  });

  it("explains each placement with a reason token", () => {
    const reasons = Object.fromEntries(b.options.map((o) => [o.topic, o.reasons.join(",")]));
    expect(reasons["BCAA"]).toContain("redundant_with_adequate_complete_protein");
    expect(reasons["whey protein"]).toContain("depends_on:PROTEIN_INTAKE:unknown");
    expect(reasons["omega-3 (fish oil)"]).toContain("depends_on:FISH_INTAKE:unknown");
    expect(reasons["vitamin D"]).toContain("lab_dependent_do_not_assume_deficiency");
    expect(reasons["creatine monohydrate"]).toContain("strong_support_but_optional");
  });

  it("asks only for the context that would change the answer — ONE question, the rest stated as conditions", () => {
    expect(b.missingContext).toEqual(["PROTEIN_INTAKE", "SLEEP_AND_STIMULANT_LOAD"]);
    expect(b.promptBlock).toMatch(/Give the conditional answer first, then ask this as your ONE short question\. State the rest as conditions, not questions:/);
  });

  it("the prompt carries policy and the claims, not a prewritten answer", () => {
    expect(b.promptBlock).toMatch(/decide NEED before USE/);
    expect(b.promptBlock).toMatch(/Nothing in the low-value group may be offered as a default pick/);
    expect(b.promptBlock).toMatch(/Never open with a generic stack list/);
    expect(b.promptBlock).toMatch(/\[ESTABLISHED_GUIDANCE · HIGH · SUPPORTED\] Creatine/);
    expect(b.promptBlock).toMatch(/NOT SUPPORTED\] The claim that dietary BCAAs alone/);
  });
});

describe("young-adult context", () => {
  it("18 changes conservatism without becoming a contraindication", () => {
    const b = brief(OPEN);
    expect(b.posture.contexts).toContain("AGE_CONTEXT");
    expect(b.posture.noDosing).toBe(false);
    expect(tier(b, "creatine")).toBe("HIGH_UTILITY");
    const text = b.posture.directives.join(" ");
    expect(text).toMatch(/young adult, which is context and not a contraindication/);
    expect(text).toMatch(/food, training and sleep first/);
    expect(text).toMatch(/assume no deficiency/);
    expect(text).toMatch(/stimulant load low/);
    expect(text).toMatch(/hormonal or PED-like products as outside natural supplement advice/);
    expect(b.promptBlock).toMatch(/'ask your doctor' line does not replace following them/);
  });

  it("an adult gets no age directive; a minor gets food-first with no ergogenic doses", () => {
    expect(brief("what supplements should a 30 year old lifter take").posture.contexts).not.toContain("AGE_CONTEXT");
    const minor = brief("I'm 15, what supplements should i take");
    expect(minor.posture).toMatchObject({ noDosing: true });
    expect(minor.posture.contexts).toContain("AGE_CONTEXT");
    expect(tier(minor, "creatine")).toBe("CONDITIONAL");
    expect(minor.options.find((o) => o.topic.startsWith("creatine"))!.reasons).toContain("minor_food_first");
  });
});

describe("required reasoning per supplement", () => {
  it("BCAA with adequate protein: low marginal utility, with the reason", () => {
    const b = brief("do I need BCAA if I already eat enough protein?");
    expect(tier(b, "bcaa")).toBe("LOW_VALUE");
    expect(b.need.proteinAdequate).toBe("YES");
    expect(b.missingContext).toEqual([]);
    expect(b.promptBlock).toMatch(/Complete protein from food or a protein supplement already supplies the BCAAs|needs all the essential amino acids/);
  });

  it("whey: a convenient protein source — unnecessary once protein is covered, relevant when it is not", () => {
    expect(tier(brief("whey or food?"), "whey")).toBe("CONDITIONAL");
    const covered = brief("should I buy whey? I already eat enough protein");
    expect(tier(covered, "whey")).toBe("LOW_VALUE");
    expect(covered.options[0].reasons).toContain("not_needed:PROTEIN_INTAKE");
    expect(brief("should I buy whey? I struggle to hit my protein").options[0].reasons).toContain("depends_on:PROTEIN_INTAKE:applies");
  });

  it("EAA is distinguished from BCAA and still contextualised against complete protein", () => {
    const b = brief("are EAAs better than BCAAs?");
    expect(tier(b, "eaa")).toBe("LOW_VALUE");
    expect(b.promptBlock).toMatch(/unlike BCAAs they include every essential amino acid/);
  });

  it("omega-3 follows fish intake and is not a hypertrophy supplement", () => {
    const low = brief("I barely eat fish, should I take omega-3?");
    expect(tier(low, "omega-3")).toBe("CONDITIONAL");
    expect(low.options[0].reasons).toContain("depends_on:FISH_INTAKE:applies");
    expect(low.missingContext).toEqual([]);
    expect(low.promptBlock).toMatch(/may not confer a muscle hypertrophic benefit in young adults/);
    expect(tier(brief("I eat salmon often, do I need fish oil"), "omega-3")).toBe("LOW_VALUE");
  });

  it("multivitamin and vitamin D: adequacy or a lab result decides, deficiency is never assumed", () => {
    const multi = brief("should every lifter take a multivitamin?");
    expect(tier(multi, "multivitamin")).toBe("CONDITIONAL");
    expect(multi.promptBlock).toMatch(/No verified source in this registry shows a multivitamin improves training performance/);
    expect(brief("should I take vitamin D").options[0].reasons).toEqual(["lab_dependent_do_not_assume_deficiency"]);
  });

  it("creatine: strong for specific outcomes, optional, no magic recovery claim", () => {
    const b = brief("is creatine necessary?");
    expect(b.options[0]).toMatchObject({ tier: "HIGH_UTILITY", reasons: ["strong_support_but_optional"] });
    expect(b.promptBlock).toMatch(/optional aid, not a requirement for progress/);
    expect(b.promptBlock).toMatch(/Nothing is mandatory/);
  });

  it("caffeine reasons about sleep and total stimulant load", () => {
    const tired = brief("should I take a pre-workout? I sleep 5 hours and already drink 4 energy drinks");
    expect(tier(tired, "caffeine")).toBe("CONDITIONAL");
    expect(tired.options[0].reasons).toContain("poor_sleep_or_high_stimulant_load");
    expect(tired.posture.contexts).toContain("STIMULANT_RISK");
    expect(tired.posture.directives.join(" ")).toMatch(/Do not add caffeine or a stimulant pre-workout/);
    expect(brief("is caffeine before training worth it?").posture.contexts).not.toContain("STIMULANT_RISK");
  });

  it("beta-alanine and citrulline are outcome-specific with calibrated strength", () => {
    expect(brief("what about beta alanine?").options[0]).toMatchObject({ tier: "CONDITIONAL", reasons: ["outcome_specific_moderate_support"] });
    const cit = brief("what does citrulline actually do?");
    expect(tier(cit, "citrulline")).toBe("LOW_VALUE");
    expect(cit.promptBlock).toMatch(/CONDITIONAL · LIMITED/);
    expect(cit.promptBlock).toMatch(/a small effect/);
  });

  it("electrolytes depend on sweat, duration and environment", () => {
    const b = brief("do electrolytes matter?");
    expect(tier(b, "electrolytes")).toBe("CONDITIONAL");
    expect(b.missingContext).toEqual(["SWEAT_LOSS"]);
    expect(brief("do electrolytes matter? I do 2 hour sessions in the heat").options[0].reasons).toContain("depends_on:SWEAT_LOSS:applies");
  });

  it.each(["collagen", "ashwagandha", "NAC", "HMB"])("%s: mechanism or popularity is not turned into an established benefit", (name) => {
    const b = brief(`should I take ${name}?`);
    expect(b.options[0].tier).toBe("LOW_VALUE");
    expect(b.options[0].reasons).toEqual(["no_established_support_in_registry"]);
  });

  it.each(["magnesium", "taurine", "glucosamine", "CoQ10"])("%s: no verified knowledge → lowered certainty, no dose", (name) => {
    const b = brief(`should I take ${name}?`, { coach: "GEMMA" });
    expect(b.knowledge.state).toBe("KNOWLEDGE_INSUFFICIENT");
    expect(b.posture).toMatchObject({ decision: "DOWNGRADE_CLAIM", noDosing: false });
    expect(b.promptBlock).toMatch(/do not present recalled facts as established/);
  });
});

describe("safety posture — execution logic, graded", () => {
  it("ALLOW for a plain evidence question", () => {
    expect(brief("is creatine necessary?").posture).toMatchObject({ decision: "ALLOW", directives: [], noDosing: false });
  });

  it("CLARIFY for an open request", () => {
    expect(brief("what supplements should i take").posture.decision).toBe("CLARIFY");
  });

  it("DEFER_TO_SPECIALIST with medication: no stack, no dose, and still useful", () => {
    const b = brief("I take medication, what supplements should I use?");
    expect(b.posture).toMatchObject({ decision: "DEFER_TO_SPECIALIST", noDosing: true });
    expect(b.posture.contexts).toContain("MEDICATION_CONTEXT");
    const text = b.posture.directives.join(" ");
    expect(text).toMatch(/Do not recommend a stack or give any dose or timing/);
    expect(text).toMatch(/say WHY/);
    expect(text).toMatch(/Still be useful/);
  });

  it("pregnancy and a stated medical condition defer too", () => {
    expect(brief("I'm pregnant, which supplements should I take").posture).toMatchObject({ decision: "DEFER_TO_SPECIALIST", noDosing: true });
    expect(brief("I have kidney disease, should I take creatine").posture.contexts).toContain("MEDICAL_CONTEXT");
  });

  it("the existing nutrition supplement screen maps onto the posture (no second safety engine)", () => {
    expect(brief("give me a liver protection stack", { screen: "supplement_medical" }).posture).toMatchObject({ decision: "MEDICAL_ESCALATION", noDosing: true });
    expect(brief("does NAC lower liver enzymes", { screen: "supplement_claim" }).posture.contexts).toContain("TREATMENT_CLAIM");
  });

  it("a 'natural test booster' is downgraded, never recommended", () => {
    const b = brief("give me a natural test booster");
    expect(b.posture).toMatchObject({ decision: "DOWNGRADE_CLAIM", noDosing: true });
    expect(b.posture.contexts).toEqual(["HORMONAL_PED"]);
    expect(b.options).toEqual([]);
    expect(b.posture.directives.join(" ")).toMatch(/no verified evidence that any over-the-counter one works/);
  });

  it.each(["should i take sarms", "what prohormones are good", "is a tren cycle worth it", "anabolic steroids for a first cycle"])("PED-like product is outside natural supplement coaching: %s", (message) => {
    const b = brief(message);
    expect(b.posture).toMatchObject({ decision: "HARD_STOP", noDosing: true });
    expect(b.posture.contexts).toContain("HORMONAL_PED");
  });

  it("'anabolic window' and 'collagen peptides' are not PED topics", () => {
    expect(brief("is the anabolic window real?").posture.decision).toBe("ALLOW");
    expect(brief("are collagen peptides worth it?").posture.contexts).not.toContain("HORMONAL_PED");
  });

  it("an active hard-safety turn stays the safety layer's", () => {
    expect(brief("what supplements should i take", { hard: true }).posture.decision).toBe("HARD_STOP");
  });
});

describe("shared evidence, two lenses, clear authority", () => {
  it("Dante and Gemma read the SAME record objects", () => {
    const dante = brief("should I take omega-3?");
    const gemma = brief("should I take omega-3?", { coach: "GEMMA" });
    expect(gemma.knowledge.records.map((r) => r.id)).toEqual(dante.knowledge.records.map((r) => r.id));
    expect(gemma.knowledge.records[0]).toBe(dante.knowledge.records[0]);
    expect(gemma.options).toEqual(dante.options);
  });

  it("each coach leads with its own lens", () => {
    const dante = brief("should I take omega-3?").promptBlock;
    const gemma = brief("should I take omega-3?", { coach: "GEMMA" }).promptBlock;
    expect(dante.indexOf("muscle hypertrophic benefit")).toBeLessThan(dante.indexOf("effective for raising omega-3 levels"));
    expect(gemma.indexOf("effective for raising omega-3 levels")).toBeLessThan(gemma.indexOf("muscle hypertrophic benefit"));
    expect(dante).toMatch(/YOUR LENS \(Dante\): expected training and performance value/);
    expect(gemma).toMatch(/YOUR LENS \(Gemma\): dietary adequacy and food-first alternatives/);
  });

  it("a nutrition topic on Dante, or a training topic on Gemma, is marked as the other coach's", () => {
    expect(brief("how much protein do I need?").otherCoachOwns).toBe(true);
    expect(brief("how much protein do I need?").promptBlock).toMatch(/AUTHORITY: this topic is nutrition, which Gemma owns/);
    expect(brief("how much protein do I need?", { coach: "GEMMA" }).otherCoachOwns).toBe(false);
    expect(brief("how much volume do I actually need?", { coach: "GEMMA" }).otherCoachOwns).toBe(true);
    expect(brief("how much volume do I actually need?").otherCoachOwns).toBe(false);
    expect(brief("is creatine necessary?").otherCoachOwns).toBe(false);
  });
});
