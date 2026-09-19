import { describe, expect, it } from "vitest";
import {
  buildCurrentStateCoachingResponse,
  extractCurrentTurnState,
} from "@/lib/dante-core/current-turn-state";

const CASE_A = `Ngủ 8 tiếng, recovery khá tốt, vai phải hơi irritated overhead,
không numbness, weakness hay swelling.
Đã dùng 300mg caffeine.
Chest tập nặng 2 ngày trước.
Mục tiêu strength, không max.
Nói rõ phần chắc / có điều kiện / chưa chắc.`;

const CASE_B = `Hôm nay tôi thấy khá ổn:
ngủ khoảng 8 tiếng,
recovery tốt,
nhưng vai phải vẫn hơi cấn khi đưa tay lên cao.
Không tê, không yếu, không sưng.
Hôm kia tôi đã đánh ngực khá nặng rồi,
hôm nay chỉ muốn giữ nhịp strength chứ không cần PR.
Tôi đã uống 300mg caffeine.
Nếu ông là coach của tôi thì hôm nay ông sẽ xử lý buổi tập thế nào?
Tách giúp tôi cái gì đang khá rõ,
cái gì chỉ nên làm nếu điều kiện cho phép,
và cái gì hiện tại vẫn chưa đủ dữ liệu để kết luận.`;

const CASE_C = `Nay người khá ổn, ngủ đủ 8h, recovery ngon.
Mỗi cái vai phải hơi cấn lúc giơ tay cao thôi,
không tê yếu hay sưng gì.
Hôm kia vừa đánh chest nặng.
Nay không ham PR, chỉ muốn giữ strength.
300mg cafe rồi.
Nếu tập thì chơi kiểu nào cho hợp lý?`;

const CASE_D = `I slept about 8 hours and recovery feels good.
My right shoulder still feels a bit irritated when I raise my arm overhead,
but there's no numbness, weakness, or swelling.
I trained chest hard two days ago,
I'm not chasing a PR today,
and I've had 300mg caffeine.
I still want to keep some strength work in.
What would you do, and what is clear versus conditional versus still unknown?`;

const CASE_D_LIVE = `I slept about 8 hours and recovery feels good.
My right shoulder still feels a little off when I raise my arm overhead,
but there’s no numbness, weakness, or swelling.
I trained chest hard two days ago,
I’m not chasing a PR,
and I’ve had 300mg caffeine.
I still want some strength work today.
What would you do?`;

const CASE_D_A = `I slept 8 hours and recovery is good. My right shoulder feels off overhead.
No numbness, weakness or swelling. Heavy chest session two days ago.
No PR today. 300mg caffeine. I still want strength work.`;

const CASE_D_B = `Recovery feels solid and sleep was good.
My shoulder gets irritated when I reach overhead.
Chest was trained hard 48 hours ago.
I'm not maxing today. I already had 300mg caffeine.
What strength work makes sense?`;

const CASE_D_C = `Feeling recovered. Right shoulder is uncomfortable overhead but otherwise okay.
No neuro symptoms or swelling.
Chest got a heavy session the day before yesterday.
No max, just some strength work. 300mg caffeine already.`;


const CASE_E = `Recovery hôm nay good, sleep 8h.
Right shoulder hơi uncomfortable when I go overhead,
không numb, không weak, không swelling.
Chest hard session hôm kia rồi.
Today no PR, chỉ keep strength.
300mg caffeine rồi.
Coach tôi xem hôm nay nên xử lý thế nào.`;

