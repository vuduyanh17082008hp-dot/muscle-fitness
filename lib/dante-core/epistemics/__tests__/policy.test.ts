import { describe, expect, it } from "vitest";
import { buildEpistemicPolicyInstruction } from "@/lib/dante-core/epistemics/policy";

/**
 * The epistemic policy is prompt text, not executable classification
 * logic — an LLM applies it. These tests are a regression guard: they
 * assert the taxonomy/authority/confidence rules Phase 1 requires are
 * actually present in the instruction Dante receives, so a future
 * edit can't silently drop one. They do not (and cannot, without a
 * live model call) verify the model's actual output.
 *
 * Matching is done against whitespace-normalized text (hand-wrapped
 * prose has arbitrary line breaks mid-phrase) rather than the raw
 * multi-line string.
 */
describe("buildEpistemicPolicyInstruction", () => {
  const policy = buildEpistemicPolicyInstruction();
  const normalized = policy.replace(/\s+/g, " ");

  it("test 1-7: defines every taxonomy category", () => {
    expect(policy).toContain("SYSTEM FACT");
    expect(policy).toContain("USER REPORT");
    expect(policy).toContain("USER SUBJECTIVE REPORT");
    expect(policy).toContain("VERIFIED MEMORY");
    expect(policy).toContain("USER-CLAIMED MEMORY");
    expect(policy).toContain("MODEL INFERENCE");
    expect(policy).toContain("UNKNOWN");
  });

  it("distinguishes user-subjective-report from model-inference explicitly", () => {
    expect(normalized).toMatch(/is not an inference you made/i);
  });

  it("test: claimed memory can never become verified memory", () => {
    expect(normalized).toMatch(/never confirm it.*yes, i remember/i);
  });

  it("test 8/9: authority hierarchy for objective app state, with logged-vs-claimed distinction", () => {
    expect(normalized).toMatch(
      /live system data > verified persisted app data > user self-report > verified memory > model inference/i,
    );
    expect(policy).toContain("LOGGED STATE");
    expect(policy).toContain("REAL-WORLD CLAIM");
    // The phrase appears only as a prohibited example ("never say...").
    expect(normalized).toMatch(/never say "you are wrong"/i);
  });

  it("test 15: a high objective score never erases a subjective report", () => {
    expect(normalized).toMatch(/does not mean you should tell the client they aren't actually tired/i);
  });

  it("test 13: user estimates never become deterministic facts", () => {
    expect(normalized).toMatch(/never silently pick one and drop the other/i);
  });

  it("prevents casual psychological/clinical labeling", () => {
    expect(policy).toContain("perfectionist");
    expect(policy).toContain("obsessive");
    expect(policy).toContain("anxious");
    expect(policy).toContain("compulsive");
    expect(normalized).toMatch(/you are not a diagnostic system/i);
  });

  it("test 16: training-load state alone does not establish readiness", () => {
    expect(normalized).toMatch(/does not by itself establish readiness/i);
  });

  it("test 17: reinforces the never-invent-numbers invariant", () => {
    for (const term of [
      "recovery score",
      "readiness",
      "training load",
      "protein",
      "adherence",
      "sleep average",
      "working weight",
      "RIR",
      "adaptive recommendation",
      "memory record",
    ]) {
      expect(policy.toLowerCase()).toContain(term.toLowerCase());
    }
  });
});
