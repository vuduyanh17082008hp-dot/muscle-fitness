import type { NOf1Experiment, Nof1EligibilityResult } from "@/lib/dante-core/nof1-engine/types";
import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";

/**
 * Deterministic user-facing replies.
 * Internal enums stay in engine state; client copy stays natural.
 */
function naturalize(text: string, language: "en" | "vi"): string {
  return scrubInternalJargon(text, language);
}

export function buildNof1ProposalReply(
  experiment: NOf1Experiment,
  language: "en" | "vi",
): string {
  const days = experiment.experimentWindow.durationDays;
  if (language === "vi") {
    return [
      "Hiện mình chưa tách được nguyên nhân vì các biến đang đổi cùng lúc — bằng chứng còn không chắc.",
      `Nếu ông muốn, mình có thể chạy một micro-experiment ${days} ngày: giữ ${experiment.controlledVariables.join(", ")} gần ổn định, chỉ tập trung thay ${experiment.variableUnderTest}.`,
      `Chỉ số theo dõi chính: ${experiment.primaryOutcome}.`,
      "Đây không phải nghiên cứu y khoa và không tự kích hoạt — ông xác nhận rõ thì mình mới coi là test đang chạy.",
      "Ông có muốn làm test này không?",
    ].join("\n\n");
  }
  return [
    "I can't isolate the cause yet because key variables are moving together — the evidence is still unclear.",
    `If you want, we can run a ${days}-day micro-experiment: keep ${experiment.controlledVariables.join(", ")} approximately stable, and focus only on changing ${experiment.variableUnderTest}.`,
    `Primary outcome: ${experiment.primaryOutcome}.`,
    "This is not a formal research study and it will not activate until you explicitly confirm.",
    "Want me to track that as a test?",
  ].join("\n\n");
}

export function buildNof1TooEarlyReply(language: "en" | "vi"): string {
  if (language === "vi") {
    return "Một buổi tệ đơn lẻ chưa đủ để mở một micro-experiment. Cần thêm vài quan sát lặp lại trước khi test có kiểm soát có ý nghĩa.";
  }
  return "One rough session is not enough to justify a micro-experiment. We need more repeated observations before a controlled test is useful.";
}

export function buildNof1UnsafeReply(language: "en" | "vi"): string {
  if (language === "vi") {
    return "Mình không chạy experiment kiểu khiêu khích đau / tăng tải overhead khi pattern kích ứng đang elevated. An toàn đứng trên test.";
  }
  return "I will not run a pain-provocation or heavier-overhead experiment while an elevated irritation pattern is active. Safety outranks testing.";
}

export function buildNof1AcceptedReply(experiment: NOf1Experiment, language: "en" | "vi"): string {
  if (language === "vi") {
    return naturalize(
      `Ok — test ${experiment.experimentWindow.durationDays} ngày đang chạy. Giữ ${experiment.controlledVariables.join(", ")} gần ổn định; biến đang test là ${experiment.variableUnderTest}. Ông có thể hủy bất cứ lúc nào.`,
      language,
    );
  }
  return `Got it — the ${experiment.experimentWindow.durationDays}-day test is underway. Keep ${experiment.controlledVariables.join(", ")} roughly stable; variable under test is ${experiment.variableUnderTest}. You can cancel anytime.`;
}

export function buildNof1AssumedConsentReply(language: "en" | "vi"): string {
  if (language === "vi") {
    return "Mình chưa kích hoạt experiment. Cần xác nhận rõ (ví dụ: \"ok, làm test 7 ngày\") — \"làm gì cũng được\" không đủ để bypass confirmation.";
  }
  return "I have not activated an experiment. I need an explicit yes (e.g. \"ok, let's do the 7-day test\") — \"do whatever\" does not bypass confirmation.";
}

export function buildNof1ConfoundedReply(experiment: NOf1Experiment, language: "en" | "vi"): string {
  const list = experiment.confounders.join(", ");
  if (language === "vi") {
    return `Tuần này bị nhiễu quá nhiều để kết luận chắc: ${list} đổi material trong cửa sổ test. Mình chưa gọi là thất bại, và không rút kết luận mạnh.`;
  }
  return `This window is not clean enough to interpret confidently: ${list} changed materially during the test. That is not \"failed\", and I will not force a conclusion.`;
}

export function buildNof1CompletionReply(experiment: NOf1Experiment, language: "en" | "vi"): string {
  const conclusion = experiment.conclusion;
  if (!conclusion) {
    return language === "vi"
      ? "Test đã tới hạn nhưng chưa có outcome đủ rõ."
      : "The test window ended without a clear outcome report.";
  }

  if (language === "vi") {
    const map = {
      SUPPORTS: "kết quả đang nghiêng về giả thuyết đó cho cửa sổ này",
      DOES_NOT_SUPPORT: "kết quả chưa nghiêng về giả thuyết đó cho cửa sổ này",
      INCONCLUSIVE: "kết quả chưa đủ để nghiêng rõ",
    } as const;
    return [
      `Kết quả micro-experiment: ${map[conclusion.result]} (độ tin ${conclusion.confidence}).`,
      conclusion.reasons.join(" "),
      "Đây là bằng chứng n-of-1 có kiểm soát — không phải kết luận nhân quả chắc chắn, không promote thành rule vĩnh viễn.",
    ].join("\n\n");
  }

  const map = {
    SUPPORTS: "leans toward the hypothesis for this window",
    DOES_NOT_SUPPORT: "does not lean toward the hypothesis for this window",
    INCONCLUSIVE: "is inconclusive for this window",
  } as const;

  return [
    `Micro-experiment result ${map[conclusion.result]} (confidence ${conclusion.confidence}).`,
    conclusion.reasons.join(" "),
    "This is controlled n-of-1 evidence — not causal certainty, and not a permanent rule.",
  ].join("\n\n");
}

