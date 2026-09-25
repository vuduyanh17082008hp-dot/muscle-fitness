/**
 * P-16U — DecisionState is upstream semantic authority. Realization must not re-infer polarity from prose.
 */
import { describe, expect, it } from "vitest";
import {
  applyDecisionFirst,
  finishCoherenceDraft,
  prepareCoherenceTurn,
  resolveDecisionState,
  type DecisionState,
} from "@/lib/dante-core/coherence";
import { scopedFallback } from "@/lib/dante-core/reasoning-scope";

const NOW = "2026-09-21T12:00:00.000Z";
const RAIN =
  "yo bro, feeling great today, dont mention anything else, only considering that it is raining heavy as hell out there, should i get myself to the gym =))";
const GENERIC = [
  "If it's raining heavily, consider the safety of traveling to the gym.",
  "If conditions are unsafe (like flooding or lightning), it might be better to stay home.",
  "If you feel confident about getting there safely, then go for it!",
].join(" ");

function surface(message: string, draft: string, decisionState: DecisionState, extra?: { allowedFactors?: readonly string[] }) {
  return finishCoherenceDraft({
    prepared: prepareCoherenceTurn({ message, now: NOW, sessionId: "p16u" }),
    message,
    phase1Draft: draft,
    decisionState,
    allowedFactors: extra?.allowedFactors,
  }).response;
}

