export type ResponseStrategyFingerprint = {
  responseIntent: string;
  rationaleCodes: string[];
  recommendationCode?: string;
  explanationDepth?: "brief" | "normal" | "detailed";
  openingStyle?: string;
  alreadyExplainedFacts?: string[];
};

const RATIONALE_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "ALCOHOL_CONFOUNDER", pattern: /\b(?:alcohol|nhau|uong ruou|drinking)\b/i },
  { code: "CALORIE_CONFOUNDER", pattern: /\b(?:calories?|kcal|calo)\b/i },
  { code: "VOLUME_CONFOUNDER", pattern: /\b(?:volume|khoi luong|training volume)\b/i },
  { code: "SLEEP_NOT_ISOLATED", pattern: /\b(?:sleep|ngu).{0,40}(?:not|chua|khong).{0,40}(?:isolat|tach|ket luan|conclude)|(?:chua|not).{0,30}(?:gan|award|trao cong).{0,20}sleep\b/i },
  { code: "CONFIRMATION_REQUIRED", pattern: /\b(?:confirm|xac nhan|chua luu|not saved|pending)\b/i },
  { code: "SAFETY_STOP", pattern: /\b(?:stop|dung|ngung tap|emergency|cap cuu)\b/i },
];

export function extractRationaleCodes(text: string): string[] {
  return RATIONALE_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.code);
}

export function buildResponseStrategyFingerprint(input: {
  responseIntent: string;
  reply: string;
  rationaleCodes?: string[];
  recommendationCode?: string;
  explanationDepth?: "brief" | "normal" | "detailed";
  alreadyExplainedFacts?: string[];
}): ResponseStrategyFingerprint {
  const openingStyle = input.reply.trim().split(/[.!?\n]/)[0]?.slice(0, 80) ?? "";
  return {
    responseIntent: input.responseIntent,
    rationaleCodes: [...new Set([...(input.rationaleCodes ?? []), ...extractRationaleCodes(input.reply)])],
    ...(input.recommendationCode ? { recommendationCode: input.recommendationCode } : {}),
    ...(input.explanationDepth ? { explanationDepth: input.explanationDepth } : {}),
    openingStyle,
    alreadyExplainedFacts: input.alreadyExplainedFacts ?? [],
  };
}

function opening(reply: string): string {
  return reply.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).slice(0, 8).join(" ");
}

/**
 * Detect repeated reasoning via rationale codes, not just string overlap.
 */
export function detectTemplateAttractor(
  recentReplies: string[],
  options?: {
    previousFingerprint?: ResponseStrategyFingerprint | null;
    draftReply?: string;
    draftIntent?: string;
  },
): {
  templateAttractor: boolean;
  alreadyExplainedRationale: boolean;
  reasons: string[];
  fingerprint?: ResponseStrategyFingerprint;
} {
  const reasons: string[] = [];
  const draft = options?.draftReply;
  const fingerprint = draft
    ? buildResponseStrategyFingerprint({
      responseIntent: options?.draftIntent ?? "COACH",
      reply: draft,
    })
    : undefined;

  if (options?.previousFingerprint && fingerprint) {
    const overlap = fingerprint.rationaleCodes.filter((code) =>
      options.previousFingerprint!.rationaleCodes.includes(code));
    if (overlap.length >= 2) {
      reasons.push("repeated_rationale_codes");
      return {
        templateAttractor: true,
        alreadyExplainedRationale: true,
        reasons,
        fingerprint,
      };
    }
  }

  if (recentReplies.length >= 2) {
    const openings = recentReplies.map(opening).filter(Boolean);
    if (new Set(openings).size < openings.length) reasons.push("repeated_opening");

    const prevCodes = extractRationaleCodes(recentReplies[recentReplies.length - 2]);
    const latestCodes = extractRationaleCodes(recentReplies[recentReplies.length - 1]);
    const codeOverlap = latestCodes.filter((code) => prevCodes.includes(code));
    if (codeOverlap.length >= 2) reasons.push("repeated_rationale_codes");
  }

  return {
    templateAttractor: reasons.length > 0,
    alreadyExplainedRationale: reasons.includes("repeated_rationale_codes"),
    reasons,
    ...(fingerprint ? { fingerprint } : {}),
  };
}

export function compressAlreadyExplainedReply(input: {
  language: "en" | "vi";
  newDemand?: string;
}): string {
  if (input.language === "vi") {
    return input.newDemand
      ? `Chưa được. Ba biến lúc nãy vẫn còn đó. ${input.newDemand}`
      : "Chưa được. Ba biến lúc nãy vẫn còn đó, nên sleep chưa thể nhận hết công.";
  }
  return input.newDemand
    ? `Not yet. Those same confounders are still in play. ${input.newDemand}`
    : "Not yet. Those same confounders are still in play, so sleep does not get full credit.";
}
