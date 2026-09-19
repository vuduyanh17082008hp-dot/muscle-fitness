import { describe, expect, it } from "vitest";
import {
  buildExperimentProposal,
  evaluateNof1Eligibility,
  processNof1Turn,
  createEmptyNof1Session,
} from "@/lib/dante-core/nof1-engine";

describe("nof1 engine — core", () => {
  it("proposes a sleep-vs-volume micro-experiment for competing causes", () => {
    const message =
      "Performance has been worse, but my sleep dropped and volume went up. Which one is causing it?";
    const eligibility = evaluateNof1Eligibility({
      message,
      safetyTriggered: false,
      confidenceHasLowCausal: true,
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.trigger).toBe("COMPETING_CAUSES");

    const proposal = buildExperimentProposal({ trigger: eligibility.trigger, durationDays: 7 });
    expect(proposal.status).toBe("PROPOSED");
    expect(proposal.userConfirmed).toBe(false);
    expect(proposal.variableUnderTest).toMatch(/sleep/i);
    expect(proposal.controlledVariables).toContain("training volume");
    expect(proposal.primaryOutcome).toMatch(/RPE|performance/i);
  });

  it("keeps controlled variables as approximate stability, not system locks", () => {
    const proposal = buildExperimentProposal({ trigger: "COMPETING_CAUSES" });
    expect(proposal.controlledVariables.length).toBeGreaterThan(0);
    expect(proposal.rationale.toLowerCase()).not.toMatch(/locked|forbidden/);
  });

  it("does not activate on empty session noise", () => {
    const result = processNof1Turn({
      priorSession: createEmptyNof1Session(),
      message: "What should I eat after training?",
      language: "en",
      safetyTriggered: false,
    });
    expect(result.reply).toBeNull();
    expect(result.session.experiment).toBeNull();
  });
});
