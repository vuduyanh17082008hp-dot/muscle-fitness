export type ActionStatus = "SUGGESTED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "EXECUTED" | "FAILED";

const COMPLETION_CLAIM_PATTERN =
  /(?:^|[.!?]\s+|\n)(?:tôi|mình|i)\s+(?:sẽ\s+(?:tiến hành\s+)?|đã\s+|have\s+|will\s+)(?:thay đổi|cập nhật|điều chỉnh|lưu|change|update|adjust|save|modify)[^.!?\n]*/giu;

const COMPLETION_CLAIM_INLINE =
  /(?:tôi|mình|i)\s+(?:sẽ\s+(?:tiến hành\s+)?|đã\s+|have\s+|will\s+)(?:thay đổi|cập nhật|điều chỉnh|lưu|change|update|adjust|save|modify)[^.!?\n]*/giu;

const FALSE_COMPLETION_LEFTOVERS =
  /(?:^|\n)\s*(?:ngay bây giờ|ngay lập tức|right now|immediately)[.!]?\s*/giu;

/**
 * Detects user intent to mutate a saved workout/program.
 * Unicode-safe: does not rely on ASCII `\b` after Vietnamese verbs.
 */
export function isWorkoutMutationRequest(message: string): boolean {
  const text = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");

  return (
    /(?:doi|sua|thay doi|cap nhat|luu|change|modify|update|adjust|rewrite|replace|edit).{0,80}(?:workout|program|plan|buoi|bai tap|chest|nguc)/i.test(
      text,
    ) ||
    /(?:workout|program|plan|buoi|bai tap|chest|nguc).{0,50}(?:doi|sua|thay doi|cap nhat|change|update|adjust|rewrite)/i.test(
      text,
    )
  );
}

export function resolveActionStatus(input: {
  pendingConfirmation: unknown;
  executedWrite?: boolean;
  failed?: boolean;
}): ActionStatus {
  if (input.failed) return "FAILED";
  if (input.executedWrite) return "EXECUTED";
  if (input.pendingConfirmation) return "PENDING_CONFIRMATION";
  return "SUGGESTED";
}

function scrubFalseCompletionClaims(reply: string): string {
  return reply
    .replace(COMPLETION_CLAIM_PATTERN, (match, offset: number) => (offset === 0 ? "" : match[0] === "\n" ? "\n" : ". "))
    .replace(COMPLETION_CLAIM_INLINE, "")
    .replace(FALSE_COMPLETION_LEFTOVERS, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[.\s]+/, "")
    .replace(/\s+\./g, ".")
    .trim();
}

export function guardActionResponse(
  reply: string,
  status: ActionStatus,
  language: "en" | "vi",
): string {
  if (status === "EXECUTED" || status === "CONFIRMED") return reply;

  const cleaned = status === "SUGGESTED" || status === "FAILED"
    ? scrubFalseCompletionClaims(reply)
    : reply;

  if (status === "PENDING_CONFIRMATION") {
    const scrubbedPending = scrubFalseCompletionClaims(cleaned);
    if (/(?:confirm|confirmation|xác nhận|xac nhan|cancel|hủy|huy)/i.test(scrubbedPending)) {
      return scrubbedPending;
    }
    return language === "vi"
      ? `${scrubbedPending}\n\nThay đổi này đang chờ xác nhận; chưa có gì được lưu.`
      : `${scrubbedPending}\n\nThis change is pending confirmation; nothing has been saved yet.`;
  }

  if (status === "FAILED") {
    const failNotice = language === "vi"
      ? "Yêu cầu thay đổi chưa được thực hiện."
      : "The requested change was not completed.";
    return cleaned ? `${failNotice}\n\n${cleaned}` : failNotice;
  }

  const notice = language === "vi"
    ? "Đây là bản tôi đề xuất cho hôm nay. Tôi chưa thay đổi chương trình đã lưu. Nếu ông muốn lưu thay đổi này, tôi vẫn cần ông xác nhận."
    : "This is a proposed workout only. I have not changed the saved program. Saving it still requires your explicit confirmation.";
  return cleaned ? `${notice}\n\n${cleaned}` : notice;
}

/** Deterministic proposal when the user demands an unconfirmed workout write. */
export function buildSuggestedWorkoutChangeReply(language: "en" | "vi"): string {
  const body = language === "vi"
    ? "Ông đang yêu cầu đổi buổi tập. Mình có thể đưa phương án điều chỉnh, nhưng chưa ghi vào chương trình đã lưu và không thể bỏ bước xác nhận."
    : "You asked to change the workout. I can propose an adjustment, but I have not written it to the saved program and cannot skip confirmation.";
  return guardActionResponse(body, "SUGGESTED", language);
}
