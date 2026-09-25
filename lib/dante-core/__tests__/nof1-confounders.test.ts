import { describe, expect, it } from "vitest";
import {
  applyConfoundersToExperiment,
  buildExperimentProposal,
  detectConfoundersFromMessage,
  processNof1Turn,
} from "@/lib/dante-core/nof1-engine";

describe("nof1 — confounders", () => {
  it("detects alcohol and calorie change", () => {
    const found = detectConfoundersFromMessage(
      "Hôm qua tôi đi nhậu và hôm nay lại tăng calories khá nhiều.",
    );
    expect(found).toEqual(expect.arrayContaining(["alcohol", "calorie_change"]));
  });

  it("marks ACTIVE experiment CONFOUNDED on material multi-confounders", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    const next = applyConfoundersToExperiment(experiment, ["alcohol", "calorie_change"]);
    expect(next.status).toBe("CONFOUNDED");
    expect(next.confounders).toEqual(expect.arrayContaining(["alcohol", "calorie_change"]));
  });

  it("turn reply explains confounded ≠ failed", () => {
    const prior = {
      experiment: {
        ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
        status: "ACTIVE" as const,
        userConfirmed: true,
      },
      lastProposalId: "x",
    };
    const turn = processNof1Turn({
      priorSession: prior,
      message: "Hôm qua tôi đi nhậu và hôm nay lại tăng calories khá nhiều.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.session.experiment?.status).toBe("CONFOUNDED");
    expect(turn.reply).toMatch(/not clean|not .*failed|nhiễu|không rút kết luận|will not force a conclusion/i);
    expect(turn.reply).not.toMatch(/\bCONFOUNDED\b/);
  });
});
