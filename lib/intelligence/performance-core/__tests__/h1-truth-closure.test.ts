import { describe, expect, it } from "vitest";
import { resolveBodyWeight, withCurrentWeightTargets, withUserStatedWeight } from "@/lib/athlete-state/resolve-body-weight";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { guardMutationClaims } from "@/lib/dante-core/tools/action-response-guard";
import { isAgentToolIntent } from "@/lib/dante-core/tools/detect-intent";
import { buildNutritionPlan, type NutritionInput } from "@/lib/nutrition/plan";
import { activeFacts, buildContextWorkingSet, buildIntelligenceBrief, checkOutputIntegrity, enforceIntegrity, enforceSafetyConstraints } from "..";

// H1 truth closure: a user-stated safety fact → working set → decision constraint enforced after the model, not only in the prompt.
const facts = (prior: string[], message: string) => buildContextWorkingSet({ priorUserMessages: prior, message }).facts;
const active = (prior: string[], message: string) => activeFacts(buildContextWorkingSet({ priorUserMessages: prior, message }));
const brief = (prior: string[], message: string) => buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: prior, canRetrieve: true });
const codes = (prior: string[], message: string, reply: string) => checkOutputIntegrity({ reply, brief: brief(prior, message) }).map((v) => v.code);
const enforce = (prior: string[], message: string, reply: string, language: "en" | "vi" = "en") => enforceIntegrity(reply, brief(prior, message), language);
const filler = ["what's a good warm-up?", "how long should I rest between sets?", "is walking good cardio?", "how much sleep do I need?", "what is RPE?", "should I stretch after?"];

const FISH = "I get hives after eating finfish, and my doctor told me to avoid it.";
const CUFF = "My physio diagnosed a rotator-cuff tear and told me to avoid painful overhead loading.";
const LOW = "Yesterday I ate around 650 calories because I was trying to cut quickly.";
const FISH_OIL_REPLY = "Omega-3s matter for general health. If you don't eat fish often, fish-oil capsules could be a practical choice for you.";
const TRICEPS_REPLY = "Overhead triceps extensions can be a sensible choice for today's push session. Keep your elbows tucked.";
const CARDIO_REPLY = "Given that you walk to class, it would be reasonable to do extra cardio after class if you feel up to it.";

describe("H1 fact extraction (first bad stage of the audit cases)", () => {
  it.each([
    [[FISH], "ALLERGY:fish"],
    [["I'm allergic to fish."], "ALLERGY:fish"],
    [["tôi bị dị ứng cá"], "ALLERGY:fish"],
    [["peanuts make me break out in hives"], "ALLERGY:peanuts or tree nuts"],
    [["I'm lactose intolerant"], "ALLERGY:dairy or lactose"],
    [["my allergist told me to avoid eggs"], "ALLERGY:eggs"],
    [[CUFF], "INJURY:shoulder"],
    [[LOW], "ENERGY_INTAKE"],
    [["hôm qua mình chỉ ăn 650 calo"], "ENERGY_INTAKE"],
  ])("%j → %s", (prior, key) => {
    expect(active(prior, "ok").some((fact) => fact.key === key)).toBe(true);
  });

  it.each([
    ["My friend has a fish allergy."],
    ["What is a fish allergy like?"],
    ["My mum tore her rotator cuff last year."],
    ["My brother is allergic to peanuts and he gets hives."],
  ])("someone else's fact or a general question is not the user's: %s", (message) => {
    expect(active([message], "ok").filter((fact) => fact.kind === "ALLERGY" || fact.kind === "INJURY")).toEqual([]);
  });

  it.each([
    ["My friend says I'm allergic to fish, and the allergist confirmed it.", "ALLERGY:fish"],
    ["My allergist told me to avoid eggs.", "ALLERGY:eggs"],
    ["Fish allergy here — what can I eat?", "ALLERGY:fish"],
    ["I tore my rotator cuff, my doctor says no overhead work.", "INJURY:shoulder"],
  ])("the user's own fact still counts beside another person: %s", (message, key) => {
    expect(active([message], "ok").some((fact) => fact.key === key)).toBe(true);
  });

  it("keeps the clinician's restriction on the injury fact", () => {
    expect(active([CUFF], "ok").find((fact) => fact.key === "INJURY:shoulder")?.label).toMatch(/diagnosed.*clinician restriction: .*overhead/);
  });

  it("does not invent allergies or intakes", () => {
    expect(active(["I'm allergic to fish, tell me what to do"], "ok").map((fact) => fact.key)).not.toContain("ALLERGY:sesame");
    expect(active(["I had an 800 calorie lunch"], "ok").some((fact) => fact.key === "ENERGY_INTAKE")).toBe(false);
    expect(active(["I barely eat fish"], "omega-3?").some((fact) => fact.kind === "ALLERGY")).toBe(false);
    expect(active(["I got a rash from the gym mat"], "ok").some((fact) => fact.kind === "ALLERGY")).toBe(false);
  });
});

