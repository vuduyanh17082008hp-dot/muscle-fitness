import { describe, expect, it } from "vitest";
import { MAX_VERIFIER_RETRIES, runVerifiedGeneration, verifyFinalResponse } from "@/lib/dante-core/verifier";
import type { VerifierInput } from "@/lib/dante-core/verifier/types";

describe("MAX_VERIFIER_RETRIES", () => {
  it("is exactly 2, per spec", () => {
    expect(MAX_VERIFIER_RETRIES).toBe(2);
  });
});

describe("verifyFinalResponse", () => {
  it("passes clean text with no findings and a null correction brief", () => {
    const result = verifyFinalResponse({
      replyText: "Reduce bench volume by 25% this week.",
      knownFacts: [],
      availableSources: [],
      safety: null,
    });

    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.correctionBrief).toBeNull();
  });

  it("aggregates findings from multiple checks and builds a correction brief", () => {
    const result = verifyFinalResponse({
      replyText: "Your readiness score is 90. Research shows this means you should push harder.",
      knownFacts: [{ label: "readinessScore", value: 63 }],
      availableSources: [],
      safety: null,
    });

    expect(result.passed).toBe(false);
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(["citation_mismatch", "deterministic_value_mutation"].sort());
    expect(result.correctionBrief).toContain("deterministic_value_mutation");
    expect(result.correctionBrief).toContain("citation_mismatch");
  });
});

describe("runVerifiedGeneration", () => {
  const buildInput = (replyText: string): VerifierInput => ({
    replyText,
    knownFacts: [{ label: "readinessScore", value: 63 }],
    availableSources: [],
    safety: null,
  });

  it("returns on the first attempt when generation already passes", async () => {
    const generate = async () => "Your readiness score is 63 today.";

    const result = await runVerifiedGeneration(generate, buildInput, () => "fallback");

    expect(result.attempts).toBe(1);
    expect(result.usedFallback).toBe(false);
    expect(result.verifier.passed).toBe(true);
  });

  it("retries with the correction brief and succeeds on the second attempt", async () => {
    const receivedBriefs: Array<string | null> = [];

    const generate = async (correctionBrief: string | null) => {
      receivedBriefs.push(correctionBrief);
      return correctionBrief === null ? "Your readiness score is 90 today." : "Your readiness score is 63 today.";
    };

    const result = await runVerifiedGeneration(generate, buildInput, () => "fallback");

    expect(result.attempts).toBe(2);
    expect(result.usedFallback).toBe(false);
    expect(receivedBriefs).toHaveLength(2);
    expect(receivedBriefs[0]).toBeNull();
    expect(receivedBriefs[1]).toContain("deterministic_value_mutation");
  });

  it("falls back to deterministic output after exhausting all retries, and never loops unboundedly", async () => {
    let callCount = 0;
    const generate = async () => {
      callCount += 1;
      return "Your readiness score is 999 today.";
    };

    const result = await runVerifiedGeneration(generate, buildInput, () => "Readiness: 63 (deterministic fallback).");

    expect(callCount).toBe(MAX_VERIFIER_RETRIES + 1);
    expect(result.attempts).toBe(MAX_VERIFIER_RETRIES + 1);
    expect(result.usedFallback).toBe(true);
    expect(result.replyText).toBe("Readiness: 63 (deterministic fallback).");
    expect(result.verifier.passed).toBe(true);
  });
});
