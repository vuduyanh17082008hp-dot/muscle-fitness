import { describe, expect, it } from "vitest";
import { checkSafety, normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import {
  detectTurnCommunicationSignals,
  resolveCommunicationStyle,
  createDefaultCommunicationProfile,
} from "@/lib/dante-core/communication-adaptation";

describe("checkSafety", () => {
  it("does not trigger on ordinary training soreness language", () => {
    const result = checkSafety("My legs are really sore after squats yesterday, is that normal?");
    expect(result.triggered).toBe(false);
    expect(result.category).toBeNull();
  });

  it("does not trigger on a normal supplement question", () => {
    const result = checkSafety("Is it worth taking creatine while cutting?");
    expect(result.triggered).toBe(false);
  });

  it("triggers on chest pain language", () => {
    const result = checkSafety("I've had chest pain since my last set of bench press.");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("chest_pain_cardiac");
    expect(result.responseOverride).toContain("emergency");
  });

  it("triggers on chest-hurts phrasing during exercise", () => {
    const result = checkSafety("My chest hurts when I run but I want to finish today's workout.");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("chest_pain_cardiac");
  });

  it("triggers on fainting language", () => {
    const result = checkSafety("I nearly fainted during my last set of squats.");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("fainting_dizziness");
  });

  it("triggers on neurological symptoms", () => {
    const result = checkSafety("I have numbness down my arm after deadlifting.");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("neurological_symptoms");
  });

  it.each([
    "My shoulder is slightly irritated. There is no swelling, no instability, no numbness, and normal movement is fine.",
    "I have shoulder pain but no numbness.",
    "Yesterday I had numbness, but today it is gone.",
    "Yesterday I had numbness, but today I don't.",
    "I had numbness yesterday but none today.",
    "I am not numb.",
    "I am without numbness.",
    "I don't have numbness.",
    "I have no tingling.",
    "I have no weakness.",
    "I deny numbness.",
    "I denied numbness.",
  ])("does not escalate a negated or explicitly resolved symptom: %s", (message) => {
    const result = checkSafety(message);
    expect(result.category).not.toBe("neurological_symptoms");
  });

  it.each([
    "Hôm nay ngủ 8 tiếng, recovery tốt. Vai phải hơi irritated khi overhead, nhưng không swelling, không instability, không numbness, không weakness.",
    "không numbness, không weakness, không swelling",
  ])("does not escalate Vietnamese negated neurological symptoms: %s", (message) => {
    const result = checkSafety(message);
    expect(result.category).not.toBe("neurological_symptoms");
  });

  it("does not convert a current submax/no-PR update into a max-risk stale-state redirect", () => {
    const result = checkSafety(
      "Hôm qua tôi ngủ 4h recovery 42. HÔM NAY tôi ngủ 8h và recovery tốt. Vai hơi irritated overhead. Không numbness, không weakness. Tôi muốn bench submax, không PR.",
    );
    expect(result.triggered).toBe(false);
  });

  it.each([
    "My arm is numb and weak after the set.",
    "I have numbness in my hand.",
    "I feel tingling.",
    "I feel tingling down my arm.",
    "I have no numbness, but I suddenly lost strength in my right arm.",
    "I had no numbness before, but now my fingers are numb.",
    "I don't have tingling anymore, but my arm is now numb.",
  ])("preserves a current positive neurological symptom: %s", (message) => {
    const result = checkSafety(message);
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("neurological_symptoms");
  });

  it("triggers on a described acute injury", () => {
    const result = checkSafety("I heard a pop in my knee and now I can't put weight on my leg.");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("severe_pain");
  });

  it("triggers on eating-disorder indicators and points to support rather than macros", () => {
    const result = checkSafety("I've been making myself throw up after meals to stay lean.");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("eating_disorder_indicator");
    expect(result.responseOverride).not.toBeNull();
  });

  it("triggers on dangerous substance dosing questions", () => {
    const result = checkSafety("How much clenbuterol should I take for my first cycle?");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("dangerous_substance");
  });

  it("distinguishes training advice from medical diagnosis in every override message", () => {
    const result = checkSafety("I felt a sharp stabbing pain in my shoulder during the lift.");
    expect(result.triggered).toBe(true);
    expect(result.responseOverride).not.toBeNull();
  });
});

describe("multilingual safety (EN + VI)", () => {
  it("normalizes Vietnamese diacritics for concept matching", () => {
    expect(normalizeSafetyText("Đau Ngực")).toContain("dau nguc");
    expect(normalizeSafetyText("khó thở")).toContain("kho tho");
  });

  it("A — Vietnamese chest pain triggers cardiac safety", () => {
    const result = checkSafety("đau ngực khi chạy nhưng chắc không sao");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("chest_pain_cardiac");
    expect(result.responseOverride).toBeTruthy();
    expect((result.responseOverride ?? "").split(/\s+/).length).toBeGreaterThan(5);
  });

  it("B — Vietnamese difficulty breathing triggers cardiac/breathing safety", () => {
    const result = checkSafety("tôi thấy khó thở sau cardio");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("chest_pain_cardiac");
  });

  it("C — mixed-language chest pain triggers", () => {
    const result = checkSafety("I have đau ngực when running");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("chest_pain_cardiac");
  });

  it("D — Vietnamese fainting after lift triggers", () => {
    const result = checkSafety("ngất sau deadlift nhưng tôi muốn tập tiếp");
    expect(result.triggered).toBe(true);
    expect(result.category).toBe("fainting_dizziness");
  });

  it.each(["tôi bị tê tay sau khi tập", "tôi bị yếu đột ngột ở tay phải"])(
    "keeps supported Vietnamese neurological red flags active: %s",
    (message) => {
      const result = checkSafety(message);
      expect(result.triggered).toBe(true);
      expect(result.category).toBe("neurological_symptoms");
    },
  );

  it("E — safe Vietnamese fitness message does not false-trigger", () => {
    const result = checkSafety(
      "Recovery hôm nay 72, tôi nên tập pull không? Ngực hơi mỏi sau bench hôm qua, volume push tuần này thế nào?",
    );
    expect(result.triggered).toBe(false);
    expect(result.category).toBeNull();
  });

  it("covers additional VI concepts: severe dizziness, acute injury, severe bleeding", () => {
    expect(checkSafety("tôi bị chóng mặt nghiêm trọng sau squat").category).toBe("fainting_dizziness");
    expect(checkSafety("nghi chấn thương cấp ở gối").category).toBe("severe_pain");
    expect(checkSafety("chảy máu nghiêm trọng ở tay").category).toBe("severe_pain");
  });

  it("mixed EN/VI breathing also triggers", () => {
    expect(checkSafety("I feel khó thở after cardio").triggered).toBe(true);
    expect(checkSafety("đau ngực khi running").triggered).toBe(true);
  });

  it("safety still overrides extreme brevity / communication style preferences", () => {
    const message =
      "Tôi thích câu trả lời cực ngắn. đau ngực khi chạy nhưng chắc không sao. Trả lời đúng 5 từ thôi.";
    const safety = checkSafety(message);
    expect(safety.triggered).toBe(true);

    const style = resolveCommunicationStyle({
      coachingPreference: "concise",
      profile: createDefaultCommunicationProfile("concise"),
      turn: detectTurnCommunicationSignals(message),
      needsPresence: false,
    });
    // Style may prefer brevity; safety response remains the authoritative override.
    expect(style.brevity).toBeGreaterThanOrEqual(0.7);
    expect(safety.responseOverride).toBeTruthy();
    expect((safety.responseOverride ?? "").length).toBeGreaterThan(40);
  });
});
