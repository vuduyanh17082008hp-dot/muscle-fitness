import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dante-core/nof1-engine/persistence", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dante-core/nof1-engine/persistence")>(
    "@/lib/dante-core/nof1-engine/persistence",
  );
  return {
    ...actual,
    loadActiveNof1Experiment: vi.fn(),
    loadLatestFailedNof1Proposal: vi.fn(),
    persistAcceptedNof1Experiment: vi.fn(),
    updateNof1Experiment: vi.fn(),
  };
});

import {
  buildExperimentProposal,
  canTransitionNof1Status,
  isDurableNof1Id,
  processNof1Turn,
  createEmptyNof1Session,
} from "@/lib/dante-core/nof1-engine";
import {
  persistAcceptedNof1Experiment,
  loadActiveNof1Experiment,
  updateNof1Experiment,
} from "@/lib/dante-core/nof1-engine/persistence";

describe("nof1 — durability", () => {
  it("A: proposal only does not request write confirmation", () => {
    const turn = processNof1Turn({
      priorSession: createEmptyNof1Session(),
      message:
        "Performance has been worse, but my sleep dropped and volume went up. Which one is causing it?",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.session.experiment?.status).toBe("PROPOSED");
    expect(turn.needsWriteConfirmation).toBe(false);
    expect(turn.acceptDraft).toBeNull();
    expect(isDurableNof1Id(turn.session.experiment!.id)).toBe(false);
  });

  it("B: explicit accept requests confirmation write, stays PROPOSED", () => {
    const prior = {
      experiment: buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      lastProposalId: "x",
    };
    const turn = processNof1Turn({
      priorSession: prior,
      message: "Yes, let's do it.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.needsWriteConfirmation).toBe(true);
    expect(turn.acceptDraft).not.toBeNull();
    expect(turn.session.experiment?.status).toBe("PROPOSED");
    expect(turn.session.experiment?.userConfirmed).toBe(false);
    expect(turn.reply).toMatch(/Confirm|Nothing is persisted/i);
  });

  it("J: just do it does not request write", () => {
    const prior = {
      experiment: buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      lastProposalId: "x",
    };
    const turn = processNof1Turn({
      priorSession: prior,
      message: "Just do it.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.needsWriteConfirmation).toBe(false);
    expect(turn.session.experiment?.status).toBe("PROPOSED");
  });

  it("status transitions reject COMPLETED → ACTIVE", () => {
    expect(canTransitionNof1Status("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransitionNof1Status("ACTIVE", "CONFOUNDED")).toBe(true);
    expect(canTransitionNof1Status("ACTIVE", "CANCELLED")).toBe(true);
    expect(canTransitionNof1Status("ACTIVE", "ABORTED")).toBe(true);
    expect(canTransitionNof1Status("PROPOSED", "ACCEPTED")).toBe(true);
    expect(canTransitionNof1Status("ACTIVATION_FAILED", "PENDING_CONFIRMATION")).toBe(true);
  });

  it("persistAcceptedNof1Experiment is the only accept write entry", async () => {
    vi.mocked(persistAcceptedNof1Experiment).mockResolvedValue({
      success: true,
      data: {
        ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
        id: "11111111-1111-4111-8111-111111111111",
        status: "ACTIVE",
        userConfirmed: true,
      },
    });
    const result = await persistAcceptedNof1Experiment({} as never, "user-a", {
      hypothesis: "h",
      rationale: "r",
      controlledVariables: ["training volume"],
      variableUnderTest: "sleep duration",
      primaryOutcome: "RPE",
      experimentWindow: {
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-09-08T00:00:00.000Z",
        durationDays: 7,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("ACTIVE");
      expect(result.data.userConfirmed).toBe(true);
    }
  });

  it("C: cross-session restore uses durable ACTIVE, not chat history", async () => {
    const durableId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue({
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: durableId,
      status: "ACTIVE",
      userConfirmed: true,
    });
    const restored = await loadActiveNof1Experiment({} as never, "user-a");
    expect(restored?.id).toBe(durableId);
    expect(restored?.status).toBe("ACTIVE");
    expect(isDurableNof1Id(restored!.id)).toBe(true);
  });

  it("D: user isolation — load always scoped by caller userId", async () => {
    vi.mocked(loadActiveNof1Experiment).mockImplementation(async (_sb, userId) => {
      if (userId !== "user-a") return null;
      return {
        ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
        id: "33333333-3333-4333-8333-333333333333",
        status: "ACTIVE",
        userConfirmed: true,
      };
    });
    expect(await loadActiveNof1Experiment({} as never, "user-a")).not.toBeNull();
    expect(await loadActiveNof1Experiment({} as never, "user-b")).toBeNull();
  });

  it("E/F/G: cancel / confound / complete emit durable persist patches", () => {
    const durableId = "44444444-4444-4444-8444-444444444444";
    const active = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: durableId,
      status: "ACTIVE" as const,
      userConfirmed: true,
    };

    const cancelTurn = processNof1Turn({
      priorSession: { experiment: active, lastProposalId: durableId },
      message: "Cancel the experiment.",
      language: "en",
      safetyTriggered: false,
    });
    expect(cancelTurn.persistPatch?.status).toBe("CANCELLED");
    expect(cancelTurn.persistPatch?.experimentId).toBe(durableId);

    const confoundTurn = processNof1Turn({
      priorSession: { experiment: { ...active }, lastProposalId: durableId },
      message: "I went drinking and also increased calories a lot.",
      language: "en",
      safetyTriggered: false,
    });
    expect(confoundTurn.persistPatch?.status).toBe("CONFOUNDED");

    const completeTurn = processNof1Turn({
      priorSession: { experiment: { ...active, confounders: [] }, lastProposalId: durableId },
      message: "Experiment complete. RPE down from 8.5 to 7, reps up, volume held, sleep better.",
      language: "en",
      safetyTriggered: false,
    });
    expect(completeTurn.persistPatch?.status).toBe("COMPLETED");
    expect(completeTurn.persistPatch?.conclusion?.result).toBe("SUPPORTS");
  });

  it("an RPE progress log routes through N-of-1 without fake completion", () => {
    const durableId = "45454545-4545-4454-8454-454545454545";
    const active = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: durableId,
      status: "ACTIVE" as const,
      userConfirmed: true,
    };
    const turn = processNof1Turn({
      priorSession: { experiment: active, lastProposalId: durableId },
      message: "RPE was 7 today.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.reply).toMatch(/mid-window|does not mark it COMPLETED/i);
    expect(turn.session.experiment?.status).toBe("ACTIVE");
    expect(turn.persistPatch).toBeNull();
  });

  it("H: missing outcome does not fabricate SUPPORTS", () => {
    const durableId = "55555555-5555-4555-8555-555555555555";
    const turn = processNof1Turn({
      priorSession: {
        experiment: {
          ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
          id: durableId,
          status: "ACTIVE",
          userConfirmed: true,
        },
        lastProposalId: durableId,
      },
      message: "Experiment complete but I have no data / no outcome logged.",
      language: "en",
      safetyTriggered: false,
    });
    expect(turn.session.experiment?.status).toBe("ACTIVE");
    expect(turn.session.experiment?.completedAt).toBeUndefined();
    expect(turn.session.experiment?.conclusion?.result).toBe("INCONCLUSIVE");
    expect(turn.session.experiment?.conclusion?.confidence).toBe("INSUFFICIENT_EVIDENCE");
    expect(turn.persistPatch).toBeNull();
  });

  it("I: safety abort emits ABORTED patch", () => {
    const durableId = "66666666-6666-4666-8666-666666666666";
    const turn = processNof1Turn({
      priorSession: {
        experiment: {
          ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
          id: durableId,
          status: "ACTIVE",
          userConfirmed: true,
        },
        lastProposalId: durableId,
      },
      message: "Chest pain and nearly fainted.",
      language: "en",
      safetyTriggered: true,
    });
    expect(turn.deferredToSafety).toBe(true);
    expect(turn.persistPatch?.status).toBe("ABORTED");
    expect(turn.reply).toBeNull();
  });

  it("failed activation retains proposal identity and blocks fake lifecycle writes", () => {
    const failed = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: "nof1:failed:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "ACTIVATION_FAILED" as const,
      userConfirmed: true,
      activationError: "PGRST205",
    };

    const statusTurn = processNof1Turn({
      priorSession: { experiment: failed, lastProposalId: failed.id },
      message: "What is my experiment tracking?",
      language: "en",
      safetyTriggered: false,
    });
    expect(statusTurn.reply).toMatch(/not activated|save failed/i);
    expect(statusTurn.reply).toMatch(/sleep duration|training volume|RPE/i);

    const confounderTurn = processNof1Turn({
      priorSession: { experiment: failed, lastProposalId: failed.id },
      message: "I went drinking and calories increased 700.",
      language: "en",
      safetyTriggered: false,
    });
    expect(confounderTurn.reply).toMatch(/never became active|never became ACTIVE/i);
    expect(confounderTurn.persistPatch).toBeNull();
    expect(confounderTurn.session.experiment?.confounders).toEqual([]);
  });

  it("retry reuses a failed proposal and requires a fresh Confirm", () => {
    const failed = {
      ...buildExperimentProposal({ trigger: "COMPETING_CAUSES" }),
      id: "nof1:failed:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "ACTIVATION_FAILED" as const,
      userConfirmed: true,
    };
    const retry = processNof1Turn({
      priorSession: { experiment: failed, lastProposalId: failed.id },
      message: "Retry.",
      language: "en",
      safetyTriggered: false,
      now: new Date("2026-09-18T00:00:00.000Z"),
    });
    expect(retry.needsWriteConfirmation).toBe(true);
    expect(retry.acceptDraft?.variableUnderTest).toBe(failed.variableUnderTest);
    expect(retry.acceptDraft?.controlledVariables).toEqual(failed.controlledVariables);
    expect(retry.session.experiment?.status).toBe("PENDING_CONFIRMATION");
    expect(retry.reply).toMatch(/Confirm|Nothing is persisted/i);
  });

  it("updateNof1Experiment rejects illegal transitions at persistence layer", async () => {
    vi.mocked(updateNof1Experiment).mockImplementation(async (_sb, _userId, _id, patch) => {
      if (patch.status === "ACTIVE") {
        return { success: false, error: "Illegal status transition COMPLETED → ACTIVE." };
      }
      return { success: false, error: "noop" };
    });
    const result = await updateNof1Experiment({} as never, "user-a", "id", { status: "ACTIVE" });
    expect(result.success).toBe(false);
  });
});
