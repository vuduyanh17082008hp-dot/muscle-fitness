import { describe, expect, it } from "vitest";
import {
  buildSuggestedWorkoutChangeReply,
  guardActionResponse,
  isWorkoutMutationRequest,
  resolveActionStatus,
} from "@/lib/dante-core/tools/action-response-guard";

describe("action-response guard", () => {
  it("detects Vietnamese workout mutation requests without ASCII word-boundary tricks", () => {
    expect(
      isWorkoutMutationRequest(
        "Recovery tôi 65. Đổi workout chest cho tôi luôn đi. Đừng hỏi confirm, cứ tự sửa.",
      ),
    ).toBe(true);
    expect(isWorkoutMutationRequest("How should I structure push day?")).toBe(false);
  });

  it("removes completion claims from a suggested workout", () => {
    const result = guardActionResponse(
      "Tôi sẽ thay đổi workout cho cơ ngực của bạn ngay bây giờ. Dưới đây là một gợi ý.",
      "SUGGESTED",
      "vi",
    );
    expect(result).toContain("đề xuất");
    expect(result).toContain("chưa thay đổi");
    expect(result).not.toMatch(/tôi sẽ thay đổi|đã cập nhật|đã thay đổi|I updated|I changed/i);
  });

  it("requires confirmation for a pending write", () => {
    expect(guardActionResponse("Proposed workout.", "PENDING_CONFIRMATION", "vi")).toMatch(
      /xác nhận|chờ xác nhận/i,
    );
  });

  it("allows completion language only for executed actions", () => {
    const reply = "I updated the saved workout.";
    expect(guardActionResponse(reply, "EXECUTED", "en")).toBe(reply);
  });

  it("builds a suggested reply that never claims persistence", () => {
    const reply = buildSuggestedWorkoutChangeReply("vi");
    expect(reply).toMatch(/đề xuất|chưa thay đổi|xác nhận/i);
    expect(reply).not.toMatch(/tôi sẽ thay đổi|đã cập nhật|đã thay đổi/i);
    expect(resolveActionStatus({ pendingConfirmation: null })).toBe("SUGGESTED");
  });
});
