/**
 * P-16P — DecisionState is written on the production reasoning path and
 * consumed by realization. No applyDecisionFirst override.
 */
import { describe, expect, it } from "vitest";
import * as decisionFirst from "@/lib/dante-core/coherence/decision-first";
import {
  applyDecisionFirst,
  decideObligationDecisionState,
  finishCoherenceDraft,
  prepareCoherenceTurn,
  resolveDecisionState,
} from "@/lib/dante-core/coherence";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";

const NOW = "2026-09-21T12:00:00.000Z";
const POSITIVE =
  "I'm recovered, today is my planned push session, I have no pain and nothing unusual. Should I train?";
const NEGATIVE =
  "Today is my planned rest day and there is no reason to change it. Should I train anyway?";
const RAIN =
  "yo bro, feeling great today, dont mention anything else, only considering that it is raining heavy as hell out there, should i get myself to the gym =))";
const UNCERTAIN_MSG = "I feel weird but can't describe it. Should I train?";
const INSUFFICIENT_MSG = "Cái kia thì sao?";
const INFO = "What is progressive overload?";
const GENERIC = [
  "If it's raining heavily, consider the safety of traveling to the gym.",
  "If conditions are unsafe (like flooding or lightning), it might be better to stay home.",
  "If you feel confident about getting there safely, then go for it!",
].join(" ");

function production(message: string, draft?: string, extra?: { forceRepairFail?: boolean }) {
  const prepared = prepareCoherenceTurn({
    message,
    now: NOW,
    sessionId: "p16p",
    forceRepairFail: extra?.forceRepairFail,
  });
  const input = draft !== undefined
    ? { prepared, message, phase1Draft: draft }
    : { prepared, message };
  expect(input).not.toHaveProperty("decisionState");
  const finished = finishCoherenceDraft(input);
  return {
    prepared,
    finished,
    written: prepared.analysis.obligations.find((o) => o.intent === "OPEN_REQUEST")?.decisionState ?? "NONE",
    resolved: resolveDecisionState({
      obligations: prepared.analysis.obligations,
      handled: finished.handledObligations,
    }),
  };
}

