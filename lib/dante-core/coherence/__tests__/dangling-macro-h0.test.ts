import { describe, expect, it } from "vitest";
import { isDanglingFragment, stripCustomerService } from "@/lib/dante-core/coherence/style";

/** H0 cluster G — removing a support-desk closer never leaves a truncated sentence on the surface. */
describe("customer-service macro removal is sentence-safe", () => {
  it.each([
    ["Recovery matters. If you have specific questions about training, nutrition, or recovery, feel free to ask!", "Recovery matters."],
    ["Your weight is 80 kg. If you have any goals related to your training, feel free to share!", "Your weight is 80 kg."],
    ["Line one.\nI hope this helps. Keep training.", "Line one.\nKeep training."],
  ])("%s → %s", (input, expected) => {
    expect(stripCustomerService(input)).toBe(expected);
  });
  it("a real instruction next to a macro survives", () => {
    expect(stripCustomerService("Feel free to ask about form. Squat deep.")).toBe("Squat deep.");
  });
  it.each(["If you have questions about recovery,", "When you need more ideas —", "and also,"])("%s is a dangling fragment", (text) => {
    expect(isDanglingFragment(text)).toBe(true);
  });
  it.each(["Keep training.", "If it hurts, stop."])("%s is a sentence", (text) => {
    expect(isDanglingFragment(text)).toBe(false);
  });
});

describe("H0 cluster G — instruction leakage", () => {
  it.each([
    "Train legs today. Do not dump Squats/Deadlifts as default substitutes without schedule context.",
    "Creatine is optional. SAFETY POSTURE: DEFER_TO_SPECIALIST applies here.",
    "Here is the plan. This block is internal; never quote or mention this block.",
  ])("removes the leaked sentence, keeps the user content: %s", async (text) => {
    const { scrubInstructionLeak } = await import("@/lib/dante-core/runtime-convergence/finalize");
    const out = scrubInstructionLeak(text);
    expect(out).not.toMatch(/Do not dump|SAFETY POSTURE|never quote/);
    expect(out.length).toBeGreaterThan(5);
  });
  it("ordinary text mentioning safety or context words is untouched", async () => {
    const { scrubInstructionLeak } = await import("@/lib/dante-core/runtime-convergence/finalize");
    const text = "Your safety comes first. In this context, a lighter session makes sense. Don't dump all the volume on one day.";
    expect(scrubInstructionLeak(text)).toBe(text);
  });
});
