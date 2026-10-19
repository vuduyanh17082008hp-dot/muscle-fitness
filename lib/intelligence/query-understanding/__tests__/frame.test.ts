import { describe, expect, it } from "vitest";

import { decideRetrieval, parseUserQuery, type FrameContext, type HistoryTurn } from "..";

const u = (text: string): HistoryTurn => ({ role: "user", text });
const a = (text: string): HistoryTurn => ({ role: "assistant", text });
const food = (f: ReturnType<typeof parseUserQuery>) => f.entities.find((e) => e.kind === "FOOD");
const qty = (f: ReturnType<typeof parseUserQuery>) => f.entities.find((e) => e.kind === "QUANTITY");
const gemma: FrameContext = { surface: "GEMMA" };
const dante: FrameContext = { surface: "DANTE" };

describe("Gemma single-turn understanding", () => {
  it.each(["cod macros", "macro for cod fish", "give me the macro for cod fish", "macro cá tuyết sao"])("%s → FOOD_MACRO_LOOKUP on cod", (q) => {
    const f = parseUserQuery(q, gemma);
    expect(f.primaryDomain).toBe("NUTRITION");
    expect(f.intent).toBe("FOOD_MACRO_LOOKUP");
    expect(food(f)?.base).toBe("cod");
    expect(f.owner).toBe("GEMMA");
  });

  it("Atlantic cod keeps its variety on the entity but the same generic base", () => {
    const f = parseUserQuery("macros for atlantic cod", gemma);
    expect(food(f)).toMatchObject({ value: "atlantic cod", base: "cod" });
  });

  it("high protein under 500 calories → MEAL_IDEA with ceiling, not a food", () => {
    const f = parseUserQuery("high protein under 500 calories", gemma);
    expect(f.intent).toBe("MEAL_IDEA");
    expect(f.constraints.calories).toBe(500);
    expect(f.constraints.ceilings).toContain("calories");
    expect(f.constraints.preferenceRefs).toContain("high_protein");
    expect(food(f)).toBeUndefined();
  });

  it("same protein but 300 fewer calories → constrained adjustment", () => {
    const f = parseUserQuery("same protein but 300 fewer calories", { ...gemma, history: [u("build me a dinner"), a("Here is chicken and rice")] });
    expect(f.intent).toBe("MEAL_ADJUSTMENT");
    expect(f.constraints.keep).toContain("protein");
    expect(f.constraints.calorieDelta).toBe(-300);
  });

  it("same protein but cheaper", () => {
    const f = parseUserQuery("same protein but cheaper", { ...gemma, history: [u("dinner ideas"), a("Try tofu stir fry")] });
    expect(f.intent).toBe("MEAL_ADJUSTMENT");
    expect(f.constraints.keep).toContain("protein");
    expect(f.constraints.reduce).toContain("cost");
  });

  it("is salmon better than cod for protein → FOOD_COMPARISON", () => {
    const f = parseUserQuery("is salmon better than cod for protein?", gemma);
    expect(f.intent).toBe("FOOD_COMPARISON");
    expect(f.informationNeed).toBe("COMPARISON");
  });

  it("how much protein do I have left → DAILY_REMAINING needing athlete state", () => {
    const f = parseUserQuery("how much protein do I have left?", gemma);
    expect(f.intent).toBe("DAILY_REMAINING");
    expect(decideRetrieval(f).sources).toContain("ATHLETE_STATE");
  });

  it("can i fit mcdonalds tonight → SIMULATION against remaining budget", () => {
    const f = parseUserQuery("can i fit mcdonalds tonight?", gemma);
    expect(f.intent).toBe("SIMULATION");
    expect(f.constraints.time).toBe("TONIGHT");
  });

  it("what should i eat after heavy legs → MEAL_IDEA, training MATERIAL secondary", () => {
    const f = parseUserQuery("what should i eat after heavy legs", gemma);
    expect(f.primaryDomain).toBe("NUTRITION");
    expect(f.intent).toBe("MEAL_IDEA");
    expect(f.secondaryDomains).toContain("TRAINING");
    expect(f.crossCoachRelevance).toBe("MATERIAL");
  });

  it("Vietnamese: tối nay ăn gì để hồi phục / giữ protein nhưng giảm calo", () => {
    const meal = parseUserQuery("tối nay ăn gì để hồi phục", gemma);
    expect(meal.language).toBe("VI");
    expect(meal.intent).toBe("MEAL_IDEA");
    expect(meal.constraints.time).toBe("TONIGHT");
    const adjust = parseUserQuery("giữ protein nhưng giảm calo", { ...gemma, history: [u("tối nay ăn gì"), a("Gà và cơm")] });
    expect(adjust.intent).toBe("MEAL_ADJUSTMENT");
    expect(adjust.constraints.keep).toContain("protein");
    expect(adjust.constraints.reduce).toContain("calories");
  });

  it("mixed-language: 200g cod thì macro bao nhiêu", () => {
    const f = parseUserQuery("200g cod thì macro bao nhiêu", gemma);
    expect(f.language).toBe("MIXED");
    expect(f.intent).toBe("FOOD_MACRO_LOOKUP");
    expect(qty(f)).toMatchObject({ amount: 200, unit: "g" });
  });
});

