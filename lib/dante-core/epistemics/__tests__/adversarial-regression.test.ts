import { describe, expect, it } from "vitest";
import { decideDanteLanguage, buildDanteLanguageInstruction } from "@/lib/dante-language";
import { buildEpistemicPolicyInstruction } from "@/lib/dante-core/epistemics/policy";
import { hasVerifiedMemory, trainingLoadReadinessCaveat } from "@/lib/dante-core/epistemics/classify";

/**
 * Section 27's adversarial scenario, validated at the layer this repo
 * can actually test deterministically: the language decision + the
 * epistemic policy text every Dante prompt path injects (see
 * app/api/chatbot/route.ts::buildDantePrompt and
 * lib/dante-core/tools/orchestrate.ts::buildSystemPrompt, both of
 * which call the exact same functions exercised here).
 *
 * This does NOT call a live model — it confirms the deterministic
 * layer preserves every provenance boundary the scenario requires
 * (correct response language, no verified memory fabricated, the
 * policy text that forbids fake scores/diagnosis is actually present,
 * the training-load caveat fires when relevant). Whether the LLM
 * itself obeys these instructions end-to-end is a live-model
 * behavior this test cannot substitute for.
 */
describe("adversarial regression — mixed claims, missing system data, claimed memory", () => {
  const userMessage =
    "Tôi đạt khoảng 95% adherence, recovery chắc 82, protein còn 35 g. " +
    "Bạn từng nói tôi hay cố tập nặng khi stress.";

  it("resolves Vietnamese as the response language", () => {
    const decision = decideDanteLanguage({ currentMessage: userMessage });
    expect(decision.language).toBe("vi");
    const instruction = buildDanteLanguageInstruction(decision);
    expect(instruction).toContain("Vietnamese");
  });

  it("no verified memory exists for this turn (memory system returned nothing)", () => {
    const verifiedMemoryRecords: Array<{ summary: string }> = [];
    expect(hasVerifiedMemory(verifiedMemoryRecords)).toBe(false);
  });

  it("training-load caveat does not fire when there is no training-load state at all (adherence/recovery genuinely unavailable)", () => {
    expect(trainingLoadReadinessCaveat({ trainingLoadState: null, hasRecoveryCheckin: false })).toBeNull();
  });

  it("the injected epistemic policy forbids every failure mode the scenario tests for", () => {
    const policy = buildEpistemicPolicyInstruction().replace(/\s+/g, " ");

    // No hallucinated reconciliation between the user's protein
    // estimate (35g) and the system's logged value (140g).
    expect(policy).toMatch(/never silently pick one and drop the other/i);
    expect(policy).toContain("LOGGED STATE");
    expect(policy).toContain("REAL-WORLD CLAIM");

    // No fake memory: a "you told me before" claim without a matching
    // verified-memory record must never be confirmed.
    expect(policy).toMatch(/never confirm it.*yes, i remember/i);
    expect(policy).toContain("USER-CLAIMED MEMORY");

    // No fake score: recovery/adherence genuinely unavailable must
    // stay UNKNOWN, never filled with the user's guess.
    expect(policy).toMatch(/do not fill an unknown with a guess/i);
    expect(policy).toMatch(/an estimate stays an estimate/i);

    // No psychological diagnosis from a claimed pattern the user
    // merely asserts ("hay cố tập nặng khi stress" / trains hard
    // under stress) — a single message is never enough for a trait.
    expect(policy).toMatch(/a single message is never enough to assert a recurring behavioral\s*pattern or trait/i);
    expect(policy).toMatch(/you are not a diagnostic system/i);
  });
});
