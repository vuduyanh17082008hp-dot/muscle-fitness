import { describe, expect, it } from "vitest";
import {
  detectNof1Trigger,
  evaluateNof1Eligibility,
  buildExperimentProposal,
  buildNof1ProposalReply,
} from "@/lib/dante-core/nof1-engine";

describe("nof1 — multilingual", () => {
  it("Vietnamese competing-causes trigger", () => {
    const message =
      "Ba tuần gần đây performance lúc tốt lúc tệ. Sleep và volume cũng đổi cùng lúc. Tôi không biết cái nào gây ra.";
    expect(detectNof1Trigger(message)).toBe("COMPETING_CAUSES");
    expect(evaluateNof1Eligibility({ message, safetyTriggered: false }).eligible).toBe(true);
  });

  it("English test-whether language maps to proposal copy", () => {
    const message = "Let's test whether better sleep improves my training. Sleep and volume keep changing together.";
    const eligibility = evaluateNof1Eligibility({ message, safetyTriggered: false });
    expect(eligibility.eligible).toBe(true);
    const proposal = buildExperimentProposal({ trigger: eligibility.trigger, language: "en" });
    const reply = buildNof1ProposalReply(proposal, "en");
    expect(reply).toMatch(/micro-experiment|not a formal research study/i);
  });

  it("mixed language sleep test intent", () => {
    const message = "thử 7 ngày xem ngủ nhiều hơn có giúp performance không — volume đang đổi cùng sleep";
    expect(evaluateNof1Eligibility({ message, safetyTriggered: false }).eligible).toBe(true);
  });
});