function expectConvergentDecision(response: string | null, language: "en" | "vi") {
  expect(response).toBeTruthy();
  const text = response!;
  if (language === "vi") {
    expect(text).toMatch(/ĐIỀU ĐƯỢC ỦNG HỘ MẠNH|không max/i);
    expect(text).toMatch(/ĐIỀU KIỆN|warm-up/i);
    expect(text).toMatch(/CHƯA BIẾT/i);
  } else {
    expect(text).toMatch(/STRONGLY SUPPORTED|no max/i);
    expect(text).toMatch(/CONDITIONAL|warm-up/i);
    expect(text).toMatch(/UNKNOWN/i);
  }
  expect(text).toMatch(/overhead|OVERHEAD|pattern overhead/i);
  expect(text).toMatch(/2\s*ngày|2 days|about 2/i);
  expect(text).toMatch(/300\s*mg/i);
  expect(text).toMatch(/warm-up/i);
  expect(text).not.toMatch(/sẽ tăng strength|will improve your strength|should make this session better/i);
  expect(text).not.toMatch(/recommend(?:ed)? (?:Lat Pulldown|Seated Row|shoulder circles)/i);
  expect(text).toMatch(/không phải chẩn đoán|not a diagnosis/i);
}

describe("semantic generalization — paraphrase equivalence", () => {
  it.each([
    ["A technical VI", CASE_A, "vi" as const],
    ["B natural VI", CASE_B, "vi" as const],
    ["C casual VI", CASE_C, "vi" as const],
    ["D English", CASE_D, "en" as const],
    ["D live English off-overhead", CASE_D_LIVE, "en" as const],
    ["D English variant A", CASE_D_A, "en" as const],
    ["D English variant B 48h", CASE_D_B, "en" as const],
    ["D English variant C", CASE_D_C, "en" as const],
    ["E mixed", CASE_E, "vi" as const],
  ])("%s converges to the same decision semantics", (_label, message, language) => {
    const state = extractCurrentTurnState(message);
    expect(state.recoveryStatus).toBe("GOOD");
    expect(state.shoulderIrritated).toBe(true);
    expect(state.overheadIrritating).toBe(true);
    expect(state.chestTrainedDaysAgo).toBe(2);
    expect(state.chestIntensityHigh).toBe(true);
    expect(state.caffeineMg).toBe(300);
    expect(state.wantsMax).toBe(false);
    expect(state.trainingDecisionRequested).toBe(true);
    if (state.sleepHours != null) expect(state.sleepHours).toBe(8);
    expectConvergentDecision(buildCurrentStateCoachingResponse(state, language), language);
  });
});

describe("semantic generalization — negative controls", () => {
  it("does not invent a shoulder restriction when the shoulder is normal", () => {
    const state = extractCurrentTurnState(
      "Ngủ 8h, recovery tốt, vai hoàn toàn bình thường, chest chưa tập 5 ngày, muốn bench strength submax.",
    );
    expect(state.shoulderIrritated).toBe(false);
    expect(buildCurrentStateCoachingResponse(state, "vi")).toBeNull();
  });

  it("English negative control does not invent shoulder restrictions", () => {
    const state = extractCurrentTurnState(
      "My shoulder feels normal today, chest hasn't been trained in 5 days, recovery is good, and I want submax bench.",
    );
    expect(state.shoulderIrritated).toBe(false);
    expect(buildCurrentStateCoachingResponse(state, "en")).toBeNull();
  });

  it("does not hijack a nutrition-only ask into a workout plan", () => {
    const state = extractCurrentTurnState("Vai cấn overhead nhưng hôm nay tôi chỉ hỏi macro.");
    expect(state.nutritionOnlyRequest).toBe(true);
    expect(state.trainingDecisionRequested).toBe(false);
    expect(buildCurrentStateCoachingResponse(state, "vi")).toBeNull();
  });

  it("uses current resolved state instead of permanently preserving old irritation", () => {
    const state = extractCurrentTurnState(
      "Vai hơi cấn một lần lúc khởi động nhưng giờ hoàn toàn hết, horizontal pressing pain-free. Muốn bench submax.",
    );
    expect(state.shoulderIrritationResolved).toBe(true);
    expect(state.shoulderIrritated).toBe(false);
    expect(buildCurrentStateCoachingResponse(state, "vi")).toBeNull();
  });
});
