import type { DanteResponseIntent } from "@/lib/dante-core/adaptive-coach-v2/types";

export type ResponseStrategyState = {
  previousResponseIntent?: DanteResponseIntent;
  alreadyExplainedRationales: string[];
  recentOpeningPattern?: string;
  recentResponseFingerprint?: string;
  recentUserQuestionType?: string;
};

export const EMPTY_STRATEGY_STATE: ResponseStrategyState = {
  alreadyExplainedRationales: [],
};

function fingerprint(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 20).join(" ");
}

export function updateStrategyState(
  previous: ResponseStrategyState,
  update: {
    responseIntent: DanteResponseIntent;
    reply: string;
    rationales?: string[];
    userQuestionType?: string;
  },
): ResponseStrategyState {
  return {
    previousResponseIntent: update.responseIntent,
    alreadyExplainedRationales: [...new Set([...previous.alreadyExplainedRationales, ...(update.rationales ?? [])])].slice(-12),
    recentOpeningPattern: update.reply.trim().split(/[.!?\n]/)[0]?.slice(0, 100),
    recentResponseFingerprint: fingerprint(update.reply),
    ...(update.userQuestionType ? { recentUserQuestionType: update.userQuestionType } : {}),
  };
}

export function shouldCompressRationale(state: ResponseStrategyState, rationale: string): boolean {
  const normalized = fingerprint(rationale);
  return state.alreadyExplainedRationales.some((item) => {
    const known = fingerprint(item);
    return known === normalized || (known.length > 12 && (known.includes(normalized) || normalized.includes(known)));
  });
}