describe("Gemma follow-up reference resolution", () => {
  const h1: HistoryTurn[] = [u("do u think cod fish is a good source of protien"), a("Yes, cod is a lean, high-protein fish.")];

  it("typos do not break the first turn", () => {
    const f = parseUserQuery("do u think cod fish is a good source of protien", gemma);
    expect(f.primaryDomain).toBe("NUTRITION");
    expect(f.intent).toBe("FOOD_FACT");
    expect(food(f)?.base).toBe("cod");
  });

  it("'give me the macro' resolves cod from the previous turn", () => {
    const f = parseUserQuery("give me the macro", { ...gemma, history: h1 });
    expect(f.intent).toBe("FOOD_MACRO_LOOKUP");
    expect(food(f)).toMatchObject({ base: "cod", origin: "PREVIOUS_TURN" });
    expect(f.references.resolvedFromHistory).toBe(true);
  });

  it("'what about 200g?' → FOLLOWUP_QUANTITY cod 200 g", () => {
    const h2 = [...h1, u("give me the macro"), a("Cod: 105 kcal, 23 g protein per 100 g")];
    const f = parseUserQuery("what about 200g?", { ...gemma, history: h2 });
    expect(f.intent).toBe("FOLLOWUP_QUANTITY");
    expect(food(f)?.base).toBe("cod");
    expect(qty(f)).toMatchObject({ amount: 200, unit: "g" });
  });

  it("'same but Atlantic cod?' keeps the earlier 200 g", () => {
    const h3 = [...h1, u("give me the macro"), a("..."), u("what about 200g?"), a("200 g cod: 210 kcal")];
    const f = parseUserQuery("same but Atlantic cod?", { ...gemma, history: h3 });
    expect(f.intent).toBe("FOOD_MACRO_LOOKUP");
    expect(food(f)?.value).toBe("atlantic cod");
    expect(f.constraints.quantity).toBe(200);
  });

  it("'same but raw?' inherits food AND quantity, adds preparation", () => {
    const h = [u("200g cod"), a("210 kcal")];
    const f = parseUserQuery("same but raw?", { ...gemma, history: h });
    expect(food(f)?.base).toBe("cod");
    expect(f.constraints.quantity).toBe(200);
    expect(f.constraints.preparation).toBe("raw");
  });

  it("'same but grilled?' resolves preparation", () => {
    const f = parseUserQuery("same but grilled?", { ...gemma, history: [u("macros for cod"), a("105 kcal")] });
    expect(f.constraints.preparation).toBe("grilled");
    expect(food(f)?.base).toBe("cod");
  });

  it("Vietnamese '200 g thì sao' resolves cá tuyết from history", () => {
    const f = parseUserQuery("200g thì sao", { ...gemma, history: [u("cá tuyết macro sao"), a("Cá tuyết: 105 kcal / 100g")] });
    expect(f.intent).toBe("FOLLOWUP_QUANTITY");
    expect(food(f)?.base).toBe("cod");
    expect(qty(f)?.amount).toBe(200);
  });

  it("active draft outranks history", () => {
    const f = parseUserQuery("what about 200g?", { ...gemma, activeTask: { foods: ["chicken breast"] }, history: [u("cod macros"), a("...")] });
    expect(food(f)).toMatchObject({ base: "chicken breast", origin: "ACTIVE_TASK" });
  });

  it("does not pull a stale entity from long ago", () => {
    const history: HistoryTurn[] = [u("cod macros"), a("105"), u("hi"), a("hey"), u("how are you"), a("good"), u("sleep ok"), a("nice"), u("ok"), a("ok")];
    const f = parseUserQuery("what about 200g?", { ...gemma, history });
    expect(food(f)).toBeUndefined();
    expect(f.references.unresolvedReferences).toContain("food");
    expect(f.confidenceClass).not.toBe("HIGH_SUPPORT");
  });

  it("current explicit food beats history", () => {
    const f = parseUserQuery("what about 200g salmon?", { ...gemma, history: [u("cod macros"), a("...")] });
    expect(food(f)).toMatchObject({ base: "salmon", origin: "CURRENT_TURN" });
  });
});

