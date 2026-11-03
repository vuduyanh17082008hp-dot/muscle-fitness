import { describe, expect, it } from "vitest";
import {
  checkCitationMismatch,
  checkDeterministicValueMutation,
  checkInventedAthleteMetric,
  checkSafetyAdherence,
} from "@/lib/dante-core/verifier/checks";
import type { VerifierInput } from "@/lib/dante-core/verifier/types";
import { buildKnownFactsFromContext } from "@/lib/dante-core/verifier/known-facts-from-context";

function baseInput(overrides: Partial<VerifierInput> = {}): VerifierInput {
  return {
    replyText: "",
    knownFacts: [],
    availableSources: [],
    safety: null,
    ...overrides,
  };
}

describe("checkSafetyAdherence", () => {
  it("returns no findings when safety was not triggered", () => {
    const findings = checkSafetyAdherence(baseInput({ replyText: "anything", safety: { triggered: false, responseOverride: null } }));
    expect(findings).toEqual([]);
  });

  it("returns no findings when the reply matches the required override verbatim", () => {
    const findings = checkSafetyAdherence(
      baseInput({
        replyText: "Please seek emergency care.",
        safety: { triggered: true, responseOverride: "Please seek emergency care." },
      }),
    );
    expect(findings).toEqual([]);
  });

  it("blocks when triggered but the reply deviates from the required override", () => {
    const findings = checkSafetyAdherence(
      baseInput({
        replyText: "Here's a training tip instead.",
        safety: { triggered: true, responseOverride: "Please seek emergency care." },
      }),
    );
    expect(findings).toEqual([{ code: "safety_override_violated", severity: "blocker", message: expect.any(String) }]);
  });
});

