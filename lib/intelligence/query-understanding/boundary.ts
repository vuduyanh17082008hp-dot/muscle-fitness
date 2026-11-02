import type { PhraseState } from "./phrases";
import type { UserQueryFrame } from "./types";

/**
 * Fallback reply when a train/rest/readiness decision reaches the nutrition engine directly. The /api/chatbot router sends
 * such turns to Dante's main pipeline first (nutritionTurnForMainPipeline), so this only answers a direct engine call:
 * it names what the user said, says the decision comes from training/recovery data, and offers the food side.
 */

const ACK: Record<"vi" | "en", Partial<Record<PhraseState, string>>> = {
  vi: {
    SLEEPINESS: "Buồn ngủ là một tín hiệu thật về mức sẵn sàng cho buổi tập.",
    SHORT_SLEEP: "Ngủ ít hoặc ngủ tệ là một tín hiệu thật về mức sẵn sàng cho buổi tập.",
    FATIGUE: "Cảm giác mệt là một tín hiệu thật về mức sẵn sàng cho buổi tập.",
    SORENESS: "Cơ còn mỏi là một tín hiệu thật về mức sẵn sàng cho buổi tập.",
    BOREDOM: "Mình hiểu là bạn đang chán.",
    SADNESS: "Mình hiểu là bạn đang buồn.",
    FEELS_GOOD: "Cảm giác khỏe là một thông tin tốt.",
  },
  en: {
    SLEEPINESS: "Feeling sleepy is a real readiness signal for a session.",
    SHORT_SLEEP: "Short or poor sleep is a real readiness signal for a session.",
    FATIGUE: "Feeling tired is a real readiness signal for a session.",
    SORENESS: "Lingering soreness is a real readiness signal for a session.",
    BOREDOM: "I hear that you're bored.",
    SADNESS: "I hear that you're feeling low.",
    FEELS_GOOD: "Feeling good is useful information.",
  },
};

const BODY = {
  vi: "Nhưng nên đi tập hay nghỉ hôm nay là quyết định về huấn luyện và hồi phục — mình sẽ trả lời dựa trên điểm recovery, giấc ngủ và lịch tập hiện tại của bạn nếu bạn hỏi riêng câu đó.",
  en: "But whether to train or rest today is a training and recovery decision — ask it on its own and I'll answer it from your current recovery score, sleep and schedule, not from food.",
} as const;

const OFFER = {
  vi: "Nếu bạn muốn, mình giúp phần ăn uống quanh buổi tập (ăn gì trước hoặc sau tập, bù đủ protein và năng lượng).",
  en: "If you'd like, I can help with the food side around a session (what to eat before or after, covering protein and energy).",
} as const;

export function buildDanteDeferralReply(frame: Pick<UserQueryFrame, "language" | "entities">): string {
  const lang = frame.language === "EN" ? "en" : "vi";
  const states = frame.entities.filter((e) => e.kind === "STATE").map((e) => e.value as PhraseState);
  const ack = [...new Set(states)].map((s) => ACK[lang][s]).filter((line): line is string => Boolean(line)).slice(0, 2);
  return [...ack, BODY[lang], OFFER[lang]].join(" ");
}

const MEAL_BUILD_INTENTS = new Set(["MEAL_IDEA", "MEAL_ADJUSTMENT", "CRAVING"]);
const FOOD_FACT_INTENTS = new Set(["FOOD_FACT", "FOOD_MACRO_LOOKUP", "MACRO_CALCULATION", "FOLLOWUP_QUANTITY"]);

/**
 * Dante's domain router: should this turn run Dante's nutrition capability (the meal engine, lib/nutrition/coach) instead of the
 * general model? Meal construction always; a food-fact lookup only when it has no training/recovery angle (the general model may
 * still READ food facts to reason about a session: "is 200g cod enough after training?"). (Name kept: "Gemma" is the engine's
 * internal codename, never a user-facing assistant.)
 */
export function dantePassesToGemma(frame: UserQueryFrame): boolean {
  if (frame.deferToGemma && MEAL_BUILD_INTENTS.has(frame.intent)) return true;
  return frame.primaryDomain === "NUTRITION" && FOOD_FACT_INTENTS.has(frame.intent)
    && frame.secondaryDomains.length === 0 && frame.crossCoachRelevance === "IRRELEVANT";
}
