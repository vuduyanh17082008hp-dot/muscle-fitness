import type { SupportedSafetyLanguage } from "./safety-layer";

export type CasualIntent = {
  isCasual: boolean;
  explicitAdviceRequested: boolean;
  reply: string | null;
};

export type CasualControlFlow = {
  branch: "CASUAL" | "NORMAL";
  reply: string | null;
};

/**
 * Narrow, turn-local social detection. Safety is evaluated before this
 * helper by the route; this function never interprets ambiguous danger as
 * banter and never writes a communication preference.
 */
export function classifyCasualIntent(
  message: string,
  language: SupportedSafetyLanguage = "en",
): CasualIntent {
  const text = message.trim();
  if (!text) return { isCasual: false, explicitAdviceRequested: false, reply: null };

  const explicitAdviceRequested = text.includes("?") || /\b(?:should|could|can|how|help|advice|recommend|what do i)\b/i.test(text);

  const dyingLaughing = /^\s*i(?:'m| am) dying laughing\b/i.test(text);
  const workoutHyperbole = /\b(?:that workout killed me|leg day destroyed me|i'?m dead)\b/i.test(text) &&
    /\b(?:lol|lmao|haha|meme|video|bro)\b/i.test(text);
  if ((!dyingLaughing && !workoutHyperbole) || (explicitAdviceRequested && !workoutHyperbole && !dyingLaughing)) {
    return { isCasual: false, explicitAdviceRequested, reply: null };
  }

  const reply = explicitAdviceRequested
    ? (language === "vi"
      ? "Haha — nếu mai vẫn thấy đuối, giảm volume vừa phải và để cảm giác cùng hiệu suất quyết định mức tập."
      : "Lol — if you still feel beat tomorrow, trim the volume modestly and let how you feel and perform guide the session.")
    : (language === "vi"
      ? (dyingLaughing ? "Haha — chuyện gì xảy ra trong video vậy?" : "Lol — hôm nay bạn tập gì vậy?")
      : (dyingLaughing ? "Haha — what happened in the video?" : "Lol — what did you train today?"));

  return { isCasual: true, explicitAdviceRequested, reply };
}

/** The route consumes this decision before context assembly or generation. */
export function resolveCasualControlFlow(
  message: string,
  language: SupportedSafetyLanguage = "en",
): CasualControlFlow {
  const result = classifyCasualIntent(message, language);
  return result.isCasual && result.reply
    ? { branch: "CASUAL", reply: result.reply }
    : { branch: "NORMAL", reply: null };
}
