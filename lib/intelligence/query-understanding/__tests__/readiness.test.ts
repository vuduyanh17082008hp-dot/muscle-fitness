import { describe, expect, it } from "vitest";

import { buildDanteDeferralReply, buildGemmaDeferralReply, dantePassesToGemma, parseUserQuery } from "..";
import { buildDanteQueryContext, type DanteCurrentRecovery } from "../dante-context";

const dante = { surface: "DANTE" } as const;
const gemma = { surface: "GEMMA" } as const;

const GEMMA_VI = "tôi muốn đi tập nhưng buồn ngủ quá, nên đi ko bạn";
const DANTE_VI = "hôm nay recovery chỉ 11, nhưng bố mày vẫn thấy khỏe lắm, haha, bố nên đi tập ko hay nghỉ mẹ ở nhà nhỉ, giúp bố với";
const GEMMA_EN = "I'm really sleepy but want to train. Should I go?";
const DANTE_EN = "My recovery is 11 but I actually feel strong. Should I train or rest?";

describe("Gemma: training/readiness decisions belong to Dante", () => {
  it("VI sleepy + want to train → sleepiness, readiness question, defer to Dante", () => {
    const f = parseUserQuery(GEMMA_VI, gemma);
    expect(f.language).toBe("VI");
    expect(f.primaryDomain).toBe("TRAINING");
    expect(f.secondaryDomains).toContain("RECOVERY");
    expect(f.intent).toBe("READINESS_RECOMMENDATION");
    expect(f.entities).toContainEqual(expect.objectContaining({ kind: "STATE", value: "SLEEPINESS" }));
    expect(f.entities.some((e) => e.kind === "STATE" && (e.value === "BOREDOM" || e.value === "SADNESS"))).toBe(false);
    expect(f.deferToDante).toBe(true);
    expect(f.owner).toBe("DANTE");
  });

  it("EN parity", () => {
    const f = parseUserQuery(GEMMA_EN, gemma);
    expect(f.language).toBe("EN");
    expect(f.intent).toBe("READINESS_RECOMMENDATION");
    expect(f.deferToDante).toBe(true);
  });

  it("boredom is interpreted as boredom, still a Dante decision", () => {
    const f = parseUserQuery("buồn chán quá, có nên đi gym cho vui không", gemma);
    expect(f.entities).toContainEqual(expect.objectContaining({ kind: "STATE", value: "BOREDOM" }));
    expect(f.entities.some((e) => e.value === "SLEEPINESS")).toBe(false);
    expect(f.deferToDante).toBe(true);
  });

  it.each(["should I train?", "should I squat today?", "should I rest?", "can I deadlift heavy tonight?", "tôi nên đi tập không?", "nay squat nặng được không?"])("%s → Dante", (q) => {
    const f = parseUserQuery(q, gemma);
    expect(f.owner).toBe("DANTE");
    expect(f.deferToDante).toBe(true);
  });

  it("hungry before training stays nutrition (Gemma answers)", () => {
    const f = parseUserQuery("tôi đói quá trước buổi tập, nên ăn gì", gemma);
    expect(f.primaryDomain).toBe("NUTRITION");
    expect(f.deferToDante).toBe(false);
    expect(f.owner).toBe("GEMMA");
  });

  it("the boundary reply names the right state, points to Dante, and is not generic gym motivation", () => {
    const vi = buildDanteDeferralReply(parseUserQuery(GEMMA_VI, gemma));
    expect(vi).toMatch(/Buồn ngủ/);
    expect(vi).toMatch(/Dante/);
    expect(vi).not.toMatch(/chán|bored|great way|mood|motivat/i);
    const en = buildDanteDeferralReply(parseUserQuery(GEMMA_EN, gemma));
    expect(en).toMatch(/sleepy/);
    expect(en).toMatch(/Dante/);
    const bored = buildDanteDeferralReply(parseUserQuery("buồn chán quá, có nên đi gym cho vui không", gemma));
    expect(bored).toMatch(/chán/);
    expect(bored).not.toMatch(/Buồn ngủ/);
  });
});

describe("Dante: readiness decision frame", () => {
  it.each([DANTE_VI, DANTE_EN, "recovery 11 nhưng tao thấy khỏe, nên tập ko bro"])("%s → READINESS_RECOMMENDATION with a conflict", (q) => {
    const f = parseUserQuery(q, dante);
    expect(["TRAINING", "RECOVERY"]).toContain(f.primaryDomain);
    expect(f.intent).toBe("READINESS_RECOMMENDATION");
    expect(f.readiness).toMatchObject({ decisionRequested: true, statedRecoveryScore: 11, objective: "LOW", subjective: "HIGH", conflict: true, baselineQuestion: false });
    expect(f.deferToDante).toBe(false); // Dante owns it
  });

  it("slang does not demote a concrete coaching decision to casual/social", () => {
    for (const q of [DANTE_VI, "recovery 11 nhưng tao thấy khỏe, nên tập ko bro"]) {
      const f = parseUserQuery(q, dante);
      expect(["CASUAL", "SOCIAL_INSULT", "UNKNOWN"]).not.toContain(f.intent);
      expect(f.primaryDomain).not.toBe("GLOBAL");
    }
    // even with an insult in the sentence, the decision wins
    expect(parseUserQuery("recovery 11, thằng ngu này nên tập không", dante).intent).toBe("READINESS_RECOMMENDATION");
  });

  it("VI frame is VI even though 'recovery' is an English loanword", () => {
    expect(parseUserQuery(DANTE_VI, dante).language).toBe("VI");
  });

  it("'is 11 lower than MY normal?' is a baseline question, not a train/rest decision", () => {
    const f = parseUserQuery("recovery 11 thấp hơn bình thường của tôi không?", dante);
    expect(f.intent).toBe("CURRENT_STATE");
    expect(f.readiness).toMatchObject({ baselineQuestion: true, decisionRequested: false, statedRecoveryScore: 11 });
  });

  it("hard safety still wins over a readiness decision", () => {
    const f = parseUserQuery("recovery 11, đau ngực và chóng mặt, vẫn tập nhé?", dante);
    expect(f.intent).toBe("SAFETY_SYMPTOM");
    expect(f.safetySignal).toBe(true);
  });

  it("Dante defers meal construction and pure food lookups to Gemma (reverse boundary)", () => {
    for (const q of ["build me a 600 kcal dinner", "tối nay ăn gì đủ 60g protein?", "macro cho cá tuyết"]) {
      const f = parseUserQuery(q, dante);
      expect(f.primaryDomain).toBe("NUTRITION");
      expect(dantePassesToGemma(f)).toBe(true);
    }
    expect(buildGemmaDeferralReply("vi")).toMatch(/Gemma/);
    expect(buildGemmaDeferralReply("en")).toMatch(/Gemma/);
  });

  it("Dante keeps nutrition FACTS that serve a training/recovery question, and every readiness question", () => {
    for (const q of ["is 200g cod enough protein after training?", DANTE_VI, DANTE_EN, "recovery 11 thấp hơn bình thường của tôi không?"]) {
      expect(dantePassesToGemma(parseUserQuery(q, dante))).toBe(false);
    }
  });
});

