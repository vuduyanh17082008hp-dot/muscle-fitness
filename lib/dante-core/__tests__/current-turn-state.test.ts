import { describe, expect, it } from "vitest";
import {
  buildCurrentStateCoachingResponse,
  extractCurrentTurnState,
} from "@/lib/dante-core/current-turn-state";

const LIVE_SYNTHESIS = `Chỉ dựa vào trạng thái hiện tại:
ngủ 8 tiếng,
recovery khá tốt,
vai phải hơi irritated overhead
nhưng không numbness,
không weakness,
không swelling,
đã dùng 300mg caffeine,
chest tập nặng 2 ngày trước,
mục tiêu tăng strength,
không muốn max.
Cho tôi phương án tốt nhất hôm nay,
nói rõ phần nào chắc, phần nào có điều kiện và phần nào chưa chắc.`;

describe("current-turn state precedence", () => {
  it("keeps today's explicit recovery and sleep ahead of yesterday's values", () => {
    const state = extractCurrentTurnState(
      "Hôm qua tôi ngủ 4h recovery 42. HÔM NAY tôi ngủ 8h và recovery tốt. Vai hơi irritated overhead. Không numbness, không weakness. Tôi muốn bench submax, không PR.",
    );
    expect(state.sleepHours).toBe(8);
    expect(state.recoveryScore).toBeNull();
    expect(state.recoveryStatus).toBe("GOOD");
    expect(state.wantsSubmax).toBe(true);
    expect(state.wantsMax).toBe(false);
  });

  it("builds a precise conditional plan from the current state", () => {
    const state = extractCurrentTurnState(
      "Chỉ dựa vào trạng thái hiện tại: ngủ 8 tiếng, recovery khá tốt, vai phải hơi irritated overhead nhưng không numbness, không weakness, đã dùng 300mg caffeine, chest tập nặng 2 ngày trước, không muốn max.",
    );
    const response = buildCurrentStateCoachingResponse(state, "vi");
    expect(response).toContain("không max");
    expect(response).toContain("warm-up");
    expect(response).toContain("300mg");
    expect(response).toMatch(/chưa biết|chưa chắc/i);
    expect(response).not.toMatch(/diagnosis|sleep deprivation|recovery 42/i);
  });

  it("handles the exact live synthesis prompt without dropping pre-plan-request facts", () => {
    const state = extractCurrentTurnState(LIVE_SYNTHESIS);
    expect(state.sleepHours).toBe(8);
    expect(state.recoveryStatus).toBe("GOOD");
    expect(state.shoulderIrritated).toBe(true);
    expect(state.overheadIrritating).toBe(true);
    expect(state.chestTrainedDaysAgo).toBe(2);
    expect(state.caffeineMg).toBe(300);
    expect(state.wantsMax).toBe(false);
    expect(state.trainingDecisionRequested).toBe(true);

    const response = buildCurrentStateCoachingResponse(state, "vi");
    expect(response).toBeTruthy();
    expect(response).toMatch(/ĐIỀU ĐƯỢC ỦNG HỘ MẠNH/i);
    expect(response).toMatch(/ĐIỀU KIỆN|warm-up/i);
    expect(response).toMatch(/CHƯA BIẾT/i);
    expect(response).toMatch(/2 ngày trước|2 ngày/i);
    expect(response).toMatch(/không max/i);
    expect(response).toMatch(/overhead/i);
    expect(response).toMatch(/Squat\/Deadlift|Lat Pulldown|Seated Row/i);
    expect(response).toMatch(/không khẳng định|chỉ là dữ kiện tiêu thụ/i);
    expect(response).toMatch(/không phải chẩn đoán/i);
    expect(response).not.toMatch(/recovery 42|stress 7\.5|fatigue 6/i);
    expect(response).not.toMatch(/\d{2,3}%/);
  });
});