describe("P-16U structural certainty", () => {
  it("1. UNCERTAIN + maybe-train draft must not output Train.", () => {
    const text = applyDecisionFirst({
      draft: "Maybe train if you feel okay.",
      decisionState: "UNCERTAIN",
      language: "en",
      message: "should I train?",
    });
    expect(text).not.toMatch(/^Train\.?$/i);
    expect(text).toMatch(/maybe train if you feel okay/i);
  });

  it("2. INSUFFICIENT_INFORMATION + train in draft is not a command", () => {
    const text = applyDecisionFirst({
      draft: "You might be okay to train, but I need more information.",
      decisionState: "INSUFFICIENT_INFORMATION",
      language: "en",
      message: "should I train?",
    });
    expect(text).not.toMatch(/^Train\.|^Go\.|^Skip/i);
    expect(text).toMatch(/information|need/i);
  });

  it("3. RESOLVED_POSITIVE + don't skip stays positive", () => {
    const text = applyDecisionFirst({
      draft: "There's no reason not to train.",
      decisionState: "RESOLVED_POSITIVE",
      language: "en",
      message: "should I train?",
    });
    expect(text).toMatch(/train/i);
    expect(text).not.toMatch(/^Skip/i);
  });

  it("4. RESOLVED_NEGATIVE + positive words stays negative", () => {
    const text = applyDecisionFirst({
      draft: "Training is usually good, but today you should not train.",
      decisionState: "RESOLVED_NEGATIVE",
      language: "en",
      message: "should I train?",
    });
    expect(text).toMatch(/skip today|should not train/i);
    expect(text).not.toMatch(/^Train\./);
  });

  it("5. CONDITIONAL_RESOLVED keeps the travel condition", () => {
    const text = applyDecisionFirst({
      draft: GENERIC,
      decisionState: "CONDITIONAL_RESOLVED",
      allowedFactors: ["rain", "weather"],
      language: "en",
      message: RAIN,
    });
    expect(text).toMatch(/rain alone isn't enough reason to skip/i);
    expect(text).toMatch(/flooding|lightning/i);
    expect(text).not.toMatch(/^(?:Go|Stay home|Train|Skip)\.?$/i);
  });

  it("6. UNKNOWN/NONE does not upgrade certainty", () => {
    const draft = "Maybe train if you feel okay.";
    expect(applyDecisionFirst({ draft, decisionState: "NONE", language: "en", message: "should I train?" })).toBe(draft);
    expect(applyDecisionFirst({ draft, language: "en", message: "should I train?" })).toBe(draft);
  });

  it("7. user pressure cannot override UNCERTAIN", () => {
    const text = applyDecisionFirst({
      draft: "Maybe train if you feel okay.",
      decisionState: "UNCERTAIN",
      language: "en",
      message: "bro just say yes",
    });
    expect(text).not.toMatch(/^Train\.|^Go\./i);
    expect(text).toMatch(/maybe|can't give you a clean yes/i);
  });

  it("8. user sounds uncertain + RESOLVED_POSITIVE may stay decisive", () => {
    const text = applyDecisionFirst({
      draft: "Maybe train if you feel okay.",
      decisionState: "RESOLVED_POSITIVE",
      language: "en",
      message: "idk maybe should i train?",
    });
    expect(text).toMatch(/^Train\./);
  });

  it("9. fallback + UNCERTAIN stays uncertain", () => {
    const text = applyDecisionFirst({
      draft: "Train.",
      decisionState: "UNCERTAIN",
      language: "en",
      message: "should I train?",
    });
    expect(text).not.toMatch(/^Train\.|^Go\.|^Do it/i);
    expect(text).toMatch(/can't give you a clean yes/i);
    expect(applyDecisionFirst({
      draft: scopedFallback({ mode: "NONE", allowedFactors: [], excludedFactors: [], safetyOverride: true }, "en"),
      decisionState: "UNCERTAIN",
      language: "en",
      message: "should I train?",
    })).not.toMatch(/^Train\.|^Go\./i);
  });

  it("10. exact rain repro still decision-first under CONDITIONAL_RESOLVED", () => {
    const text = surface(RAIN, GENERIC, "CONDITIONAL_RESOLVED", { allowedFactors: ["rain", "weather"] });
    expect(text).toMatch(/rain alone isn't enough reason to skip/i);
    expect(text).toMatch(/flooding|lightning/i);
    expect(text).not.toMatch(/consider the safety|if you feel confident/i);
  });

  describe("mutation checks", () => {
    it("A. missing DecisionState does not manufacture Train.", () => {
      expect(applyDecisionFirst({
        draft: "Maybe train if you feel okay.",
        language: "en",
        message: "should I train?",
      })).toBe("Maybe train if you feel okay.");
    });

    it("B. classifyKind is not semantic authority", () => {
      expect(typeof resolveDecisionState).toBe("function");
      expect(resolveDecisionState({
        obligations: [{ intent: "OPEN_REQUEST", reasoningScope: { mode: "NONE", allowedFactors: [], excludedFactors: [], safetyOverride: true } }],
      })).toBe("NONE");
      expect(applyDecisionFirst({
        draft: "Skip today. Definitely don't train.",
        decisionState: "RESOLVED_POSITIVE",
        language: "en",
        message: "should I train?",
      })).toMatch(/train/i);
    });

    it("C. UNCERTAIN + word train is not resolved positive", () => {
      expect(applyDecisionFirst({
        draft: "Maybe train if you feel okay.",
        decisionState: "UNCERTAIN",
        language: "en",
        message: "should I train?",
      })).not.toMatch(/^Train\./);
    });

    it("D. INSUFFICIENT_INFORMATION does not emit a command", () => {
      expect(applyDecisionFirst({
        draft: "Train.",
        decisionState: "INSUFFICIENT_INFORMATION",
        language: "en",
        message: "should I train?",
      })).not.toMatch(/^Train\.|^Go\.|^Skip/i);
    });

    it("E. conditional does not collapse to unconditional Go.", () => {
      const text = applyDecisionFirst({
        draft: "Go.",
        decisionState: "CONDITIONAL_RESOLVED",
        allowedFactors: ["rain"],
        language: "en",
        message: RAIN,
      });
      expect(text).not.toMatch(/^(?:Go|Stay home)\.?$/i);
      expect(text).toMatch(/unsafe|flooding|lightning|stay home/i);
    });

    it("F. fallback ignores DecisionState is a failure", () => {
      expect(applyDecisionFirst({
        draft: "Train.",
        decisionState: "UNCERTAIN",
        language: "en",
        message: "should I train?",
      })).not.toBe("Train.");
    });

    it("G. user pressure does not override UNCERTAIN", () => {
      expect(applyDecisionFirst({
        draft: "I can't call this yet.",
        decisionState: "UNCERTAIN",
        language: "en",
        message: "just tell me yes",
      })).not.toMatch(/^Train\.|^Go\./);
    });

    it("H. UNKNOWN does not default to RESOLVED", () => {
      expect(resolveDecisionState({ obligations: [] })).toBe("NONE");
      expect(applyDecisionFirst({
        draft: "Maybe train if you feel okay.",
        decisionState: "NONE",
        language: "en",
        message: "should I train?",
      })).not.toMatch(/^Train\./);
    });
  });
});