const checkin = (over: Partial<DanteCurrentRecovery> = {}): DanteCurrentRecovery => ({ hasCheckin: true, score: 11, status: "Recovery Priority", lowestDrivers: ["Sleep: 8/100"], painIllness: "no", trainingLoadState: "amber", ...over });

describe("Dante prompt block: grounded on CURRENT verified state", () => {
  it("states the verified score, names the conflict, mandates a decision, and forbids the baseline escape", async () => {
    const q = await buildDanteQueryContext(DANTE_VI, [], { currentRecovery: checkin() });
    const b = q.block ?? "";
    expect(b).toMatch(/intent=READINESS_RECOMMENDATION/);
    expect(b).toMatch(/VERIFIED check-in today.*score=11\/100/);
    expect(b).toMatch(/subjective_readiness=HIGH/);
    expect(b).toMatch(/evidence_state=PARTIALLY_IDENTIFIED: OBJECTIVE_RECOVERY_LOW \+ SUBJECTIVE_READINESS_HIGH/);
    expect(b).toMatch(/never answer this with 'not enough baseline'/);
    expect(b).toMatch(/not a medical measurement/);
    expect(b).toMatch(/recommended_decision=REDUCED_SESSION_WITH_READINESS_TEST/);
    expect(b).toMatch(/Do not default to full rest from one score/);
    expect(b).toMatch(/no PR or max/);
  });

  it("verified state outranks what the user typed", async () => {
    const q = await buildDanteQueryContext(DANTE_EN, [], { currentRecovery: checkin({ score: 38 }) });
    expect(q.block).toMatch(/score=38\/100/);
    expect(q.block).toMatch(/user_quoted_recovery=11 differs from the verified 38/);
  });

  it("with no check-in today the quoted number is self-reported and the user is told to log one", async () => {
    const q = await buildDanteQueryContext(DANTE_EN, [], { currentRecovery: checkin({ hasCheckin: false, score: null, status: null }) });
    expect(q.block).toMatch(/no check-in logged today.*self-reported, unverified/);
    expect(q.block).not.toMatch(/VERIFIED/);
  });

  it("a reported pain/illness check-in flags a real red flag", async () => {
    const q = await buildDanteQueryContext(DANTE_EN, [], { currentRecovery: checkin({ painIllness: "yes" }) });
    expect(q.block).toMatch(/real red flag/);
    const no = await buildDanteQueryContext(DANTE_EN, [], { currentRecovery: checkin({ painIllness: "no" }) });
    expect(no.block).not.toMatch(/real red flag/);
  });

  it("the decision is deterministic: low + feels low leans rest, red flag rests, fine trains", async () => {
    const lowFeelsLow = await buildDanteQueryContext("recovery 11 và mệt quá, nên tập không", [], { currentRecovery: checkin() });
    expect(lowFeelsLow.block).toMatch(/recommended_decision=LEAN_REST_OR_VERY_LIGHT_TECHNIQUE_ONLY/);
    const flag = await buildDanteQueryContext(DANTE_EN, [], { currentRecovery: checkin({ painIllness: "yes" }) });
    expect(flag.block).toMatch(/recommended_decision=REST_OR_CONSERVATIVE/);
    const fine = await buildDanteQueryContext("my recovery is 80 and I feel great, should I train?", [], { currentRecovery: checkin({ score: 80, status: "Good" }) });
    expect(fine.block).toMatch(/recommended_decision=TRAIN_WITH_NORMAL_AUTOREGULATION/);
  });

  it("a baseline question gets no decision mandate", async () => {
    const q = await buildDanteQueryContext("recovery 11 thấp hơn bình thường của tôi không?", [], { currentRecovery: checkin() });
    expect(q.block ?? "").not.toMatch(/readiness_decision/);
  });

  it("passes the interpreted state to Dante so 'buồn ngủ' is never re-read as sad/bored", async () => {
    const q = await buildDanteQueryContext("hôm nay buồn ngủ quá, nên tập không", [], { currentRecovery: checkin({ score: 62, status: "Moderate" }) });
    expect(q.block).toMatch(/SLEEPINESS=sleepy \/ drowsy \(NOT bored, NOT sad\)/);
  });
});
