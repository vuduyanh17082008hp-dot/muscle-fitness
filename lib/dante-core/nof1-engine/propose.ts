import type { NOf1Experiment, Nof1Trigger } from "@/lib/dante-core/nof1-engine/types";

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86400000).toISOString();
}

/**
 * Build a PROPOSED experiment. Never marks userConfirmed.
 * Controlled variables mean "try to keep similar" — not system locks.
 */
export function buildExperimentProposal(input: {
  trigger: Nof1Trigger;
  now?: Date;
  durationDays?: number;
  language?: "en" | "vi";
}): NOf1Experiment {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const durationDays = input.durationDays ?? 7;
  const id = `nof1:${createdAt}:${input.trigger}`;

  if (input.trigger === "COMPETING_CAUSES" || input.trigger === "CONFOUNDED_BUT_CONTROLLABLE") {
    return {
      id,
      templateId: "SLEEP_VS_VOLUME",
      hypothesis:
        input.language === "vi"
          ? "Khi giữ volume gần như ổn định, cải thiện ngủ có liên quan tới hiệu suất/RPE tốt hơn."
          : "When training volume is held approximately stable, improving sleep is associated with better performance/RPE.",
      rationale:
        input.language === "vi"
          ? "Sleep và volume đang đổi cùng lúc nên chưa tách được nguyên nhân."
          : "Sleep and volume are moving together, so the cause cannot be isolated yet.",
      controlledVariables: ["training volume"],
      variableUnderTest: "sleep duration",
      primaryOutcome: "RPE / performance at comparable training sessions",
      secondaryOutcomes: ["recovery score"],
      experimentWindow: {
        start: createdAt,
        end: addDays(createdAt, durationDays),
        durationDays,
      },
      confounders: [],
      status: "PROPOSED",
      userConfirmed: false,
      createdAt,
    };
  }

  if (input.trigger === "REPEATED_PREDICTION_ERROR" || input.trigger === "PERSISTENT_UNCERTAINTY") {
    return {
      id,
      templateId: "GENERIC_CONTROLLABLE",
      hypothesis:
        input.language === "vi"
          ? "Khi giữ các biến khác gần ổn định, thay đổi có kiểm soát một biến chính sẽ làm rõ hướng bằng chứng."
          : "Holding other variables approximately stable while changing one primary variable will improve evidence directionality.",
      rationale:
        input.language === "vi"
          ? "Có bất định lặp lại / lỗi dự đoán lặp — một micro-experiment ngắn có thể cải thiện chất lượng bằng chứng."
          : "Repeated uncertainty or prediction mismatch — a short micro-experiment may improve evidence quality.",
      controlledVariables: ["training volume", "exercise selection"],
      variableUnderTest: "sleep duration",
      primaryOutcome: "RPE / performance at comparable sessions",
      experimentWindow: {
        start: createdAt,
        end: addDays(createdAt, durationDays),
        durationDays,
      },
      confounders: [],
      status: "PROPOSED",
      userConfirmed: false,
      createdAt,
    };
  }

  // Fallback — should not be called when ineligible.
  return {
    id,
    templateId: "GENERIC_CONTROLLABLE",
    hypothesis: "A bounded controllable observation may clarify the unresolved question.",
    rationale: "Eligibility path requested a proposal.",
    controlledVariables: ["training volume"],
    variableUnderTest: "sleep duration",
    primaryOutcome: "RPE at comparable sessions",
    experimentWindow: {
      start: createdAt,
      end: addDays(createdAt, durationDays),
      durationDays,
    },
    confounders: [],
    status: "PROPOSED",
    userConfirmed: false,
    createdAt,
  };
}
