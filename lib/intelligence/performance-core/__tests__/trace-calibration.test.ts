/**
 * H0 closure — trace calibration. The trace is a server-computed ASSERTION about the answer, never ground truth, and it
 * must not be green for an incomplete answer or red for a complete one. Labeled cases from the known false positives /
 * false negatives of the detectors. No field here is model self-reported.
 */
import { describe, expect, it } from "vitest";
import { buildAnswerTrace, buildIntelligenceBrief, obligationDisposition, tierContradictions } from "@/lib/intelligence/performance-core";
import { candidateCompleteness } from "@/lib/intelligence/performance-core/candidates";

const brief = (message: string) => buildIntelligenceBrief({ message, coach: "DANTE", canRetrieve: true });
const evidence = (reply: string, message = "does creatine improve strength?") => obligationDisposition("ASSESS_EVIDENCE", reply, brief(message), message);

describe("evidence-line detector", () => {
  it.each([
    "There's no established evidence that it improves sleep in people who aren't deficient.",
    "It is not well-supported for testosterone.",
    "The evidence for creatine and strength is strong.",
    "Research is mixed on this.",
    "Studies show a modest effect on strength.",
    "It has been studied for high-intensity efforts.",
    // Live 2026-10-16 (magnesium sleep): a correct calibrated answer the detector reported as missing.
    "Whether it can help with sleep in individuals who are not deficient is not firmly established.",
    "There is currently no verified evidence that magnesium supplementation improves sleep quality in individuals who are not deficient in magnesium.",
  ])("former false NEGATIVE (complete answer reported missing): %s", (reply) => {
    expect(evidence(reply)).toBe("ANSWERED");
  });

  it.each([
    "Mix 5 g into water every day.",
    "On a limited budget, buy creatine first.",
    "I studied this a lot when I started lifting.",
  ])("former false POSITIVE (no assessment reported answered): %s", (reply) => {
    expect(evidence(reply)).toBeNull();
  });
});

describe("candidate completeness and tier consistency are judged on the rendered reply", () => {
  const b = brief("creatine, whey, bcaa, eaa, zinc, magnesium, omega 3, multivitamin - rank these for me");

  it("a candidate named only inside another word is not rendered", () => {
    expect(candidateCompleteness("Creatine first. Whey if short. Zinc, magnesium, multivitamin depend on diet. Omega 3 if no fish. EAA usually skip.", b.candidates).missing).toEqual(["bcaa"]);
  });

  it("trace: PRODUCED (draft) vs VERIFIED (detectors) vs RENDERED (final text) — the trace reads the final text", () => {
    const draft = "Creatine first.";
    const rendered = "Creatine first. Whey, BCAA, EAA, zinc, magnesium, omega 3 and a multivitamin depend on your diet.";
    const produced = buildAnswerTrace({ message: "x", brief: b, violationCodes: [], missing: [], retryCount: 0, reply: draft });
    const final = buildAnswerTrace({ message: "x", brief: b, violationCodes: [], missing: [], retryCount: 0, reply: rendered });
    expect(produced.candidateCompleteness).toBe("FAIL");
    expect(final.candidateCompleteness).toBe("PASS");
  });

  it("tier consistency: a contradiction is reported, conditional wording is not", () => {
    expect(tierContradictions("BCAA is a must-buy.", b)).toHaveLength(1);
    expect(tierContradictions("BCAA only matters if your protein intake is low.", b)).toHaveLength(0);
  });
});
