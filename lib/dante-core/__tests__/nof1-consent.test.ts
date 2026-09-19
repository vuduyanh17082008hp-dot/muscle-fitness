import { describe, expect, it } from "vitest";
import {
  applyConsent,
  buildExperimentProposal,
  detectsAssumedConsent,
  detectsExplicitAccept,
  detectsMaybe,
  processNof1Turn,
  createEmptyNof1Session,
} from "@/lib/dante-core/nof1-engine";

describe("nof1 — consent", () => {
  it("Maybe does not activate", () => {
    expect(detectsMaybe("Maybe.")).toBe(true);
    const proposal = buildExperimentProposal({ trigger: "COMPETING_CAUSES" });
    const result = applyConsent(proposal, "Maybe.");
    expect(result.activated).toBe(false);
    expect(result.experiment.status).toBe("PROPOSED");
    expect(result.experiment.userConfirmed).toBe(false);
  });

  it("explicit yes marks ACCEPTED intent, not durable ACTIVE", () => {
    expect(detectsExplicitAccept("Yes, let's do it.")).toBe(true);
    const proposal = buildExperimentProposal({ trigger: "COMPETING_CAUSES" });
    const result = applyConsent(proposal, "Yes, let's do it.");
    expect(result.activated).toBe(true);
    expect(result.experiment.status).toBe("ACCEPTED");
    expect(result.experiment.userConfirmed).toBe(false);
  });

  it("turn processor keeps PROPOSED until Confirm write", () => {
    const prior = {
      ...createEmptyNof1Session(),
      experiment: buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
    };
    const turn = processNof1Turn({
      priorSession: prior,
      message: "Yes, let's do it.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.needsWriteConfirmation).toBe(true);
    expect(turn.session.experiment?.status).toBe("PROPOSED");
    expect(turn.session.experiment?.userConfirmed).toBe(false);
  });

  it("do whatever does not silently activate", () => {
    expect(detectsAssumedConsent("Do whatever you think.")).toBe(true);
    const proposal = buildExperimentProposal({ trigger: "COMPETING_CAUSES" });
    const result = applyConsent(proposal, "Do whatever you think.");
    expect(result.activated).toBe(false);
    expect(result.assumedConsentBlocked).toBe(true);
    expect(result.experiment.status).toBe("PROPOSED");
  });

  it("turn processor refuses assumed consent with a clear reply", () => {
    const prior = {
      ...createEmptyNof1Session(),
      experiment: buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
    };
    const turn = processNof1Turn({
      priorSession: prior,
      message: "Do whatever you think.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.session.experiment?.status).toBe("PROPOSED");
    expect(turn.reply).toMatch(/not activated|explicit yes|confirmation/i);
  });
});