export function buildNof1CancelledReply(language: "en" | "vi"): string {
  return language === "vi"
    ? "Đã hủy experiment. Không sao — không có penalty."
    : "Experiment cancelled. No problem — no penalty.";
}

export function buildNof1ConfounderRecordedReply(
  experiment: NOf1Experiment,
  language: "en" | "vi",
): string {
  const latest = experiment.confounders.at(-1) ?? "protocol deviation";
  return language === "vi"
    ? `Đã nhận ra ${latest} là một lệch protocol của test đang chạy. Chưa đủ để kết luận; tiếp tục giữ các biến còn lại ổn định và mình sẽ tính nó khi đánh giá.`
    : `I recognized ${latest} as a protocol deviation in the test currently underway. It is not enough for a conclusion; keep the remaining variables stable and it will be accounted for at evaluation.`;
}

export function buildNof1ProgressReply(language: "en" | "vi"): string {
  return language === "vi"
    ? "RPE/performance này thuộc test đang chạy. Chưa đánh dấu xong từ một log giữa kỳ; cần kết thúc cửa sổ và dữ liệu outcome có thể so sánh trước khi đánh giá."
    : "That RPE/performance entry belongs to the test currently underway. A mid-window log does not mark it complete; evaluation waits for the end of the window and comparable outcome data.";
}

export function buildNof1StatusReply(experiment: NOf1Experiment, language: "en" | "vi"): string {
  const details = language === "vi"
    ? `Biến test: ${experiment.variableUnderTest}. Giữ ổn định: ${experiment.controlledVariables.join(", ")}. Chỉ số chính: ${experiment.primaryOutcome}. Cửa sổ: ${experiment.experimentWindow.durationDays} ngày.`
    : `Variable under test: ${experiment.variableUnderTest}. Control: ${experiment.controlledVariables.join(", ")}. Primary outcome: ${experiment.primaryOutcome}. Window: ${experiment.experimentWindow.durationDays} days.`;

  const statusCopy =
    language === "vi"
      ? ({
          PROPOSED: "được đề xuất nhưng chưa bắt đầu",
          ACCEPTED: "đã chấp nhận, chờ kích hoạt",
          ACTIVE: "đang chạy",
          CONFOUNDED: "tuần này bị nhiễu quá nhiều để kết luận chắc",
          COMPLETED: "đã kết thúc",
          CANCELLED: "đã hủy",
          ABORTED: "đã dừng vì an toàn",
          ACTIVATION_FAILED: "chưa chạy vì bước lưu thất bại",
        } as Record<string, string>)
      : ({
          PROPOSED: "suggested but not started",
          ACCEPTED: "accepted, waiting to start",
          ACTIVE: "currently underway",
          CONFOUNDED: "too noisy this week to conclude cleanly",
          COMPLETED: "completed",
          CANCELLED: "cancelled",
          ABORTED: "stopped for safety",
          ACTIVATION_FAILED: "not started because saving failed",
        } as Record<string, string>);

  if (experiment.status === "ACTIVATION_FAILED") {
    return language === "vi"
      ? `Test được đề xuất nhưng chưa chạy vì bước lưu thất bại. ${details}`
      : `The proposed test was not activated because the save failed. ${details}`;
  }

  return language === "vi"
    ? `Test hiện ${statusCopy[experiment.status] ?? "đang theo dõi"}. ${details}`
    : `The experiment is ${statusCopy[experiment.status] ?? experiment.status}. ${details}`;
}

export function buildNof1InactiveLifecycleReply(language: "en" | "vi"): string {
  return language === "vi"
    ? "Experiment chưa từng chạy vì bước lưu thất bại, nên mình không ghi lệch protocol hay kết quả cho test này. Hãy nói “Retry” để dùng lại proposal."
    : "The experiment never became active because activation failed, so no confounder or outcome was recorded. Say “Retry” to reuse the proposal.";
}

export function buildNof1InsufficientOutcomeReply(language: "en" | "vi"): string {
  return language === "vi"
    ? "Chưa có dữ liệu outcome chính, nên bằng chứng hiện tại chưa đủ. Experiment chưa được đánh dấu hoàn thành và mình không suy diễn kết quả."
    : "The primary outcome data is missing, so the evidence is still insufficient. The experiment was not marked completed, and no result was inferred.";
}

export function buildNof1EligibilityReply(
  eligibility: Nof1EligibilityResult,
  experiment: NOf1Experiment | null,
  language: "en" | "vi",
): string | null {
  if (eligibility.blockedBySafety || eligibility.blockedByRisk) {
    return buildNof1UnsafeReply(language);
  }
  if (eligibility.tooEarly) {
    return buildNof1TooEarlyReply(language);
  }
  if (eligibility.eligible && experiment) {
    return buildNof1ProposalReply(experiment, language);
  }
  return null;
}
