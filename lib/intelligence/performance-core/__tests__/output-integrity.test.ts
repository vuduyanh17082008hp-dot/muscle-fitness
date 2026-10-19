import { describe, expect, it } from "vitest";

import { buildIntelligenceBrief, checkOutputIntegrity, enforceIntegrity, hasCriticalViolation, integrityCorrectionBrief, stripDosing } from "..";

const brief = (message: string, priorUserMessages: string[] = []) => buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages, canRetrieve: true });
const codes = (reply: string, b: ReturnType<typeof brief>) => checkOutputIntegrity({ reply, brief: b }).map((v) => v.code);
const OPEN = brief("yo what supplements should i take as a 18 years old natural gym rat");

describe("output integrity — the reply stays inside the brief", () => {
  it("the original failing answer shape is rejected: a generic stack that recommends BCAA", () => {
    const stack = "Here's a solid stack for you:\n- Whey protein: take a scoop after training.\n- Creatine: 5 g daily.\n- BCAA: take them during your workout to boost recovery.\n- Omega-3 and a multivitamin for overall health.\nAsk your doctor before starting.";
    expect(codes(stack, OPEN)).toContain("LOW_VALUE_RECOMMENDED");
    expect(integrityCorrectionBrief(checkOutputIntegrity({ reply: stack, brief: OPEN }))).toMatch(/BCAA, which the evidence places as low value/);
  });

  it("a need-first answer that explains why BCAA adds little passes", () => {
    const good = "Short version: food, training and sleep do most of it at 18. Creatine is the one with strong support and it's optional. Whey only helps if your diet doesn't already cover your protein. You can skip BCAA: complete protein already gives you those amino acids. Two things would change this: do you usually hit your protein, and how's your sleep?";
    expect(codes(good, OPEN)).toEqual([]);
  });

  it("NEED before USE: an open request may not open with products, and must ask what the policy found missing (found by the live smoke)", () => {
    const listFirst = "Here are some options to consider. Creatine is well supported and optional. Whey helps if your diet is short on protein. Assess your diet first.";
    expect(codes(listFirst, OPEN)).toEqual(["NEED_BEFORE_USE", "NEED_BEFORE_USE"]);
    expect(integrityCorrectionBrief(checkOutputIntegrity({ reply: listFirst, brief: OPEN }))).toMatch(/You opened with products[\s\S]*End with them as short, direct questions/);
    const needFirst = "Food, training and sleep matter more than any supplement at 18. Creatine is the one with strong support, and it's optional. Do you usually hit your protein, and how is your sleep?";
    expect(codes(needFirst, OPEN)).toEqual([]);
    // a NAMED supplement question is not held to the open-request shape
    expect(codes("Creatine is well supported and optional.", brief("is creatine necessary?"))).toEqual([]);
  });

  it("OPTIONAL != NECESSARY", () => {
    expect(codes("Creatine is essential if you want to grow.", brief("is creatine necessary?"))).toEqual(["NECESSITY_OVERCLAIM"]);
    expect(codes("Creatine is not necessary — it's optional.", brief("is creatine necessary?"))).toEqual([]);
  });

  it("certainty may not exceed the evidence the registry holds", () => {
    expect(codes("Citrulline is proven to boost your pump and strength.", brief("what does citrulline actually do?"))).toContain("CERTAINTY_EXCEEDS_EVIDENCE");
    expect(codes("Citrulline showed a small effect on reps in a few small trials; it's not proven for strength.", brief("what does citrulline actually do?"))).toEqual([]);
    // creatine's performance claim is HIGH, so confident wording about it is not flagged
    expect(codes("Creatine is definitely the best-supported option here.", brief("is creatine necessary?"))).toEqual([]);
  });

  it("no dose under a no-dosing posture", () => {
    const medicated = brief("I take medication, what supplements should I use?");
    expect(codes("You could start creatine at 5 g per day.", medicated)).toContain("DOSE_UNDER_NO_DOSING");
    expect(hasCriticalViolation(checkOutputIntegrity({ reply: "You could start creatine at 5 g per day.", brief: medicated }))).toBe(true);
    expect(codes("Which medication matters here, so that check is your pharmacist's. Food, training and sleep need no interaction check.", medicated)).toEqual([]);
  });

  it("explicit language control is checked on the final text", () => {
    const en = brief("in english bro", ["hôm nay tôi nên tập gì"]);
    expect(codes("Hôm nay bạn nên tập chân và ăn đủ đạm nhé.", en)).toEqual(["LANGUAGE_CONTROL"]);
    expect(codes("Train legs today and get your protein in. A bowl of phở after is fine.", en)).toEqual([]);
    const vi = brief("nói tiếng việt đi", ["how much volume do I need"]);
    expect(codes("You need around ten hard sets per muscle each week to grow well.", vi)).toEqual(["LANGUAGE_CONTROL"]);
    expect(codes("Bạn cần khoảng mười set nặng cho mỗi nhóm cơ mỗi tuần.", vi)).toEqual([]);
  });

  it("a banned form of address is caught", () => {
    const b = brief("how do I deload", ["stop calling me bro"]);
    expect(codes("Easy, bro — drop the load for a week.", b)).toEqual(["ADDRESS_BAN"]);
    expect(codes("Drop the load for a week.", b)).toEqual([]);
  });

  it("a topic with no verified knowledge: an asserted benefit is the model filling the gap (found by the live smoke)", () => {
    const tudca = brief("What does TUDCA do?");
    const filled = "TUDCA is a bile acid. It may help protect cells from stress and has shown promise in reducing inflammation.";
    expect(codes(filled, tudca)).toEqual(["UNVERIFIED_BENEFIT"]);
    expect(hasCriticalViolation(checkOutputIntegrity({ reply: filled, brief: tudca }))).toBe(true);
    const honest = "TUDCA is a bile acid that has been studied in liver and neurological conditions. No benefit is established here, so I can't tell you it does anything useful for training.";
    expect(codes(honest, tudca)).toEqual([]);
    // the same wording about a covered topic is not this violation
    expect(codes("Creatine helps high-intensity performance.", brief("is creatine necessary?"))).toEqual([]);
  });

  it("enforceIntegrity is the deterministic last line: it removes, never adds a claim, and is inert elsewhere", () => {
    const tudca = brief("What does TUDCA do?");
    const filled = "TUDCA is a bile acid that has been studied in liver conditions. It may help protect cells from stress and has shown promise in reducing inflammation.";
    const enforced = enforceIntegrity(filled, tudca, "en");
    expect(enforced).toMatch(/has been studied in liver conditions/);
    expect(enforced).not.toMatch(/may help protect|shown promise/);
    expect(enforced).toMatch(/no benefit is established/);
    expect(checkOutputIntegrity({ reply: enforced, brief: tudca })).toEqual([]);
    // nothing honest left → the reply IS the gap, in the turn language
    expect(enforceIntegrity("It helps your liver and improves recovery.", tudca, "vi")).toMatch(/Với TUDCA, chưa có lợi ích nào được xác lập/);
    // a no-dosing posture removes the dose sentence
    expect(enforceIntegrity("Creatine is optional. Take 5 g of creatine daily.", brief("I take medication, should I use creatine?"), "en")).toBe("Creatine is optional.");
    // a covered topic under ALLOW is returned byte-for-byte
    const ordinary = "Creatine helps high-intensity performance; 3-5 g per day is the studied dose.";
    expect(enforceIntegrity(ordinary, brief("is creatine necessary?"), "en")).toBe(ordinary);
  });

  it("a turn with no supplement and no control is never touched", () => {
    expect(codes("You must train hard and definitely sleep more.", brief("how much volume do I actually need?"))).toEqual([]);
  });

  it("stripDosing removes only the supplement-dose sentences", () => {
    const out = stripDosing("Creatine is optional. Take 5 g of creatine daily. Sleep 8 hours and eat 160 g of protein from food.");
    expect(out).not.toMatch(/5 g of creatine/);
    expect(out).toMatch(/Creatine is optional\./);
    expect(out).toMatch(/Sleep 8 hours/);
  });
});