describe("Dante understanding", () => {
  it("FACT: what is RPE", () => {
    const f = parseUserQuery("What is RPE?", dante);
    expect(f.intent).toBe("TRAINING_FACT");
    expect(f.informationNeed).toBe("FACT");
    expect(decideRetrieval(f).thinking).toBe("MINIMAL");
  });

  it("EXPLANATION: why is my squat worse today → DEEP", () => {
    const f = parseUserQuery("why is my squat worse today", dante);
    expect(f.owner).toBe("DANTE");
    expect(f.intent).toBe("PERFORMANCE_EXPLANATION");
    expect(f.informationNeed).toBe("EXPLANATION");
    expect(decideRetrieval(f).thinking).toBe("DEEP");
  });

  it("causal question with sleep context is never MINIMAL", () => {
    const f = parseUserQuery("why has my squat been declining despite sleeping more?", dante);
    expect(f.intent).toBe("PERFORMANCE_EXPLANATION");
    expect(decideRetrieval(f).thinking).toBe("DEEP");
  });

  it("CURRENT STATE: how is my recovery", () => {
    const f = parseUserQuery("How is my recovery?", dante);
    expect(f.intent).toBe("CURRENT_STATE");
    expect(decideRetrieval(f).sources).toContain("ATHLETE_STATE");
  });

  it("RECOMMENDATION: should I squat today", () => {
    const f = parseUserQuery("should I squat today?", dante);
    expect(f.intent).toBe("TRAINING_RECOMMENDATION");
    expect(f.constraints.time).toBe("TODAY");
    expect(f.entities.find((e) => e.kind === "EXERCISE")?.value).toBe("squat");
  });

  it("PLAN CHANGE: reduce fatigue but keep intensity", () => {
    const f = parseUserQuery("reduce fatigue but keep intensity", dante);
    expect(f.intent).toBe("TRAINING_PLAN_CHANGE");
    expect(f.constraints.reduce).toContain("fatigue");
    expect(f.constraints.keep).toContain("intensity");
  });

  it("SIMULATION: what about tomorrow instead", () => {
    const f = parseUserQuery("what about tomorrow instead?", { ...dante, history: [u("should I squat today?"), a("Probably a lighter day.")] });
    expect(f.intent).toBe("TRAINING_SIMULATION");
    expect(f.constraints.time).toBe("TOMORROW");
    expect(f.entities.find((e) => e.kind === "EXERCISE")?.value).toBe("squat");
  });

  it("SAFETY: chest hurts during bench is flagged, not coached", () => {
    const f = parseUserQuery("My chest hurts during bench.", dante);
    expect(f.safetySignal).toBe(true);
    expect(f.intent).toBe("SAFETY_SYMPTOM");
    expect(decideRetrieval(f).route).toBe("NO_RETRIEVAL");
  });

  it("performance entity: my bench dropped 10kg", () => {
    const f = parseUserQuery("my bench dropped 10kg", dante);
    expect(f.entities.find((e) => e.kind === "EXERCISE")?.value).toBe("bench_press");
    expect(f.entities.some((e) => e.kind === "PERFORMANCE_CHANGE")).toBe(true);
    expect(f.primaryDomain).toBe("PERFORMANCE");
  });

  it("fatigue idioms: legs are cooked / im cooked after legs yesterday", () => {
    for (const q of ["my legs are cooked", "im cooked after legs yesterday", "legs feel dead after yesterday"]) {
      const f = parseUserQuery(q, dante);
      expect(f.owner).toBe("DANTE");
      expect(f.intent).toBe("FATIGUE_REPORT");
      expect(f.safetySignal).toBe(false);
    }
  });

  it("'should I push 220 today' needs the exercise from context", () => {
    const unresolved = parseUserQuery("should I push 220 today?", dante);
    expect(unresolved.ambiguity.fields).toContain("exercise");
    const resolved = parseUserQuery("should I push 220 today?", { ...dante, history: [u("bench day today"), a("ok")] });
    expect(resolved.entities.find((e) => e.kind === "EXERCISE")?.value).toBe("bench_press");
    const fromState = parseUserQuery("should I push 220 today?", { ...dante, athleteState: { scheduledExercise: "deadlift" } });
    expect(fromState.entities.find((e) => e.kind === "EXERCISE")?.origin).toBe("ATHLETE_STATE");
  });

  it("follow-up chain keeps coherence: weak squat → why? → what should I change? → what if I train tomorrow?", () => {
    const t1 = "My squat feels weak.";
    const f1 = parseUserQuery(t1, dante);
    expect(f1.primaryDomain).toMatch(/PERFORMANCE|TRAINING/);
    const h1 = [u(t1), a("Likely fatigue.")];
    const f2 = parseUserQuery("why?", { ...dante, history: h1 });
    expect(f2.intent).toBe("PERFORMANCE_EXPLANATION");
    expect(f2.entities.find((e) => e.kind === "EXERCISE")?.value).toBe("squat");
    const h2 = [...h1, u("why?"), a("Sleep debt.")];
    const f3 = parseUserQuery("what should I change?", { ...dante, history: h2 });
    expect(f3.owner).toBe("DANTE");
    expect(f3.intent).toBe("TRAINING_PLAN_CHANGE");
    const h3 = [...h2, u("what should I change?"), a("Cut volume.")];
    const f4 = parseUserQuery("what if I train tomorrow?", { ...dante, history: h3 });
    expect(f4.intent).toBe("TRAINING_SIMULATION");
    expect(f4.constraints.time).toBe("TOMORROW");
  });
});