describe("checkDeterministicValueMutation", () => {
  it("passes when the stated number matches the known fact", () => {
    const findings = checkDeterministicValueMutation(
      baseInput({
        replyText: "Your readiness score is 63 today.",
        knownFacts: [{ label: "readinessScore", value: 63 }],
      }),
    );
    expect(findings).toEqual([]);
  });

  it("flags a mutated value when the stated number does not match", () => {
    const findings = checkDeterministicValueMutation(
      baseInput({
        replyText: "Your readiness score is 90 today.",
        knownFacts: [{ label: "readinessScore", value: 63 }],
      }),
    );
    expect(findings).toEqual([{ code: "deterministic_value_mutation", severity: "blocker", message: expect.any(String) }]);
  });

  it("does not flag anything when the label is never mentioned", () => {
    const findings = checkDeterministicValueMutation(
      baseInput({
        replyText: "Let's talk about your training split instead.",
        knownFacts: [{ label: "readinessScore", value: 63 }],
      }),
    );
    expect(findings).toEqual([]);
  });

  // H0 final closure: "protein" (consumed today) must not be judged against a protein target or a g/kg guideline.
  const consumed = [{ label: "protein", value: 45, cue: /\b(?:logged|so far|eaten|consumed)\b/i }];
  it("cued fact: a protein target / g-per-kg mention is not a statement of protein eaten", () => {
    for (const replyText of [
      "Your protein target is 160 g a day, about 1.6 to 2.2 g per kg of body weight.",
      "At 60 kg, aim for roughly 96 to 132 grams of protein per day.",
    ]) expect(checkDeterministicValueMutation(baseInput({ replyText, knownFacts: consumed }))).toEqual([]);
  });

  it("cued fact: the logged amount is verified wherever it is stated, and a wrong one is flagged", () => {
    expect(checkDeterministicValueMutation(baseInput({ replyText: "You've logged 45 g of protein so far, so about 115 g is left of your 160 g protein target.", knownFacts: consumed }))).toEqual([]);
    expect(checkDeterministicValueMutation(baseInput({ replyText: "So far you've logged 80 g of protein today.", knownFacts: consumed }))).toHaveLength(1);
  });

  it("accepts a fraction voiced as a percent", () => {
    const findings = checkDeterministicValueMutation(
      baseInput({
        replyText: "Your load adjustment is -5% this week.",
        knownFacts: [{ label: "loadAdjustment", value: -0.05 }],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("checkInventedAthleteMetric", () => {
  it("passes when the assertion is backed by a matching known fact", () => {
    const findings = checkInventedAthleteMetric(
      baseInput({
        replyText: "Your recovery is 72 right now.",
        knownFacts: [{ label: "recoveryScore", value: 72 }],
      }),
    );
    expect(findings).toEqual([]);
  });

  it("flags a specific metric assertion with no backing fact at all", () => {
    const findings = checkInventedAthleteMetric(
      baseInput({
        replyText: "Your HRV is 55 this morning.",
        knownFacts: [],
      }),
    );
    expect(findings).toEqual([{ code: "invented_athlete_metric", severity: "blocker", message: expect.any(String) }]);
  });

  it("does not flag ordinary training advice with no specific metric claim", () => {
    const findings = checkInventedAthleteMetric(
      baseInput({ replyText: "Aim for 8-12 reps per set at RIR 2.", knownFacts: [] }),
    );
    expect(findings).toEqual([]);
  });
});

describe("checkCitationMismatch", () => {
  it("blocks evidence language with zero retrieved sources", () => {
    const findings = checkCitationMismatch(
      baseInput({ replyText: "Research shows creatine improves strength.", availableSources: [] }),
    );
    expect(findings).toEqual([{ code: "citation_mismatch", severity: "blocker", message: expect.any(String) }]);
  });

  it("passes evidence language when at least one source was retrieved", () => {
    const findings = checkCitationMismatch(
      baseInput({
        replyText: "Research shows creatine improves strength.",
        availableSources: ["Kreider 2017 ISSN creatine stand"],
      }),
    );
    expect(findings).toEqual([]);
  });

  it("passes plain advice with no evidence language regardless of sources", () => {
    const findings = checkCitationMismatch(baseInput({ replyText: "Try adding an extra set next week.", availableSources: [] }));
    expect(findings).toEqual([]);
  });
});

// Nutrition acceptance 2026-10-23: replies observed live from gpt-4o-mini against a real food log
// (consumed 1335 kcal / 95.4 g protein, target 3220 kcal / 156 g → remaining 1885 kcal / 60.6 g).
describe("today's intake claims (live acceptance repros)", () => {
  const consumedCue = /\b(?:consumed|logged|eaten|ate|so far|intake (?:today|so far)|you'?ve had|have had)\b/i;
  const remainingCue = /\b(?:remaining|left|to go)\b/i;
  const facts = [
    { label: "calories", value: 1335, cue: consumedCue },
    { label: "protein", value: 95.4, cue: consumedCue },
    { label: "calories", value: 1885, cue: remainingCue },
    { label: "protein", value: 60.6, cue: remainingCue },
  ];
  const verify = (replyText: string, knownFacts: VerifierInput["knownFacts"] = facts) => [
    ...checkDeterministicValueMutation(baseInput({ replyText, knownFacts })),
    ...checkInventedAthleteMetric(baseInput({ replyText, knownFacts })),
  ];

  it("a correct total written with a thousands separator is not a mismatch", () => {
    expect(verify("You have consumed a total of 1,335 calories today.")).toEqual([]);
    expect(verify("You've consumed 1,335 calories today, so 1,885 calories remain... you have 1,885 calories left.")).toEqual([]);
  });

  it("consumed protein stated as remaining protein is flagged", () => {
    expect(verify("You have 95.4 grams of protein remaining for today based on your current nutrition plan.")).not.toEqual([]);
    expect(verify("You have 95.4 grams of protein left to reach your daily target of 156 grams.")).not.toEqual([]);
  });

  it("the correct remaining protein passes", () => {
    expect(verify("You have 61 grams of protein remaining for today.")).toEqual([]);
  });

  it("an intake total with filler words is an invented metric when the food log is unavailable", () => {
    expect(verify("You have consumed a total of 3,146 calories today.", [])).not.toEqual([]);
    expect(verify("You have consumed a total of **3,146 calories** so far today.", [])).not.toEqual([]);
  });

  it("food log unavailable: any figure worded as today's intake is blocked, however it is phrased", () => {
    const unavailable = buildKnownFactsFromContext({ recovery: null, todayFoodLog: { available: false, note: "Food log unavailable." } });
    for (const replyText of [
      "Your total calorie intake today is 3,126 calories, which includes breakfast: 920 calories.",
      "Your calorie intake today is 2,126 calories.",
      "You have consumed a total of **3,146 calories** so far today.",
    ]) expect(verify(replyText, unavailable)).not.toEqual([]);
    expect(verify("I can't read your food log right now, so I don't know what you've eaten today. Your target is 3,220 calories.", unavailable)).toEqual([]);
  });

  it("markdown emphasis does not hide a wrong remaining figure", () => {
    expect(verify("You have **95.4 grams of protein** remaining today.")).not.toEqual([]);
  });
});
