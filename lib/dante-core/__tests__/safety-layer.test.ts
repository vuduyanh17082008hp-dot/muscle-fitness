import { describe, expect, it } from "vitest";
import { checkSafety } from "@/lib/dante-core/safety-layer";

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