describe("Dante cross-domain", () => {
  it("I only ate 800 calories, should I deadlift heavy → TRAINING primary, NUTRITION MATERIAL, intake not ceiling", () => {
    const f = parseUserQuery("I only ate 800 calories, should I deadlift heavy?", dante);
    expect(f.primaryDomain).toBe("TRAINING");
    expect(f.secondaryDomains).toContain("NUTRITION");
    expect(f.crossCoachRelevance).toBe("MATERIAL");
    expect(f.intent).toBe("CROSS_DOMAIN_DECISION");
    expect(f.constraints.intakeCalories).toBe(800);
    expect(f.constraints.calories).toBeUndefined();
    expect(decideRetrieval(f).thinking).toBe("DEEP");
  });

  it("the live Dante flow sentence", () => {
    const f = parseUserQuery("I only ate 800 calories today and I'm supposed to deadlift heavy tonight. Should I still push the session?", dante);
    expect(f.primaryDomain).toBe("TRAINING");
    expect(f.crossCoachRelevance).toBe("MATERIAL");
    expect(f.deferToGemma).toBe(false);
  });

  it("I've eaten 800 calories and have heavy legs tonight", () => {
    const f = parseUserQuery("I've eaten 800 calories and have heavy legs tonight.", dante);
    expect(["TRAINING", "RECOVERY"]).toContain(f.primaryDomain);
    expect(f.secondaryDomains).toContain("NUTRITION");
    expect(f.crossCoachRelevance).toBe("MATERIAL");
  });

  it("is 200g cod enough after training → Dante may read food facts (SHARED), no Gemma deferral", () => {
    const f = parseUserQuery("is 200g cod enough protein after training?", dante);
    expect(food(f)?.base).toBe("cod");
    expect(qty(f)?.amount).toBe(200);
    expect(f.owner).toBe("SHARED");
    expect(f.deferToGemma).toBe(false);
    expect(f.constraints.time).toBe("AFTER_TRAINING");
    expect(decideRetrieval(f).sources).toContain("USDA");
  });

  it("'build my dinner' on Dante is nutrition-specialist work → deferToGemma", () => {
    const f = parseUserQuery("build my dinner", dante);
    expect(f.deferToGemma).toBe(true);
    expect(f.owner).toBe("GEMMA");
  });

  it("Vietnamese Dante turns", () => {
    const sleep = parseUserQuery("hôm qua ngủ tệ, nay có nên squat nặng ko", dante);
    expect(sleep.owner).toBe("DANTE");
    // A train decision that carries readiness evidence (slept badly) is a readiness question.
    expect(sleep.intent).toBe("READINESS_RECOMMENDATION");
    expect(sleep.constraints.time).toBe("YESTERDAY");
    const tired = parseUserQuery("chân mỏi vl sau hôm qua", dante);
    expect(tired.owner).toBe("DANTE");
    expect(tired.intent).toBe("FATIGUE_REPORT");
    const eat = parseUserQuery("tôi mới ăn có 800 calo, tối deadlift nặng được không", dante);
    expect(eat.constraints.intakeCalories).toBe(800);
    expect(eat.crossCoachRelevance).toBe("MATERIAL");
    expect(eat.owner).toBe("DANTE");
    const cod = parseUserQuery("200g cá tuyết đủ protein sau tập chưa", dante);
    expect(food(cod)?.base).toBe("cod");
    expect(qty(cod)?.amount).toBe(200);
    expect(cod.deferToGemma).toBe(false);
  });
});

