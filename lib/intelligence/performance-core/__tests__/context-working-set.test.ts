import { describe, expect, it } from "vitest";
import { activeFacts, buildContextWorkingSet, buildIntelligenceBrief, checkOutputIntegrity, renderContextWorkingSet, type ContextFact } from "@/lib/intelligence/performance-core";

/** H0 cluster A — the bounded context working set: what earlier user turns still mean for this one. */

const ws = (prior: string[], message: string) => buildContextWorkingSet({ priorUserMessages: prior, message });
const active = (prior: string[], message: string) => activeFacts(ws(prior, message));
const find = (facts: ContextFact[], key: string) => facts.find((fact) => fact.key === key);
const brief = (prior: string[], message: string) => buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: prior, canRetrieve: true });

describe("cluster A — current facts persist into the next turn", () => {
  it.each([
    [["I'm on cycle."], "What supplements should I take?", "PED_USE"],
    [["so if im on a cycle , what should i do"], "what supps should i take", "PED_USE"],
    [["mình đang on cycle"], "supp gì", "PED_USE"],
    [["I'm running test and tren"], "anything for liver?", "PED_USE"],
    [["test 500 and tren"], "anything for liver?", "PED_USE"],
    [["I'm pregnant"], "Can I take caffeine?", "PREGNANCY"],
    [["I have a diagnosed torn rotator cuff."], "Give me a chest workout.", "INJURY:shoulder"],
    [["I'm allergic to fish", "what's creatine", "how much sleep do I need", "what about recovery", "what supplements should I take?"], "what about omega 3?", "ALLERGY:fish"],
    [["I have chronic kidney disease"], "can I take creatine", "CONDITION:kidney_disease"],
    [["I have type 1 diabetes"], "what should I eat before training", "CONDITION:type1_diabetes"],
    [["I have high blood pressure"], "is pre-workout ok", "CONDITION:hypertension"],
    [["I take sertraline"], "is St John's wort good for mood", "MEDICATION:ssri"],
    [["I had a concussion last week"], "can I train today?", "CONDITION:concussion"],
    [["my lower back hurts when I deadlift"], "leg day?", "INJURY:lower back"],
    [["tôi bị đau lưng dưới"], "hôm nay tập chân được không", "INJURY:lower back"],
    [["I've been eating 600 calories a day to get lean"], "how much cardio should I add?", "ENERGY_INTAKE"],
    [["I'm vegan"], "protein supplement?", "DIET_PATTERN"],
  ])("%j → %s keeps %s active", (prior, message, key) => {
    const fact = find(active(prior, message), key);
    expect(fact, key).toBeDefined();
    expect(fact!.turnsAgo).toBeGreaterThan(0);
    expect(fact!.status).toBe("ACTIVE");
  });

  it("old is not irrelevant: a safety fact 12 turns back is still active", () => {
    const filler = Array.from({ length: 11 }, (_, i) => `question number ${i} about squats`);
    expect(find(active(["I'm allergic to fish", ...filler], "should I take omega-3?"), "ALLERGY:fish")?.turnsAgo).toBe(12);
  });

  it("ordinary chat is not a fact (EPHEMERAL_CHAT is dropped)", () => {
    expect(active(["what's creatine", "how much sleep do I need", "lol thanks"], "cool")).toEqual([]);
  });

  it("a training cycle, a bulking cycle and a menstrual cycle are not PED use", () => {
    for (const said of ["I'm doing a 12 week training cycle", "I'm on a bulking cycle of training", "my menstrual cycle is irregular"]) {
      expect(find(active([said], "what supps"), "PED_USE"), said).toBeUndefined();
    }
  });

  it("asking ABOUT a medication or condition is not a disclosure", () => {
    expect(find(active(["what is sertraline?"], "ok"), "MEDICATION:ssri")).toBeUndefined();
    expect(active(["what is anavar?"], "and the risks?").some((fact) => fact.kind === "PED_USE")).toBe(false);
  });

  it("'I barely eat fish' is fish intake, never a dangerously-low-intake disclosure", () => {
    expect(find(active(["I barely eat fish"], "omega-3?"), "ENERGY_INTAKE")).toBeUndefined();
  });
});

