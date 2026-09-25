import { describe, expect, it } from "vitest";
import {
  buildExperimentProposal,
  buildLearningEvidenceNote,
  evaluateNof1Experiment,
} from "@/lib/dante-core/nof1-engine";

describe("nof1 — evaluation", () => {
  const durableId = "77777777-7777-4777-8777-777777777777";

  it("SUPPORTS with MODERATE confidence on clean directional outcome", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: durableId,
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    const completed = evaluateNof1Experiment({
      experiment,
      outcomeReport: {
        sleepImproved: true,
        volumeHeld: true,
        rpeImproved: true,
        performanceImproved: true,
      },
      confounderCount: 0,
      protocolAdherence: "COMPLETE",
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.conclusion?.result).toBe("SUPPORTS");
    expect(completed.conclusion?.confidence).toBe("MODERATE");
    expect(completed.conclusion?.reasons.join(" ")).not.toMatch(/statistically significant|\bproved\b/i);
    expect(completed.conclusion?.reasons.join(" ")).toMatch(/does not establish causality/i);
  });

  it("DOES_NOT_SUPPORT when sleep improved but performance unchanged", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: durableId,
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    const completed = evaluateNof1Experiment({
      experiment,
      outcomeReport: {
        sleepImproved: true,
        volumeHeld: true,
        performanceUnchanged: true,
      },
      confounderCount: 0,
      protocolAdherence: "COMPLETE",
    });
    expect(completed.conclusion?.result).toBe("DOES_NOT_SUPPORT");
  });

  it("INSUFFICIENT_EVIDENCE when outcome missing — no fabricated success", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: durableId,
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    const completed = evaluateNof1Experiment({
      experiment,
      outcomeReport: { missingOutcome: true },
      confounderCount: 0,
      protocolAdherence: "COMPLETE",
    });
    expect(completed.conclusion?.result).toBe("INCONCLUSIVE");
    expect(completed.conclusion?.confidence).toBe("INSUFFICIENT_EVIDENCE");
    expect(completed.status).toBe("ACTIVE");
    expect(completed.completedAt).toBeUndefined();
  });

  it("does not fake completion without a durable active identity", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    const evaluated = evaluateNof1Experiment({
      experiment,
      outcomeReport: { sleepImproved: true, volumeHeld: true, rpeImproved: true },
      confounderCount: 0,
      protocolAdherence: "COMPLETE",
    });
    expect(evaluated.status).toBe("ACTIVE");
    expect(evaluated.completedAt).toBeUndefined();
    expect(evaluated.conclusion?.result).toBe("INCONCLUSIVE");
    expect(evaluated.conclusion?.confidence).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("learning note refuses permanent rule promotion", () => {
    const experiment = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      status: "COMPLETED" as const,
      userConfirmed: true,
      conclusion: {
        result: "SUPPORTS" as const,
        confidence: "MODERATE" as const,
        reasons: ["directional"],
      },
    };
    expect(buildLearningEvidenceNote(experiment)).toMatch(/not promote|permanent rule/i);
  });
});