describe("typos and language", () => {
  it.each([
    ["how much protien in cod", "NUTRITION"],
    ["calory in 200g cod", "NUTRITION"],
    ["my recoverry is low, should i train", "RECOVERY"],
    ["best excersise for legs", "TRAINING"],
    ["200g cod carbss", "NUTRITION"],
  ])("%s → %s", (q, domain) => {
    const f = parseUserQuery(q, {});
    expect([f.primaryDomain, ...f.secondaryDomains]).toContain(domain);
  });

  it("typo-corrected text is internal; raw text is preserved", () => {
    const f = parseUserQuery("protien in cod", {});
    expect(f.rawText).toBe("protien in cod");
    expect(f.normalizedText).toContain("protein");
  });

  it("slang + shorthand: what should i eat tn", () => {
    const f = parseUserQuery("what should i eat tn", gemma);
    expect(f.intent).toBe("MEAL_IDEA");
    expect(f.constraints.time).toBe("TONIGHT");
  });

  it("slang: im cooked after legs yesterday / why is my squat ass today", () => {
    expect(parseUserQuery("why is my squat ass today", dante).intent).toBe("PERFORMANCE_EXPLANATION");
  });
});

describe("Vietnamese diacritics are never folded into collisions", () => {
  it("ngủ tệ is a sleep statement, not an insult", () => {
    const f = parseUserQuery("hôm qua tôi ngủ tệ", {});
    expect(f.intent).not.toBe("SOCIAL_INSULT");
    expect(f.primaryDomain).toBe("RECOVERY");
  });
  it("ngu thật is an actual insult", () => {
    const f = parseUserQuery("ngu thật", {});
    expect(f.intent).toBe("SOCIAL_INSULT");
    expect(f.primaryDomain).toBe("GLOBAL");
  });
  it("ngủ không đủ giấc vs ngu: accentless 'ngu te' with sleep context stays sleep", () => {
    expect(parseUserQuery("toi ngu te qua", {}).intent).not.toBe("SOCIAL_INSULT");
  });
  it("ngực = chest (muscle), not nguc/ngu collision", () => {
    const f = parseUserQuery("hôm nay tập ngực", {});
    expect(f.entities.find((e) => e.kind === "MUSCLE_GROUP")?.value).toBe("chest");
    expect(f.intent).not.toBe("SOCIAL_INSULT");
  });
  it("mỏi and đói map to recovery / nutrition, not each other", () => {
    expect(parseUserQuery("mỏi quá", {}).primaryDomain).toBe("RECOVERY");
    expect(parseUserQuery("đói quá ăn gì giờ", gemma).primaryDomain).toBe("NUTRITION");
  });
});

describe("negative / non-overinterpretation", () => {
  it("bare 'cod' is not a lookup", () => {
    const f = parseUserQuery("cod", gemma);
    expect(f.intent).toBe("BARE_MENTION");
    expect(f.confidenceClass).toBe("UNRESOLVED");
    expect(decideRetrieval(f).route).toBe("NO_RETRIEVAL");
  });
  it("im dead lol is casual, no safety, no retrieval", () => {
    const f = parseUserQuery("im dead lol", dante);
    expect(f.intent).toBe("CASUAL");
    expect(f.safetySignal).toBe(false);
    expect(decideRetrieval(f).route).toBe("NO_RETRIEVAL");
  });
  it("my workout killed me is figurative", () => {
    const f = parseUserQuery("my workout killed me", dante);
    expect(f.intent).toBe("CASUAL");
    expect(f.safetySignal).toBe(false);
  });
  it("simple lookup never uses DEEP", () => {
    const f = parseUserQuery("protein in 100g cod", gemma);
    expect(decideRetrieval(f, { isLocallyKnown: () => true }).thinking).toBe("MINIMAL");
  });
  it("retrieval: generic known food stays local; specific variety goes to USDA too", () => {
    const generic = parseUserQuery("cod macros", gemma);
    expect(decideRetrieval(generic, { isLocallyKnown: () => true }).route).toBe("LOCAL_RETRIEVAL");
    const specific = parseUserQuery("macros for atlantic cod", gemma);
    expect(decideRetrieval(specific, { isLocallyKnown: () => true }).route).toBe("USDA_RETRIEVAL");
    const unknown = parseUserQuery("salmon macros", gemma);
    expect(decideRetrieval(unknown, { isLocallyKnown: () => false }).route).toBe("USDA_RETRIEVAL");
  });
});
