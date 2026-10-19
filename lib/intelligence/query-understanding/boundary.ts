import type { PhraseState } from "./phrases";
import type { UserQueryFrame } from "./types";

/**
 * Gemma → Dante boundary reply for a train/rest/readiness decision. Deterministic and general (built from the frame's
 * recognised states, never from a specific prompt): Gemma names what the user said correctly, says the decision is Dante's,
 * and offers the part that IS hers (food). No handoff is performed — the user simply asks Dante.
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
  vi: "Nhưng nên đi tập hay nghỉ hôm nay là quyết định về huấn luyện và hồi phục — đó là việc của Dante, người đọc điểm recovery, giấc ngủ và lịch tập hiện tại của bạn. Mình chỉ lo phần dinh dưỡng nên không tự quyết chuyện này. Bạn hỏi Dante nhé.",
  en: "But whether to train or rest today is a training and recovery decision — that's Dante's call, since Dante reads your current recovery score, sleep and schedule. I only handle nutrition, so I won't decide it for you. Ask Dante.",
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

/** Dante → Gemma: meal construction is the nutrition coach's. Dante keeps the training/recovery side of the question. */
export function buildGemmaDeferralReply(language: "vi" | "en", request?: string): string {
  // HANDOFF preserves the obligation: the user's request is quoted so it can be taken to Gemma as-is.
  const asked = request?.trim().replace(/\s+/g, " ").slice(0, 160);
  const carry = asked ? (language === "vi" ? ` Bạn có thể gửi nguyên câu này cho Gemma: “${asked}”.` : ` You can send her exactly this: “${asked}”.`) : "";
  return language === "vi"
    ? `Chọn và xây bữa ăn là việc của Gemma, huấn luyện viên dinh dưỡng — bạn hỏi Gemma để có gợi ý bữa ăn và macro chính xác theo mục tiêu của bạn.${carry} Mình lo phần tập luyện và hồi phục: nếu cần biết buổi tập hôm nay đòi hỏi bao nhiêu năng lượng hay protein, hỏi mình.`
    : `Choosing and building meals is Gemma's job, the nutrition coach — ask Gemma for meal ideas and macros matched to your targets.${carry} I handle training and recovery: if you want to know what today's session demands in energy or protein, ask me.`;
}

const MEAL_BUILD_INTENTS = new Set(["MEAL_IDEA", "MEAL_ADJUSTMENT", "CRAVING"]);
const FOOD_FACT_INTENTS = new Set(["FOOD_FACT", "FOOD_MACRO_LOOKUP", "MACRO_CALCULATION", "FOLLOWUP_QUANTITY"]);

/**
 * Dante-side: should this turn go to Gemma instead of Dante's model? Meal construction always; a food-fact lookup only when it has no
 * training/recovery angle (Dante may still READ food facts to reason about a session: "is 200g cod enough after training?").
 */
export function dantePassesToGemma(frame: UserQueryFrame): boolean {
  if (frame.deferToGemma && MEAL_BUILD_INTENTS.has(frame.intent)) return true;
  return frame.primaryDomain === "NUTRITION" && FOOD_FACT_INTENTS.has(frame.intent)
    && frame.secondaryDomains.length === 0 && frame.crossCoachRelevance === "IRRELEVANT";
}