describe("P-16P production decision propagation", () => {
  it("A. production positive writes RESOLVED_POSITIVE and realizes Train.", () => {
    const turn = production(POSITIVE, "You might consider training today if you feel up to it.");
    expect(turn.written).toBe("RESOLVED_POSITIVE");
    expect(turn.resolved).toBe("RESOLVED_POSITIVE");
    expect(turn.finished.response).toMatch(/^Train\./);
    expect(turn.finished.response).not.toMatch(/you might consider/i);
  });

  it("B. production negative writes RESOLVED_NEGATIVE and realizes Skip.", () => {
    const turn = production(NEGATIVE, "It depends. You might still train if you feel like it.");
    expect(turn.written).toBe("RESOLVED_NEGATIVE");
    expect(turn.resolved).toBe("RESOLVED_NEGATIVE");
    expect(turn.finished.response).toMatch(/skip today/i);
    expect(turn.finished.response).not.toMatch(/^it depends/i);
  });

  it("C. production rain/weather writes CONDITIONAL_RESOLVED from scope+decision, not rain-name", () => {
    const turn = production(RAIN, GENERIC);
    expect(turn.written).toBe("CONDITIONAL_RESOLVED");
    expect(turn.resolved).toBe("CONDITIONAL_RESOLVED");
    expect(turn.finished.response).toMatch(/rain alone isn't enough reason to skip/i);
    expect(turn.finished.response).toMatch(/flooding|lightning/i);
    expect(resolveDecisionState({
      obligations: [{
        intent: "OPEN_REQUEST",
        reasoningScope: { mode: "ONLY", allowedFactors: ["rain", "weather"], excludedFactors: [], safetyOverride: true },
      }],
    })).toBe("NONE");
  });

  it("D. production ambiguity writes UNCERTAIN and does not force Train.", () => {
    const draft = "That's too vague to call. What feels weird — pain, dizziness, or just low motivation?";
    const turn = production(UNCERTAIN_MSG, draft);
    expect(turn.written).toBe("UNCERTAIN");
    expect(turn.resolved).toBe("UNCERTAIN");
    expect(turn.finished.response).toMatch(/weird|descri|dizziness|motivation/i);
    expect(turn.finished.response).not.toMatch(/^Train\.|^Skip today/i);
  });

  it("E. production clarification writes INSUFFICIENT_INFORMATION", () => {
    const turn = production(INSUFFICIENT_MSG, "Train.");
    expect(turn.written).toBe("INSUFFICIENT_INFORMATION");
    expect(turn.resolved).toBe("INSUFFICIENT_INFORMATION");
    expect(turn.finished.response).not.toMatch(/^Train\.|^Go\.|^Skip/i);
    expect(turn.finished.response).toMatch(/need more information|say it a bit more|I am not sure/i);
  });

  it("F. informational question stays NONE", () => {
    const draft = "Progressive overload is gradually increasing training stress over time.";
    const turn = production(INFO, draft);
    expect(turn.written).toBe("NONE");
    expect(turn.resolved).toBe("NONE");
    expect(turn.finished.response).toMatch(/progressive overload/i);
    expect(turn.finished.response).not.toMatch(/^Train\.|^Skip today/i);
  });

  describe("mutation checks", () => {
    it("A. production assignment is the source of POSITIVE/NEGATIVE", () => {
      const cts = extractCurrentTurnState(POSITIVE);
      const obl = production(POSITIVE).prepared.analysis.obligations.find((o) => o.intent === "OPEN_REQUEST");
      expect(obl?.decisionState).toBe("RESOLVED_POSITIVE");
      expect(decideObligationDecisionState(obl ?? {}, cts)).toBe("RESOLVED_POSITIVE");
      expect(resolveDecisionState({ obligations: [{ intent: "OPEN_REQUEST" }] })).toBe("NONE");
    });

    it("B. positive production does not fall back to NONE", () => {
      expect(production(POSITIVE).resolved).not.toBe("NONE");
      expect(production(POSITIVE).resolved).toBe("RESOLVED_POSITIVE");
    });

    it("C. negative production does not fall back to NONE", () => {
      expect(production(NEGATIVE).resolved).not.toBe("NONE");
      expect(production(NEGATIVE).resolved).toBe("RESOLVED_NEGATIVE");
    });

    it("D. realization does not derive polarity from draft text", () => {
      expect(applyDecisionFirst({
        draft: "Train.",
        decisionState: "UNCERTAIN",
        language: "en",
        message: UNCERTAIN_MSG,
      })).not.toMatch(/^Train\./);
      expect("classifyKind" in decisionFirst).toBe(false);
    });

    it("E. DecisionState is not dropped between reasoning and realization", () => {
      const turn = production(POSITIVE, "You might consider training.");
      expect(turn.written).toBe(turn.resolved);
      expect(turn.written).toBe("RESOLVED_POSITIVE");
      expect(turn.finished.response).toMatch(/^Train\./);
    });

    it("F. fallback consumes the propagated state", () => {
      const turn = production(UNCERTAIN_MSG, "Train.", { forceRepairFail: true });
      expect(turn.resolved).toBe("UNCERTAIN");
      expect(turn.finished.response).not.toMatch(/^Train\.|^Go\./i);
    });

    it("G. informational answer is not marked resolved", () => {
      expect(production(INFO).written).toBe("NONE");
      expect(production(INFO).resolved).toBe("NONE");
    });

    it("H. UNCERTAIN is not upgraded to resolved", () => {
      const turn = production(UNCERTAIN_MSG, "Maybe train if you feel okay.");
      expect(turn.resolved).toBe("UNCERTAIN");
      expect(turn.finished.response).not.toMatch(/^Train\./);
    });
  });
});