describe("H1-LM extraction: reaction / clinician shorthand / single-day intake", () => {
  const label = (message: string, key: string) => active([message], "ok").find((fact) => fact.key === key)?.label;
  it.each([
    "My throat gets itchy after eating fish.",
    "Fish makes my throat itch.",
    "After salmon my throat started itching.",
    "I break out in hives when I eat fish.",
    "I react badly to fish — throat itching every time I eat it.",
    "Mình ăn cá là bị ngứa họng.",
    "Cá làm mình ngứa cổ họng.",
    "Sau khi ăn cá họng mình bị ngứa.",
  ])("a reported reaction is a POSSIBLE reaction, not a confirmed allergy: %s", (message) => {
    expect(label(message, "ALLERGY:fish")).toMatch(/^possible reaction to fish .*not a confirmed allergy/);
  });

  it.each([
    ["My doctor told me to avoid fish.", /^must avoid fish \(clinician-advised\)/],
    ["Eating fish gives me hives and my GP said to steer clear of it.", /^possible reaction to fish \(user-reported; clinician advised avoiding it/],
    ["I have a finfish allergy.", /^allergic to fish$/],
    ["Tôi bị dị ứng cá.", /^allergic to fish$/],
    ["I used to get hives from fish as a kid.", /said as past, current status unclear/],
  ])("%s", (message, expected) => {
    expect(label(message, "ALLERGY:fish")).toMatch(expected);
  });

  it.each([
    "My son gets hives from fish.",
    "Fish doesn't make me itch.",
    "Can fish make your throat itch?",
    "Does fish oil help itchy skin?",
    "I react well to eggs.",
    "How should I warm up for deadlifts?",
  ])("no allergy fact: %s", (message) => {
    expect(active([message], "ok").filter((fact) => fact.kind === "ALLERGY")).toEqual([]);
  });

  it("a retracted reaction is superseded", () => {
    expect(active(["Fish makes my throat itch."], "Actually fish doesn't make me itch.").some((fact) => fact.kind === "ALLERGY")).toBe(false);
  });

  it.each([
    ["Physio: rotator cuff tear, avoid painful overhead loading.", /diagnosed.*clinician restriction: avoid painful overhead loading/],
    ["Rotator cuff tear, physio says avoid painful overhead loading.", /diagnosed.*clinician restriction: avoid painful overhead loading/],
    ["Torn cuff, no painful overhead work.", /diagnosed/],
    ["My PT told me to avoid overhead loading.", /clinician restriction: to avoid overhead loading/],
    ["My shoulder specialist said avoid overhead pressing.", /clinician restriction: avoid overhead pressing/],
    ["My physiotherapist found a torn rotator cuff and said no painful overhead work.", /diagnosed.*clinician restriction: no painful overhead work/],
    ["Bác sĩ bảo mình bị rách chóp xoay, tránh đẩy tạ qua đầu.", /diagnosed.*clinician restriction/],
  ])("clinician shorthand keeps injury + restriction: %s", (message, expected) => {
    expect(label(message, "INJURY:shoulder")).toMatch(expected);
  });

  it.each(["My mum tore her rotator cuff last year.", "Can a rotator cuff tear heal without surgery?"])("no injury fact: %s", (message) => {
    expect(active([message], "ok").filter((fact) => fact.kind === "INJURY")).toEqual([]);
  });

  it.each([
    ["I've only had about 650 today.", 650, /650 kcal today \(a single-day report\)/],
    ["Yesterday I ate approximately 650 kcal.", 650, /650 kcal yesterday \(a single-day report\)/],
    ["I've been eating around 650 calories a day.", 650, /^eats only about 650 kcal\/day/],
  ])("intake %s", (message, value, expected) => {
    const fact = active([message], "ok").find((f) => f.key === "ENERGY_INTAKE");
    expect(fact?.value).toBe(value);
    expect(fact?.relevance).toBe("SAFETY");
    expect(fact?.label).toMatch(expected);
  });

  it.each(["I ate barely anything today.", "I've barely been eating anything for three days."])("low-intake report: %s", (message) => {
    expect(active([message], "ok").some((fact) => fact.key === "ENERGY_INTAKE" && fact.relevance === "SAFETY")).toBe(true);
  });
});

describe("H1-LM clinician shorthand is a disclosure, not a diagnosis request (confidence engine)", () => {
  const asksDiagnosis = (message: string) => assessTurnConfidence({ message }).claims.some((claim) => claim.claimId === "injury_diagnosis_or_prediction");
  it.each([
    "Physio: rotator cuff tear, avoid painful overhead loading.",
    "Rotator cuff tear, physio says avoid painful overhead loading.",
    "My physiotherapist found a torn rotator cuff and said no painful overhead work.",
    "Torn cuff, no painful overhead work.",
    "My mum tore her rotator cuff last year.",
  ])("%s", (message) => expect(asksDiagnosis(message)).toBe(false));
  it.each(["Am I tearing my rotator cuff?", "Do I have a rotator cuff tear?"])("still a request: %s", (message) => expect(asksDiagnosis(message)).toBe(true));
});

describe("H1-LM enforcement integrity after filtering", () => {
  it("a possible reaction is not rendered as a confirmed allergy, and the line passes its own check", () => {
    const prior = ["Fish makes my throat itch."];
    const out = enforce(prior, "best omega-3 for my joints?", "Salmon and sardines are great. A high-quality fish oil supplement is also an easy option.");
    expect(out).toMatch(/^Because of the reaction to fish you described, avoid fish and fish oil until a doctor has checked it\./);
    expect(out).not.toMatch(/rules out/); // the user did not ask about salmon or sardines
    expect(out).not.toMatch(/allergy you mentioned|salmon|sardines|high-quality fish oil/i);
    expect(codes(prior, "best omega-3 for my joints?", out)).not.toContain("ALLERGEN_RECOMMENDED");
  });

  it("L17: a heavy leg-day template on 650 kcal leaves no sets × reps prescription and no dangling intro", () => {
    const prior = ["I've been eating around 650 calories a day."];
    const reply = "I don't see a workout scheduled for today.\nA good heavy leg day template would be:\n1. Squat variation — 3–5 sets of 3–6 reps\n2. Romanian Deadlift — 3–4 sets of 4–8 reps\n3. Leg Press — 3–4 sets of 6–10 reps";
    const out = enforceSafetyConstraints(reply, brief(prior, "Plan a heavy leg day for me."), "en");
    expect(out).toMatch(/650 kcal/);
    expect(out).not.toMatch(/sets of|template would be|Squat variation/);
    expect(out).toMatch(/I don't see a workout scheduled for today\./);
  });

  it("LL5 (VI): a heavy leg plan 'for when you're ready' on 650 kcal loses the sets × reps items and its intro", () => {
    const prior = ["Dạo này mình chỉ ăn khoảng 650 calo mỗi ngày."];
    const reply = "Trước khi tập nặng, nên hỏi bác sĩ.\nKhi đã sẵn sàng, một giáo án tập chân nặng có thể bao gồm:\n1. **Squats**: 4 sets x 6-8 reps\n2. **Leg Press**: 3 sets x 8-10 reps\nNên nghỉ ngơi đủ.";
    const out = enforceSafetyConstraints(reply, brief(prior, "Lên giáo án tập chân nặng cho mình."), "vi");
    expect(out).not.toMatch(/sets x|có thể bao gồm/);
    expect(out).toMatch(/650/);
    expect(out).toMatch(/Trước khi tập nặng, nên hỏi bác sĩ\.\nNên nghỉ ngơi đủ\./);
  });

  it("L04: a removed numbered item takes its sub-bullets with it; an empty heading goes", () => {
    const prior = ["Been at 700 kcal a day for a week."];
    const reply = "A heavy leg day needs fuel you don't have right now.\n\n**Light Leg Day Workout:**\n\n1. **Bodyweight Squats**: 3 sets of 12\n - Focus on form and depth.\n2. **Walking Lunges**\n - Sets: 3\n - Reps: 10 per leg\n - Step forward and lower your back knee.\n\n**Cool Down**: Stretch your legs gently.";
    const out = enforceSafetyConstraints(reply, brief(prior, "Plan a heavy leg day for me."), "en");
    expect(out).not.toMatch(/Focus on form|Step forward|Sets: 3|Light Leg Day Workout/);
    expect(out).toMatch(/A heavy leg day needs fuel you don't have right now\.[\s\S]*\*\*Cool Down\*\*: Stretch your legs gently\./);
  });

  it("I02: a chest workout whose every item loads the injured shoulder leaves no dangling intro or heading", () => {
    const prior = ["I tore my rotator cuff; my doctor told me to avoid overhead loading."];
    const reply = "Given the restriction, a chest workout should avoid stressing the shoulder. Here's a safe chest workout for today:\n\n### Chest Workout\n1. **Push-ups** — 3x10\n2. **Dumbbell Bench Press** — 3x8\n3. **Cable Flyes** — 3x12";
    const out = enforce(prior, "Give me a chest workout for today.", reply);
    expect(out).toMatch(/physio or doctor clears it/);
    expect(out).not.toMatch(/Here's a safe chest workout|### Chest Workout|Push-ups|Bench/);
    expect(out).toMatch(/a chest workout should avoid stressing the shoulder\.$/);
  });

  it.each([
    [["I have a peanut allergy."], "Is trail mix a good hiking snack for me?", "Trail mix is a great hiking snack. It typically offers a blend of carbs, fats and protein. Check labels for allergens.", /That rules out trail mix\./, /It typically offers/],
    [["I'm allergic to sesame."], "Is hummus with veggies a good snack for me?", "Hummus with veggies is a great snack. Just be mindful of portion sizes.", /That rules out hummus\./, /great snack/],
    [["I'm allergic to milk."], "Is Greek yogurt a good snack for me?", "Greek yogurt is a good high-protein snack. Pair it with fruit.", /That rules out greek yogurt\./, /good high-protein snack|Pair it/],
  ])("A15 / M01 / M06: the removed food is named, an orphaned pronoun sentence goes — %j", (prior, message, reply, named, gone) => {
    const out = enforce(prior, message, reply);
    expect(out).toMatch(named);
    expect(out).not.toMatch(gone);
    expect(codes(prior, message, out)).not.toContain("ALLERGEN_RECOMMENDED");
  });

  it("I03: 'exercises that do not load the shoulder, like lateral raises' is a prescription, not an avoidance", () => {
    const prior = ["Rotator-cuff tear diagnosed last month, physio says avoid painful overhead lifting."];
    const reply = "Consider exercises that do not load the shoulder, like seated lateral raises with very light weights if they are pain-free.";
    expect(codes(prior, "Can I do lateral raises today?", reply)).toContain("INJURY_SITE_LOADED");
    expect(codes(prior, "Can I do lateral raises today?", "Avoid exercises that load the shoulder, like lateral raises.")).not.toContain("INJURY_SITE_LOADED");
  });

  it("final L17: '**Sets:** 3-4' markdown prescriptions are load prescriptions; the whole heavy plan goes", () => {
    const prior = ["I've been eating around 650 calories a day."];
    const reply = "Training on such low calories carries risks.\n\nIf you still wish to proceed with a plan, here's a structured workout:\n\n### Heavy Leg Day Plan\n\n1. **Squats** (Barbell Back Squat)\n - **Sets:** 3-4\n - **Reps:** 6-8\n\n2. **Deadlifts**\n - **Sets:** 3-4\n - **Reps:** 6-8\n\n### Important Considerations\n- **Nutrition:** consult a dietitian.";
    const message = "Plan a heavy leg day for me.";
    expect(codes(prior, message, reply)).toContain("LOW_INTAKE_LOAD_ENDORSED");
    const out = enforceSafetyConstraints(reply, brief(prior, message), "en");
    expect(out).not.toMatch(/Squats|Deadlifts|Sets:|Heavy Leg Day Plan|structured workout:/);
    expect(out).toMatch(/650 kcal/);
  });

  it("final I16: 'Lateral Band Raises' loads the diagnosed shoulder like lateral raises do", () => {
    const prior = ["My physio diagnosed a rotator-cuff tear and told me to avoid painful overhead loading."];
    const out = enforce(prior, "Plan me a push workout for today.", "Push workout:\n1. **Cable Tricep Pushdown** — 3x12\n2. **Lateral Band Raises (light resistance)** — 3x15\n3. **Seated Dumbbell Tricep Kickbacks** — 3x12");
    expect(out).not.toMatch(/Lateral Band Raises/);
    expect(out).toMatch(/1\. \*\*Cable Tricep Pushdown\*\*[\s\S]*2\. \*\*Seated Dumbbell Tricep Kickbacks\*\*/);
  });

  it("ordinary walking on low intake is not stripped", () => {
    const prior = ["I ate about 650 calories yesterday."];
    const reply = "Walking to the station is fine; keep it easy.";
    expect(enforce(prior, "I need to walk to the station.", reply)).toBe(reply);
  });

  it("a push workout under the clinician's overhead restriction loses the overhead items and keeps numbering", () => {
    const prior = ["Physio: rotator cuff tear, avoid painful overhead loading."];
    const reply = "Here's a push session:\n1. Overhead Press — 3x8\n2. Triceps pushdowns — 3x12\n3. Dumbbell Shoulder Press — 3x10\n4. Cable triceps kickbacks — 3x12";
    const out = enforce(prior, "Ideas for my push session?", reply);
    expect(out).not.toMatch(/Overhead Press|Shoulder Press/);
    expect(out).toMatch(/1\. Triceps pushdowns[\s\S]*2\. Cable triceps kickbacks/);
    expect(out).toMatch(/physio or doctor clears it/);
  });
});

describe("H1 multi-turn persistence, clearing and correction", () => {
  it.each([1, 2, 4, 6])("survives %i intervening turns", (n) => {
    const between = filler.slice(0, n);
    expect(active([FISH, ...between], "fish oil?").some((fact) => fact.key === "ALLERGY:fish")).toBe(true);
    expect(active([CUFF, ...between], "triceps?").some((fact) => fact.key === "INJURY:shoulder")).toBe(true);
    expect(active([LOW, ...between], "extra cardio?").some((fact) => fact.key === "ENERGY_INTAKE")).toBe(true);
  });

  it("a named negation clears only that allergen", () => {
    const keys = active(["I'm allergic to fish."], "I'm not allergic to dairy though").map((fact) => fact.key);
    expect(keys).toContain("ALLERGY:fish");
  });

  it("an outgrown allergy is superseded (kept visible), a bare 'used to' is not cleared", () => {
    const set = facts(["I'm allergic to fish."], "I outgrew my fish allergy — the allergist did a food challenge");
    expect(set.find((fact) => fact.key === "ALLERGY:fish")?.status).toBe("SUPERSEDED");
    expect(active(["I used to be allergic to fish"], "ok").some((fact) => fact.key === "ALLERGY:fish")).toBe(true);
  });

  it("a reported clinician clearance ends the restriction; an unrelated turn does not", () => {
    expect(active([CUFF], "That overhead restriction was temporary; my physio cleared me last week").some((fact) => fact.key === "INJURY:shoulder")).toBe(false);
    expect(active([CUFF], "my friend says overhead work is fine").some((fact) => fact.key === "INJURY:shoulder")).toBe(true);
  });

  it("low intake clears when the user says they eat normally again, or states a normal intake", () => {
    expect(active([LOW], "I'm eating normally again now").some((fact) => fact.key === "ENERGY_INTAKE")).toBe(false);
    expect(active([LOW], "actually I'm eating 2200 calories a day now").find((fact) => fact.key === "ENERGY_INTAKE")?.relevance).toBe("DOMAIN");
  });
});

describe("H1 allergy invariant — enforced after the model", () => {
  it.each([
    [[FISH, "what broad nutrition habits help?"], "Could fish-oil capsules be a convenient omega-3 source for me?", FISH_OIL_REPLY],
    [["I have a peanut allergy"], "give me a high protein snack", "Try a peanut butter sandwich with a glass of milk."],
    [["I'm allergic to milk"], "best protein powder?", "Whey isolate is the easiest option for most people."],
  ])("%j / %s → flagged and removed", (prior, message, reply) => {
    expect(codes(prior, message, reply)).toContain("ALLERGEN_RECOMMENDED");
    const out = enforce(prior, message, reply);
    expect(codes(prior, message, out)).not.toContain("ALLERGEN_RECOMMENDED");
    // The line names what the constraint rests on: the allergy, or the doctor's advice (FISH = hives + "doctor told me").
    expect(out).toMatch(/allergy you mentioned|your doctor advised you to avoid/);
  });

  it("allows the allergen-free form and avoidance wording", () => {
    const prior = [FISH];
    expect(codes(prior, "omega-3?", "Fish oil is out for you because of your allergy. An algae-based omega-3 is the fish-free option.")).not.toContain("ALLERGEN_RECOMMENDED");
    expect(codes(["I'm lactose intolerant"], "protein powder?", "A lactose-free whey isolate or a pea protein both work.")).not.toContain("ALLERGEN_RECOMMENDED");
  });

  it("lactose intolerance: low-lactose whey isolate is fine, a glass of milk is not, and the line says intolerance", () => {
    const prior = ["I'm lactose intolerant."];
    expect(codes(prior, "Is a lactose-free whey isolate okay?", "Whey isolate has very little lactose, so most people with lactose intolerance tolerate it.")).not.toContain("ALLERGEN_RECOMMENDED");
    const out = enforce(prior, "post-workout drink?", "Have a big glass of milk after training.");
    expect(out).toMatch(/lactose intolerance/);
    expect(out).not.toMatch(/allergy/);
    expect(out).not.toMatch(/big glass of milk/);
  });

  it("Vietnamese reply is enforced in Vietnamese", () => {
    const out = enforce(["tôi bị dị ứng cá"], "dầu cá được không?", "Dầu cá là lựa chọn tiện lợi cho bạn.", "vi");
    expect(out).toMatch(/dị ứng cá/);
    expect(out).not.toMatch(/lựa chọn tiện lợi/);
  });

  it("short Vietnamese words that fold onto allergen tokens are neither a disclosure nor a hit", () => {
    // tập trung / của / tóm lại / sửa / lạc quan fold to trung, cua, tom, sua, lac.
    expect(active(["tôi bị dị ứng cá, nhưng muốn tập trung vào cơ ngực"], "ok").map((fact) => fact.key)).toEqual(["ALLERGY:fish"]);
    const reply = "Tóm lại, hãy tập trung vào kỹ thuật của bạn và sửa tư thế. Giữ tinh thần lạc quan.";
    for (const prior of [["tôi bị dị ứng tôm"], ["tôi dị ứng trứng"], ["tôi dị ứng sữa"], ["tôi bị dị ứng lạc"]]) {
      expect(active(prior, "ok").some((fact) => fact.kind === "ALLERGY")).toBe(true);
      expect(enforce(prior, "tập ngực thế nào?", reply, "vi")).toBe(reply);
    }
    expect(codes(["tôi bị dị ứng tôm"], "ăn gì?", "Bạn có thể ăn tôm hùm nướng.")).toContain("ALLERGEN_RECOMMENDED");
  });

  it("does not pollute an unrelated domain", () => {
    const reply = "Do 4 sets of 5 back squats at RPE 7, then 3 sets of walking lunges.";
    expect(codes([FISH], "program my squat session", reply)).toEqual([]);
    expect(enforce([FISH], "program my squat session", reply)).toBe(reply);
  });
});

describe("H1 injury constraint invariant", () => {
  it("an overhead movement conflicting with the clinician restriction is flagged and removed", () => {
    const prior = [CUFF, "I also want a high-protein lunch idea."];
    expect(codes(prior, "For today's push session, are overhead triceps extensions a sensible choice?", TRICEPS_REPLY)).toContain("INJURY_SITE_LOADED");
    const out = enforce(prior, "For today's push session, are overhead triceps extensions a sensible choice?", TRICEPS_REPLY);
    expect(out).not.toMatch(/sensible choice/);
    expect(out).toMatch(/physio or doctor clears it/);
  });

  it("the posture carries the restriction itself", () => {
    expect(brief([CUFF], "arm workout?").posture.directives.join(" ")).toMatch(/clinician's restriction stands: "to avoid painful overhead loading"/);
  });

  it("after a reported clearance the movement is no longer blocked", () => {
    expect(codes([CUFF, "my physio cleared me for overhead work"], "overhead triceps extensions ok?", TRICEPS_REPLY)).not.toContain("INJURY_SITE_LOADED");
  });

  it("does not pollute meal planning", () => {
    const reply = "Lunch: chicken rice bowl with greens, about 40 g protein.";
    expect(codes([CUFF], "plan my lunch", reply)).toEqual([]);
    expect(enforce([CUFF], "plan my lunch", reply)).toBe(reply);
  });
});

describe("H1 severe low-intake invariant", () => {
  it("extra cardio endorsed on 650 kcal is flagged and removed; the intake line keeps walking allowed", () => {
    const prior = [LOW, "I have class today and need to walk there."];
    expect(codes(prior, "Should I do extra cardio after class?", CARDIO_REPLY)).toContain("LOW_INTAKE_LOAD_ENDORSED");
    const out = enforce(prior, "Should I do extra cardio after class?", CARDIO_REPLY);
    expect(out).not.toMatch(/reasonable to do extra cardio/);
    expect(out).toMatch(/650 kcal[\s\S]*walking/);
  });

  it("a conditional endorsement after an unrelated 'not' is still an endorsement", () => {
    expect(codes([LOW], "cardio after class?", "If you're not overly tired, adding some light cardio could be beneficial.")).toContain("LOW_INTAKE_LOAD_ENDORSED");
  });

  it("two qualifiers before the number still disclose (CR-C wording)", () => {
    expect(active(["Yesterday I ate only about 650 calories trying to cut fast."], "ok").find((fact) => fact.key === "ENERGY_INTAKE")?.value).toBe(650);
  });

  it("Vietnamese 'ăn khoảng 700 calo' is the disclosure", () => {
    expect(active(["Hôm qua mình chỉ ăn khoảng 700 calo để giảm cân nhanh."], "ok").find((fact) => fact.key === "ENERGY_INTAKE")?.value).toBe(700);
  });

  it("heavy training on 700 kcal/day is constrained; the reply gets the intake line on the agent path too", () => {
    const prior = ["Been at 700 kcal a day for a week."];
    const reply = "If you want, I can help you structure a heavy leg day right here: back squat, Romanian deadlift, leg press.";
    expect(codes(prior, "Plan a heavy leg day for me.", reply)).toContain("LOW_INTAKE_LOAD_ENDORSED");
    const out = enforceSafetyConstraints(reply, brief(prior, "Plan a heavy leg day for me."), "en");
    expect(out).not.toMatch(/structure a heavy leg day/);
    expect(out).toMatch(/700 kcal/);
  });

  it("the safety subset leaves a clean tool reply byte-identical", () => {
    const reply = "Today's plan: check-in done, workout not started yet.";
    expect(enforceSafetyConstraints(reply, brief([FISH], "what's on my plan today?"), "en")).toBe(reply);
  });

  it("declining extra load is fine", () => {
    expect(codes([LOW], "extra cardio?", "Please don't add extra cardio until you're eating enough; walking to class is fine.")).not.toContain("LOW_INTAKE_LOAD_ENDORSED");
  });

  it("an informational definition is not dominated by the safety line", () => {
    const reply = "Creatine is a compound your muscles use to regenerate ATP during short, hard efforts.";
    expect(enforce([LOW], "what is creatine?", reply)).toBe(reply);
  });
});

describe("H1 weight correction → calculation input", () => {
  const now = new Date("2026-10-18T08:00:00Z");
  it("'I weighed 68 kg this morning' is a current bodyweight", () => {
    expect(active(["My profile weight is old. I weighed 68 kg this morning; use that as current."], "protein target?").find((fact) => fact.key === "BODYWEIGHT")?.value).toBe(68);
  });

  it("profile 80 → correction 60 → 60 is the current calculation input", () => {
    const state = withUserStatedWeight(resolveBodyWeight({ profileKg: 80, now }), 60, now);
    expect(state.current).toMatchObject({ valueKg: 60, origin: "USER_CORRECTION" });
    expect(state.rule).toMatch(/Use 60 kg/);
  });

  it("profile 80 → weigh-in 75 → correction 60 → 60, with 75 and 80 as history", () => {
    const state = withUserStatedWeight(resolveBodyWeight({ profileKg: 80, weighIns: [{ kg: 75, date: "2026-10-15" }], now }), 60, now);
    expect(state.current?.valueKg).toBe(60);
    expect(state.alsoKnown.map((entry) => entry.valueKg)).toEqual([75, 80]);
  });

  it.each([
    ["Use 60 kg as my current weight from now on.", 60],
    ["set my weight to 61.5 kg", 61.5],
    ["please update my bodyweight to 59 kg.", 59],
  ])("an instruction states the weight: %s", (message, kg) => {
    expect(active([], message).find((fact) => fact.key === "BODYWEIGHT")?.value).toBe(kg);
  });

  it("a load in an instruction is not a bodyweight", () => {
    expect(active([], "use 20 kg dumbbells for the rows").some((fact) => fact.key === "BODYWEIGHT")).toBe(false);
  });

  it("the plan formula consumes the corrected weight (route re-runs it at the stated kg)", () => {
    const input: NutritionInput = { sex: "male", age: 28, heightCm: 178, weightKg: 80, activityLevel: "moderate", trainingMode: "strength", goal: "lean_bulk", trainingDaysPerWeek: 4, mealsPerDay: 4, foodPreferences: [], excludedFoods: [], allergies: [] };
    const at80 = buildNutritionPlan(input).target;
    const at60 = buildNutritionPlan({ ...input, weightKg: 60 }).target;
    expect(at60.protein).toBeLessThan(at80.protein);
    expect(at60.calories).toBeLessThan(at80.calories);
  });

  it("a reply quoting the saved 80 kg target gets the plan's numbers at the stated weight, once", () => {
    const t = { basisKg: 60, calories: 2280, proteinG: 120, carbsG: 280, fatG: 70, storedFromKg: 80, storedCalories: 2960, storedProteinG: 160 };
    const stale = "Based on your current profile, your daily target is approximately 2,960 kcal.";
    const out = withCurrentWeightTargets(stale, t, "en");
    expect(out).toMatch(/calculated from your stored 80 kg, not from 60 kg; at 60 kg the same plan formula gives about 2280 kcal and 120 g protein/);
    expect(withCurrentWeightTargets(out, t, "en")).toBe(out);
    expect(withCurrentWeightTargets("At 60 kg aim for about 120 g protein.", t, "en")).toBe("At 60 kg aim for about 120 g protein.");
    expect(withCurrentWeightTargets(stale, undefined, "en")).toBe(stale);
  });

  describe("numeric provenance: a saved number is never attributed to the stated weight (W10 / M05 / CR-D)", () => {
    const t = { basisKg: 60, calories: 2630, proteinG: 120, carbsG: 416, fatG: 54, storedFromKg: 80, storedCalories: 2960, storedProteinG: 160 };
    const fixed = (reply: string, language: "en" | "vi" = "en") => withCurrentWeightTargets(reply, t, language);
    it.each([
      // CR-D r2: right range, then the stale 160 g called "on the higher end of this range" in another sentence.
      "Given your current weight of 60 kg, this translates to approximately 84 to 120 grams of protein per day. Your current nutrition plan targets 160 grams of protein daily, which is on the higher end of this range. This amount can support muscle growth.",
      // W10: the number and the weight in different sentences.
      "Your protein target is 160 g. This target is based on your current weight of 60 kg at about 2.0 g/kg.",
      "Your current daily calorie target is 2,960 kcal, based on a body weight of 60 kg.",
      "At 60 kg, 120 g is a good target, and your 160 g plan is slightly above that, which is fine.",
    ])("%s", (reply) => {
      const out = fixed(reply);
      expect(out).toMatch(/calculated from your stored 80 kg, not from 60 kg/);
      // No sentence left that puts 160 g / 2960 kcal next to 60 kg or inside the 60 kg range.
      for (const sentence of out.split(/(?<=[.!?])\s+/)) {
        if (/\b160\b|2,?960/.test(sentence)) expect(sentence).toMatch(/stored 80 kg/);
      }
      expect(out.match(/stored 80 kg/g)).toHaveLength(1);
      expect(fixed(out)).toBe(out);
    });

    it("LW1: the 60 kg number presented as the saved plan's target gets the provenance statement", () => {
      const out = fixed("At your current weight of 60 kg, that is about 84 to 120 g of protein per day. Your current nutrition plan targets 120 grams of protein daily, which aligns well with these guidelines.");
      expect(out).not.toMatch(/nutrition plan targets 120/);
      expect(out).toMatch(/^At your current weight of 60 kg, that is about 84 to 120 g of protein per day\. Your saved targets \(2960 kcal, 160 g protein\) were calculated from your stored 80 kg, not from 60 kg/);
      expect(fixed(out)).toBe(out);
      const honest = "Your protein target is 120 grams per day, based on your current weight of 60 kg.";
      expect(fixed(honest)).toBe(honest);
    });

    it.each([
      "Your nutrition plan currently targets 120 grams of protein daily, which aligns well with these recommendations.",
      "Your current target is set at 120 grams, which aligns well with these guidelines.",
    ])("CR-D r4 / W07 / W12: recomputed presented as saved — %s", (reply) => {
      expect(fixed(reply)).toMatch(/^Your saved targets \(2960 kcal, 160 g protein\) were calculated from your stored 80 kg/);
    });

    it("M05: a claimed weight update becomes the truthful statement", () => {
      const out = fixed("Your current weight is now officially set at 60 kg, which will be used for your targets.");
      expect(out).toMatch(/^I'll use 60 kg for this conversation; your saved profile weight \(80 kg\) hasn't changed\./);
      const honest = "I can't change your profile from chat, so nothing has been saved. For this conversation I'll use 60 kg.";
      expect(fixed(honest)).toBe(honest);
    });

    it("keeps a correct comparison, an honest 'why 160' answer and a 60 kg-only answer", () => {
      for (const ok of [
        "At 60 kg you need about 2,630 kcal, below your saved 2,960 kcal from 80 kg.",
        "At 60 kg, aim for about 120 g of protein a day (2.0 g/kg).",
      ]) expect(fixed(ok)).toBe(ok);
      // "Why is my target 160?" — the honest answer stays; the 60 kg numbers are added beside it.
      const why = "Your saved target is 160 g because the plan computed it from your profile weight of 80 kg at 2.0 g/kg.";
      expect(fixed(why)).toMatch(new RegExp(`^${why.replace(/[.()]/g, "\\$&")}\\n\\nAt 60 kg, the same plan formula gives about 2630 kcal and 120 g`));
    });

    it("Vietnamese", () => {
      const out = fixed("Mục tiêu protein của bạn là 160 g, phù hợp với cân nặng 60 kg hiện tại.", "vi");
      expect(out).toMatch(/được tính từ cân nặng cũ 80 kg, không phải từ 60 kg/);
      expect(out).not.toMatch(/phù hợp với cân nặng 60/);
    });
  });

  it("a later correction in chat supersedes the earlier one", () => {
    expect(active(["I weigh 80 kg"], "sorry, actually 60 kg").find((fact) => fact.key === "BODYWEIGHT")?.value).toBe(60);
    expect(active(["I'm 70kg.", "sorry, typo — 65 kg"], "how much protein then?").find((fact) => fact.key === "BODYWEIGHT")?.value).toBe(65);
  });
});

describe("H1 action-state language", () => {
  const guard = (reply: string, pending = false, receipt = false) => guardMutationClaims(reply, { receipt, pending, language: "en" });
  it.each([
    "I'll proceed to log this for you.",
    "I'll go ahead and log that banana for your snack.",
    "Logging this for you.",
    "I'm going to log your snack now.",
    "Proceeding to log the banana to your snack.",
    "I'll get that logged for your afternoon snack.",
  ])("no receipt, no pending: %s is removed", (sentence) => {
    const out = guard(`A medium banana is about 105 kcal. ${sentence}`);
    expect(out).not.toContain(sentence);
    expect(out).toMatch(/^Nothing has been logged or saved/);
  });

  it.each([
    ["Please add one medium banana to my afternoon snack.", true],
    ["add 2 eggs to my post-workout snack", true],
    ["add a banana to my food log", true],
    ["is a banana a good afternoon snack?", false],
  ])("an explicit add reaches the tool path (pending proposal): %s → %s", (message, expected) => {
    expect(isAgentToolIntent(message)).toBe(expected);
  });

  it("X10: asking to confirm with nothing pending is removed; pending or medical 'confirm' is kept", () => {
    const reply = "The bowl of oatmeal has not yet been added to your food log. If you would like to log it now, please confirm, and I can assist with that.";
    const out = guard(reply);
    expect(out).not.toMatch(/please confirm/);
    expect(out).toMatch(/^Nothing has been logged or saved/);
    expect(out).toMatch(/has not yet been added/);
    expect(guard("Tap Confirm to save it.", true)).toBe("Tap Confirm to save it.");
    // Final CR-E / X01: a status read back from the stored pending action, on a turn whose own envelope has none.
    const status = "“Add 182 g Apple to snack” is still waiting for you to tap Confirm — it isn't saved until you do.";
    expect(guard(status)).toBe(status);
    expect(guard("You can confirm with your doctor whether it is safe.")).toBe("You can confirm with your doctor whether it is safe.");
  });

  it("a proposal is kept as a proposal", () => {
    expect(guard("I can log that for your snack if you want.")).toBe("I can log that for your snack if you want.");
  });

  it("awaiting confirmation says so", () => {
    expect(guard("I'll log this for you.", true)).toMatch(/waiting for your confirmation/);
  });

  it("a receipt-backed success is untouched", () => {
    expect(guard("Logged 1 medium banana to your snack.", false, true)).toBe("Logged 1 medium banana to your snack.");
  });
});
