/**
 * P-17 — accessible communication profile. Presentation only.
 * Does not remove internal facts. P-15 EXCLUDE stays the reasoning gate.
 */

import type { ExpressionPlan, ExpressionVerbosity, Familiarity, VersionedState } from "@/lib/dante-core/coherence/types";
import { activeBoundaries } from "@/lib/dante-core/coherence/reducer";

export type LanguageComplexity = "DEFAULT" | "SIMPLE";
export type JargonLevel = "LOW" | "DEFAULT";
export type StatisticsVisibility = "SHOW" | "HIDE";
export type AccessibilityMode = "DEFAULT" | "SIMPLIFIED";

export type AccessibleCommunicationProfile = {
  language: "en" | "vi";
  complexity: LanguageComplexity;
  verbosity: ExpressionVerbosity;
  jargon: JargonLevel;
  statisticsVisibility: StatisticsVisibility;
  register: Familiarity;
  accessibilityMode: AccessibilityMode;
};

const SIMPLE_LANGUAGE =
  /my english isn['’]?t very good|simple english|explain simply|keep it simple|easy english|no complicated words|tieng anh (?:khong gioi|kem)|tiếng anh (?:không giỏi|kém)|noi don gian|nói đơn giản|giai thich don gian|giải thích đơn giản|de hieu|dễ hiểu|khong dung tu kho|không dùng từ khó/i;

const HIDE_STATISTICS =
  /don['’]?t give me statistics|do not give me statistics|no (?:numbers|statistics|stats)|hide (?:the )?(?:metrics|statistics|stats|numbers)|don['’]?t mention (?:scores|numbers|stats)|move all (?:the )?statistics away|khong (?:dua|cho) (?:so lieu|thong ke)|đừng (?:đưa|cho) (?:số liệu|thống kê)|giau so|giấu số/i;

const SHOW_STATISTICS =
  /(?:show|give|mention) (?:me )?(?:the )?(?:statistics|stats|numbers|metrics) again|you can (?:use|mention) (?:statistics|numbers)/i;

const USER_METRIC =
  /\brecovery(?:\s+score)?\s*(?:is|was|at|=)?\s*\d+\b|\breadiness(?:\s+score)?\s*(?:is|was|at|=)?\s*\d+\b|\b\d{2,5}\s*(?:kcal|calories)\b|\b\d+(?:\.\d+)?\s*%\b|\btraining (?:load|frequency|consistency)\b|\b\d+\s*(?:effective )?sets\b|\blean bulk\b|\bcheck-in\b/i;

const ADVANCED_PROFILE_LEAK = /\bgiven your advanced(?: experience)?\b|\byour advanced experience\b|\bas an advanced (?:lifter|athlete)\b/i;

export function detectSimpleLanguage(message: string): boolean {
  return SIMPLE_LANGUAGE.test(message);
}

export function detectHideStatistics(message: string): boolean {
  return HIDE_STATISTICS.test(message) && !SHOW_STATISTICS.test(message);
}

export function detectShowStatistics(message: string): boolean {
  return SHOW_STATISTICS.test(message);
}

export function coachingTopicOf(message: string): string | null {
  if (/jealous|225|bench/i.test(message)) return "bench";
  if (/\b(?:knee|goi|đầu gối)\b/i.test(message) && /\b(?:hurt|hurts|pain|ache|dau)\b/i.test(message)) return "knee_pain";
  return null;
}

export function isThinContinuation(message: string): boolean {
  return /^(?:so[, ]+)?what should i do now\??$|^what now\??$|^rồi sao\??$|^gio sao\??$/i.test(message.trim());
}

export function resolveAccessibleProfile(input: {
  message: string;
  language: "en" | "vi";
  plan: ExpressionPlan;
  snapshot?: VersionedState | null;
}): AccessibleCommunicationProfile {
  const bounds = input.snapshot ? activeBoundaries(input.snapshot) : [];
  const simpleNow = detectSimpleLanguage(input.message);
  const simpleBound = bounds.some((b) => b.value.kind === "simple_language");
  const hideNow = detectHideStatistics(input.message);
  const showNow = detectShowStatistics(input.message);
  const hideBound = bounds.some((b) => b.value.kind === "hide_statistics");
  const simple = simpleNow || simpleBound;
  const hide = showNow ? false : hideNow || hideBound;
  return {
    language: input.language,
    complexity: simple ? "SIMPLE" : "DEFAULT",
    verbosity: simple && input.plan.verbosity === "DETAILED" ? "DEFAULT" : input.plan.verbosity,
    jargon: simple || bounds.some((b) => b.value.kind === "no_jargon") ? "LOW" : "DEFAULT",
    statisticsVisibility: hide ? "HIDE" : "SHOW",
    register: input.plan.familiarity,
    accessibilityMode: simple ? "SIMPLIFIED" : "DEFAULT",
  };
}

export function stripHiddenStatistics(text: string): string {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !USER_METRIC.test(part) && !ADVANCED_PROFILE_LEAK.test(part))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function simplifySentences(text: string): string {
  return text
    .replace(/\b(?:utilize|facilitate|regarding|subsequent(?:ly)?|nevertheless|furthermore)\b/gi, (word) => {
      const map: Record<string, string> = {
        utilize: "use",
        facilitate: "help",
        regarding: "about",
        subsequent: "next",
        subsequently: "then",
        nevertheless: "still",
        furthermore: "also",
      };
      return map[word.toLowerCase()] ?? word;
    })
    .replace(/\b(?:it is (?:important|recommended) (?:that|to)\s+)/gi, "")
    .replace(/\b(?:please note that|it should be noted that)\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function applyAccessiblePresentation(
  text: string,
  profile: AccessibleCommunicationProfile,
  message = "",
): string {
  let out = text;
  if (profile.statisticsVisibility === "HIDE") out = stripHiddenStatistics(out);
  if (/\b(?:new to the gym|rookie|beginner|newbie)\b/i.test(message)) {
    out = out
      .split(/(?<=[.!?…])\s+|\n+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !ADVANCED_PROFILE_LEAK.test(part))
      .join(" ");
  }
  if (profile.complexity === "SIMPLE" || profile.accessibilityMode === "SIMPLIFIED") {
    out = simplifySentences(out);
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