describe("cluster A — clearing and revision (USER_CORRECTION > PRIOR USER_STATE > INFERENCE)", () => {
  it("PED cessation: current use is invalidated, historical use is preserved", () => {
    const set = ws(["I'm on cycle.", "I stopped three months ago."], "What supplements should I take?");
    const ped = set.facts.filter((fact) => fact.kind === "PED_USE");
    expect(ped.map((fact) => [fact.temporal, fact.status])).toEqual([["CURRENT", "SUPERSEDED"], ["HISTORICAL", "ACTIVE"]]);
  });

  it("a cycle stated as past is historical from the start", () => {
    const fact = find(active(["I did one cycle 2 years ago"], "what supps should i take"), "PED_USE");
    expect(fact?.temporal).toBe("HISTORICAL");
  });

  it("'I'm not on steroids' leaves no PED fact", () => {
    expect(active(["I'm not on steroids"], "what is tren").some((fact) => fact.kind === "PED_USE")).toBe(false);
  });

  it("bodyweight correction: 60 kg is current, 80 kg is superseded, origin is USER_CORRECTION", () => {
    const set = ws(["I weigh 80 kg."], "Actually 60 kg.");
    const weights = set.facts.filter((fact) => fact.key === "BODYWEIGHT");
    expect(weights.map((fact) => [fact.value, fact.status])).toEqual([[80, "SUPERSEDED"], [60, "ACTIVE"]]);
    expect(weights[1].origin).toBe("USER_CORRECTION");
  });

  it("a lifted weight is never read as bodyweight", () => {
    expect(find(active(["I squat 140 kg"], "is that good?"), "BODYWEIGHT")).toBeUndefined();
  });

  it("protein intake correction", () => {
    const fact = find(active(["I eat about 120g protein a day"], "actually 180g"), "PROTEIN_INTAKE");
    expect([fact?.value, fact?.origin]).toEqual([180, "USER_CORRECTION"]);
  });

  it("chest pain retracted as muscle soreness: the symptom is no longer active", () => {
    const set = ws(["I have chest pain."], "I meant my chest muscles are sore after bench, no chest pain.");
    expect(find(activeFacts(set), "SYMPTOM:chest_pain")).toBeUndefined();
    expect(set.facts.find((fact) => fact.key === "SYMPTOM:chest_pain")?.status).toBe("SUPERSEDED");
  });

  it("an injury the user says has healed is no longer active", () => {
    expect(find(active(["my knee hurts when I squat"], "knee is healed now, all good"), "INJURY:knee")).toBeUndefined();
  });

  it("'not pregnant anymore' / gave birth ends the pregnancy fact", () => {
    expect(find(active(["I'm pregnant"], "I gave birth last month"), "PREGNANCY")?.temporal).toBe("HISTORICAL");
    expect(find(active(["I'm pregnant"], "sorry, I'm not pregnant, I meant my sister"), "PREGNANCY")).toBeUndefined();
  });

  it("the same fact restated is refreshed, never duplicated", () => {
    expect(ws(["I'm on cycle", "yeah I'm on cycle"], "ok").facts.filter((fact) => fact.kind === "PED_USE")).toHaveLength(1);
  });
});

