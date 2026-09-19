import { describe, expect, it } from "vitest";
import {
  abortExperimentForSafety,
  buildExperimentProposal,
  processNof1Turn,
  isUnsafeExperimentRequest,
} from "@/lib/dante-core/nof1-engine";
import { checkSafety } from "@/lib/dante-core/safety-layer";

describe("nof1 — safety", () => {
  it("rejects unsafe experiment framing", () => {
    expect(isUnsafeExperimentRequest("Let's experiment with heavier overhead press through pain.")).toBe(true);
  });

  it("safety interruption aborts active experiment and defers reply", () => {
    const prior = {
      experiment: {
        ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
        status: "ACTIVE" as const,
        userConfirmed: true,
      },
      lastProposalId: "x",
    };
    const message = "My chest hurts and I nearly fainted.";
    expect(checkSafety(message).triggered).toBe(true);
    const turn = processNof1Turn({
      priorSession: prior,
      message,
      language: "en",
      safetyTriggered: true,
    });
    expect(turn.deferredToSafety).toBe(true);
    expect(turn.session.experiment?.status).toBe("ABORTED");
    expect(turn.reply).toBeNull();
  });

  it("abortExperimentForSafety sets ABORTED", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    expect(abortExperimentForSafety(experiment).status).toBe("ABORTED");
  });
});