describe("cluster A — rendering is bounded and keeps provenance", () => {
  it("the block names user words, the correction, and the superseded value", () => {
    const lines = renderContextWorkingSet(ws(["I weigh 80 kg."], "Actually 60 kg."));
    const text = lines.join("\n");
    expect(text).toMatch(/bodyweight 60 kg \(user CORRECTION/);
    expect(text).toMatch(/NO LONGER CURRENT[\s\S]*bodyweight 80 kg → replaced by: bodyweight 60 kg/);
  });

  it("a fact said in THIS message is listed without quoting the message (no sibling-request leak)", () => {
    const text = renderContextWorkingSet(ws([], "I'm pregnant. Bench nên tăng bao nhiêu kg?")).join("\n");
    expect(text).toMatch(/is pregnant — user, this message$/m);
    expect(text).not.toMatch(/Bench/);
  });

  it("at most 8 safety facts are rendered and each quote is clipped", () => {
    const long = `I have kidney disease and ${"very ".repeat(60)}long story`;
    const lines = renderContextWorkingSet(ws([long, "I'm pregnant", "I take warfarin", "I have asthma", "I have epilepsy", "I'm allergic to eggs", "I'm allergic to soy", "my knee hurts", "my wrist hurts"], "ok"));
    expect(lines.filter((line) => line.startsWith("- ")).length).toBeLessThanOrEqual(12);
    expect(lines.every((line) => line.length < 400)).toBe(true);
  });

  it("a short follow-up carries the previous user message; a full question does not", () => {
    expect(ws(["creatine"], "how much?").followUpOf).toBe("creatine");
    expect(ws(["creatine"], "What is the best rep range for hypertrophy in trained lifters?").followUpOf).toBeNull();
  });
});

describe("cluster A — the brief consumes the working set", () => {
  it("pregnancy from an earlier turn: DEFER_TO_SPECIALIST, listed as known, posture at the head of the brief", () => {
    const b = brief(["I'm pregnant", "can I keep lifting?"], "what supplements?");
    expect(b.posture.decision).toBe("DEFER_TO_SPECIALIST");
    expect(b.posture.contexts).toContain("PREGNANCY");
    expect(b.promptBlock).toMatch(/KNOWN ABOUT THE USER: [^\n]*pregnant/);
    expect(b.promptBlock.indexOf("CONVERSATION CONTEXT")).toBeLessThan(b.promptBlock.indexOf("SAFETY POSTURE"));
    // The personal pick is the midwife's: no product claims or option tiers to list from, an explicit no-list rule instead.
    expect(b.promptBlock).not.toMatch(/CANONICAL KNOWLEDGE|WHERE EACH OPTION SITS/);
    expect(b.promptBlock).toMatch(/OPEN REQUEST UNDER A SAFETY BOUNDARY/);
  });

  it("the safety posture leads a long brief even when no boundary applies", () => {
    const b = brief(["I'm 19"], "what supplements should I take?");
    expect(b.promptBlock.indexOf("SAFETY POSTURE")).toBeLessThan(b.promptBlock.indexOf("CANONICAL KNOWLEDGE"));
  });

  it("a supplement list under a clinician-owned pick is an integrity violation; a single product explanation is not", () => {
    const b = brief(["I'm pregnant"], "what supplements should I take?");
    const list = "1. Creatine monohydrate: strong support. 2. Caffeine: helps performance, check with your doctor. 3. Omega-3 fish oil.";
    expect(checkOutputIntegrity({ reply: list, brief: b }).map((v) => v.code)).toContain("RECOMMENDED_UNDER_BOUNDARY");
    const safe = "While you're pregnant, which supplements to take is your midwife's call — they usually check things like folate and iron. I can help with pregnancy-aware training, or explain a product you want to ask them about.";
    expect(checkOutputIntegrity({ reply: safe, brief: b }).map((v) => v.code)).not.toContain("RECOMMENDED_UNDER_BOUNDARY");
  });

  it("a named product question under a boundary is not an open request: no list rule", () => {
    const b = brief(["I have chronic kidney disease"], "can I take creatine?");
    expect(b.promptBlock).not.toMatch(/OPEN REQUEST UNDER A SAFETY BOUNDARY/);
    expect(b.posture.decision).toBe("DEFER_TO_SPECIALIST");
  });

  it("a fish allergy settles fish intake: Dante never asks how often they eat oily fish", () => {
    const b = brief(["I'm allergic to fish"], "what about omega 3?");
    expect(b.need.lowFishIntake).toBe("YES");
    expect(b.missingContext).not.toContain("FISH_INTAKE");
  });

  it("a diagnosed shoulder injury names chest training as shoulder loading that waits for clearance", () => {
    const text = brief(["I have a torn rotator cuff diagnosed last week"], "give me a chest workout").promptBlock;
    expect(text).toMatch(/chest training included/);
    expect(text).toMatch(/wait for their physio's or doctor's clearance/);
  });

  it("current PED use from an earlier turn reaches the posture of a generic supplement follow-up", () => {
    const b = brief(["so if im on a cycle , what should i do"], "what supps should i take");
    expect(b.posture.contexts).toContain("HORMONAL_PED");
    expect(b.posture.noDosing).toBe(true);
    expect(b.posture.directives.join(" ")).toMatch(/no 'support' or 'on-cycle' supplements/);
  });

  it("the natural control gets no PED context", () => {
    const b = brief(["I'm natural, never touched steroids"], "what supps should i take");
    expect(b.posture.contexts).not.toContain("HORMONAL_PED");
  });

  it("ended PED use is historical: no current-use rule", () => {
    const b = brief(["I'm on cycle.", "I stopped three months ago."], "What supplements should I take?");
    expect(b.posture.directives.join(" ")).toMatch(/not using now/);
    expect(b.posture.directives.join(" ")).not.toMatch(/they are currently using/);
  });

  it("fish allergy → omega-3 follow-up carries the no-fish-oil rule", () => {
    const b = brief(["I'm allergic to fish", "what supplements should I take?"], "what about omega 3?");
    expect(b.posture.contexts).toContain("ALLERGY_CONTEXT");
    expect(b.promptBlock).toMatch(/no fish oil/);
  });

  it("rotator cuff → chest workout carries the injury rule", () => {
    const b = brief(["I have a diagnosed torn rotator cuff."], "Give me a chest workout.");
    expect(b.posture.contexts).toContain("INJURY_CONTEXT");
    expect(b.promptBlock).toMatch(/diagnosed shoulder injury/);
  });

  it.each([
    [["I have chronic kidney disease"], "can I take creatine", /kidney doctor/],
    [["I have type 1 diabetes"], "what should I eat before training", /glucose/],
    [["I have high blood pressure"], "is pre-workout ok", /stimulant pre-workout/],
    [["I take sertraline"], "is St John's wort good for mood", /serotonin-syndrome/],
    [["I take warfarin"], "fish oil ok?", /bleeding risk/],
    [["I had a concussion last week"], "can I train today?", /medically cleared/],
    [["I've been eating 600 calories a day to get lean"], "how much cardio should I add?", /Do not add cardio/],
  ])("%j → %s carries its condition rule", (prior, message, rule) => {
    expect(brief(prior, message).promptBlock).toMatch(rule);
  });

  it("a per-request brief reuses the turn's context (safety facts are the turn's, not one request's)", () => {
    const turn = brief(["I'm pregnant"], "what supplements? and how many sets for chest?");
    const request = buildIntelligenceBrief({ message: "what supplements?", coach: "DANTE", canRetrieve: true, context: turn.context });
    expect(request.posture.contexts).toContain("PREGNANCY");
  });

  it("Gemma reads the same working set", () => {
    const b = buildIntelligenceBrief({ message: "what should I snack on?", coach: "GEMMA", priorUserMessages: ["I'm allergic to peanuts"] });
    expect(b.promptBlock).toMatch(/allergic to peanuts or tree nuts/);
  });
});

describe("cluster A — a retracted symptom ends the persisted safety episode", () => {
  it.each([
    "I meant my chest muscles are sore after bench, no chest pain",
    "sorry, not chest pain, my pecs are just sore",
    "ý tôi là cơ ngực mỏi thôi, không đau ngực",
  ])("%s → resolved evidence → the active episode downgrades", async (text) => {
    const { advanceSafetyPhase, classifySafetyEvidence } = await import("@/lib/dante-core/coherence/safety-evidence");
    expect(classifySafetyEvidence(text)).toBe("resolved");
    expect(advanceSafetyPhase({ current: "ENTER", fresh: false, evidence: classifySafetyEvidence(text) })).toBe("DOWNGRADE");
  });

  it("a retraction next to a fresh red flag does not end the episode", async () => {
    const { advanceSafetyPhase } = await import("@/lib/dante-core/coherence/safety-evidence");
    expect(advanceSafetyPhase({ current: "ENTER", fresh: true, evidence: "resolved" })).toBe("PERSIST");
  });

  it("silence is still not resolution", async () => {
    const { classifySafetyEvidence } = await import("@/lib/dante-core/coherence/safety-evidence");
    expect(classifySafetyEvidence("can I train chest again today?")).toBeNull();
  });
});

describe("cluster A — a diagnosed injury is enforced on the final reply", () => {
  const b = () => brief(["I have a torn rotator cuff diagnosed last week"], "give me a chest workout");
  it("a 'shoulder-friendly' chest workout is still shoulder loading", () => {
    const reply = "Shoulder-friendly chest workout:\n1. Cable fly, 3x12\n2. Incline chest press (light), 3x10\n3. Dumbbell pullover, 3x12";
    const codes = checkOutputIntegrity({ reply, brief: b() });
    expect(codes.find((v) => v.code === "INJURY_SITE_LOADED")?.detail).toMatch(/^shoulder\|/);
  });
  it("saying those movements wait for clearance is not a prescription", () => {
    const reply = "With a diagnosed rotator cuff tear, bench press, push-ups and flyes all load the shoulder, so they wait until your physio clears you. Today you can train legs and core: goblet-free leg press, leg curls, calf raises and dead bugs.";
    expect(checkOutputIntegrity({ reply, brief: b() }).map((v) => v.code)).not.toContain("INJURY_SITE_LOADED");
  });
  it("undiagnosed pain gets the train-around rule but no hard enforcement", () => {
    const reply = "Try light push-ups in a pain-free range.";
    const soft = brief(["my shoulder is a bit achy"], "chest workout?");
    expect(checkOutputIntegrity({ reply, brief: soft }).map((v) => v.code)).not.toContain("INJURY_SITE_LOADED");
  });
});

describe("cluster A — the deterministic last line for a diagnosed injury", () => {
  it("removes loading items with their sub-bullets, renumbers, states the clearance rule once", async () => {
    const { enforceIntegrity } = await import("@/lib/intelligence/performance-core");
    const b = brief(["I have a torn rotator cuff diagnosed last week"], "give me a chest workout");
    const reply = "Shoulder-friendly chest day:\n1. **Cable Fly**:\n - 3 sets of 12\n2. **Isometric Chest Squeeze**:\n - 3 sets of 30 seconds\n3. **Incline Push-up**:\n - 3 sets of 10";
    const out = enforceIntegrity(reply, b, "en");
    expect(out).toMatch(/^With a diagnosed shoulder injury/);
    expect(out).toMatch(/1\. \*\*Isometric Chest Squeeze\*\*:\n - 3 sets of 30 seconds/);
    expect(out).not.toMatch(/Cable Fly|Push-up|3 sets of 12/);
    expect(out.match(/waits until your physio/g)).toHaveLength(1);
  });
  it("leaves a clean reply untouched", async () => {
    const { enforceIntegrity } = await import("@/lib/intelligence/performance-core");
    const b = brief(["I have a torn rotator cuff diagnosed last week"], "give me a chest workout");
    const clean = "Chest pressing, push-ups and flyes all load the shoulder, so they wait for your physio's clearance. Today: leg press, leg curls and dead bugs.";
    expect(enforceIntegrity(clean, b, "en")).toBe(clean);
  });
});

describe("cluster A — removal leaves no dangling intro and names the right clinician", () => {
  it("'Here are some alternatives:' with nothing after it is removed", async () => {
    const { enforceIntegrity } = await import("@/lib/intelligence/performance-core");
    const b = brief(["I have a torn rotator cuff diagnosed last week"], "give me a chest workout");
    const out = enforceIntegrity("Bench and push-ups wait for clearance. Here are some alternatives:\n1. Cable fly 3x12\n2. Pec deck 3x10", b, "en");
    expect(out).not.toMatch(/alternatives:\s*$/);
    expect(out).toMatch(/wait for clearance\.$/);
  });
  it("the boundary names a midwife only for pregnancy", () => {
    expect(brief(["so if im on a cycle , what should i do"], "what supps should i take").promptBlock).not.toMatch(/midwife/);
    expect(brief(["I'm pregnant"], "what supplements?").promptBlock).toMatch(/with their midwife or doctor/);
  });
});

describe("cluster A/D — an active safety fact the answer ignores", () => {
  it("T1D + pre-training food answer with no glucose mention → CONTEXT_FACT_IGNORED, and the last line adds the reminder", async () => {
    const { enforceIntegrity } = await import("@/lib/intelligence/performance-core");
    const b = brief(["I have type 1 diabetes"], "what should I eat before training?");
    const reply = "Have a banana and some toast with honey about 45 minutes before training.";
    expect(checkOutputIntegrity({ reply, brief: b }).map((v) => v.code)).toContain("CONTEXT_FACT_IGNORED");
    expect(enforceIntegrity(reply, b, "en")).toMatch(/check your blood sugar before and after training/);
  });
  it("an answer that addresses it passes untouched", async () => {
    const { enforceIntegrity } = await import("@/lib/intelligence/performance-core");
    const b = brief(["I have type 1 diabetes"], "what should I eat before training?");
    const reply = "Check your glucose first, then have a banana and toast; keep fast carbs on hand.";
    expect(enforceIntegrity(reply, b, "en")).toBe(reply);
  });
  it("an unrelated topic is not forced to mention it", () => {
    const b = brief(["I have type 1 diabetes"], "what does RPE mean?");
    expect(checkOutputIntegrity({ reply: "RPE is a 1–10 effort scale.", brief: b }).map((v) => v.code)).not.toContain("CONTEXT_FACT_IGNORED");
  });
  it("600 kcal disclosure + cardio answer that ignores it → reminder with the user's number", async () => {
    const { enforceIntegrity } = await import("@/lib/intelligence/performance-core");
    const b = brief(["I've been eating 600 calories a day to get lean"], "how much cardio should I add?");
    expect(enforceIntegrity("Add 3 sessions of 30 minutes a week.", b, "en")).toMatch(/At about 600 kcal a day/);
  });
});

describe("cluster E — live-run fixes", () => {
  it("'not my knee, it's my hip' moves the injury", () => {
    const facts = active(["my knee hurts when I squat"], "sorry, not my knee, it's my hip");
    expect(find(facts, "INJURY:knee")).toBeUndefined();
    expect(find(facts, "INJURY:hip")?.label).toMatch(/hip/);
  });
  it("feeling terrible after stopping PEDs is linked to a hormone check", () => {
    const b = brief(["I stopped steroids two months ago", "I feel terrible lately"], "what should I do with training?");
    expect(b.promptBlock).toMatch(/after coming off can be the body's own hormones recovering/);
  });
  it("a self-report about today is a fact; 'the score is wrong' is the user's correction", () => {
    expect(find(active(["I feel recovered today"], "should I train hard?"), "SELF_REPORT")?.label).toMatch(/recovered/);
    expect(find(active([], "that score is wrong, I slept great"), "SELF_REPORT")?.label).toMatch(/does not match/);
  });
});
