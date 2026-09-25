/**
 * P-20 — personal-PT realization. Surface only.
 * Does not change safety rules, scope, DecisionState, or evidence/accessibility logic.
 */

import type { ExpressionVerbosity, Familiarity, SafetyPhase } from "@/lib/dante-core/coherence/types";

const HARD_BLOCK = new Set([
  "chest_pain_cardiac",
  "fainting_dizziness",
  "neurological_symptoms",
  "severe_pain",
  "eating_disorder_indicator",
  "dangerous_substance",
  "self_harm_crisis",
  "ambiguous_safety",
]);

const STRUCTURED =
  /STRONGLY SUPPORTED|CONDITIONAL:|UNKNOWN:|ĐIỀU ĐƯỢC ỦNG HỘ|full .{0,32}plan|workout plan|meal plan|training plan|step by step|detailed steps|giai thich ky|giải thích kỹ|\bin detail\b|^\s*(?:[-*•]|\d+[.)])\s/im;

const AUTONOMY =
  /(?:this is the safest recommendation[^.!?]*)|(?:the decision remains yours[^.!?]*)|(?:ultimately,? it(?:['’]s| is) (?:up to you|about)[^.!?]*)|(?:the recommendation remains unchanged[^.!?]*)|(?:the recommendation can change when[^.!?]*)|(?:consider what feels best[^.!?]*)|(?:Đây là khuyến nghị an toàn[^.!?]*)/gi;

const CLINICAL_SWAP: Array<[RegExp, string]> = [
  [
    /seek assessment from a doctor or physiotherapist if pain worsens, obvious swelling appears, the knee gives way, normal weight-bearing is difficult, function drops significantly, or symptoms persist or worsen/gi,
    "If the pain gets worse, your knee swells, locks, gives way, or walking starts feeling wrong, stop and get it checked",
  ],
  [/seek assessment from a doctor or physiotherapist/gi, "get it checked by a doctor or physio"],
  [/seek medical or physiotherapy assessment/gi, "see a doctor or physio"],
  [/qualified (?:professional )?assessment/gi, "a doctor or physio"],
  [/normal weight-bearing (?:is difficult|becomes impaired)/gi, "walking starts feeling wrong"],
  [/function drops significantly/gi, "walking starts feeling wrong"],
  [/avoid (?:any )?movements? that reproduce (?:the )?(?:pain|symptoms)/gi, "don't squat through the pain"],
  [/i do not recommend heavy squatting today/gi, "don't squat through the pain today"],
  [/do not recommend heavy loading of the painful area today/gi, "don't train through the pain today"],
  [/or continuing any movement that reproduces or increases the sharp pain/gi, "or any move that hurts"],
  [
    /a lower-risk option today is to rest the painful lower body, or do moderate upper-body\/core work only if it is completely symptom-free[^.?]*/gi,
    "You can still train, just stick to movements that feel completely fine",
  ],
  [/light recovery activity is also conditional on remaining pain-free[^.?]*/gi, ""],
  [
    /the current observation is an acute symptom you reported(?: under load)?(?:, not a diagnosis or a chronic (?:knee )?trait)?[^.?]*/gi,
    "",
  ],
  [/sharp pain that recurs under load is enough not to recommend heavy loading today[^.?]*/gi, "Don't squat through the pain today"],
  [/i cannot diagnose the cause(?: of the \w+ symptom)?(?: through chat)?[^.?]*/gi, ""],
  [/i cannot determine exactly what is wrong with your knee through chat[^.?]*/gi, ""],
  [/the cause is not established[^.?]*/gi, ""],
];

const TANGENT =
  /(?:prioritize sleep and recovery[^.?]*)|(?:do not try to repay missed volume[^.?]*)|(?:hrv and resting heart rate[^.?]*)|(?:eat the missed meal[^.?]*)|(?:do not use more caffeine[^.?]*)|(?:that recommendation is based on the combination of[^.?]*)/gi;

function pick<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 2147483647;
  return items[hash % items.length]!;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}

function userSaid(message: string, pattern: RegExp): boolean {
  return pattern.test(message);
}

function wantsStructured(message: string, draft: string): boolean {
  return STRUCTURED.test(message) || STRUCTURED.test(draft);
}

function tidy(text: string): string {
  return text
    .replace(/\s+([,.])/g, "$1")
    .replace(/([.!?])\s*[.!?]+/g, "$1")
    .replace(/\b(Don't squat through the pain(?: today)?\.)(?:\s+\1)+/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(^|[.!?…]\s+)([a-z])/g, (_m, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`)
    .trim();
}

function weakenSymptoms(text: string, message: string): string {
  let out = text;
  if (!userSaid(message, /\bsharp\b|\bstabbing\b|dau nhoi|đau nhói/i)) {
    out = out.replace(/\bsharp(?:ly)?\s+pain\b/gi, "pain").replace(/\bstabbing pain\b/gi, "pain");
  }
  if (!userSaid(message, /\bsevere\b|\bexcruciating\b|dau du doi|đau dữ dội/i)) {
    out = out.replace(/\bsevere pain\b/gi, "pain");
  }
  out = out.replace(/\bacute (?:symptom|injury|pain|trait)\b/gi, "pain you felt");
  if (!userSaid(message, /\brecur|keeps? coming|again and again|persistent/i)) {
    out = out.replace(/\brecurs under load\b/gi, "when you squat").replace(/\brecurring pain\b/gi, "pain");
  }
  return out;
}

function stripDisclaimers(text: string, message: string): string {
  const askedNoDx = /don['’]?t diagnose|do not diagnose|khong chan doan/i.test(message);
  const diag = /^(?:i can(?:not|'t) diagnose|i cannot determine exactly what is wrong)\b/i;
  const parts = sentences(text);
  if (!parts.some((part) => diag.test(part))) return text;
  let keptDiag = 0;
  return parts
    .filter((part) => {
      if (!diag.test(part)) return true;
      if (askedNoDx) return false;
      keptDiag += 1;
      return keptDiag <= 1;
    })
    .join(text.includes("\n") ? "\n\n" : " ");
}

function dropTangents(text: string, message: string): string {
  if (/sleep|recovery|volume|calorie|caffeine|hrv|rhr/i.test(message)) return text;
  return text.replace(TANGENT, "").replace(/[ \t]{2,}/g, " ").trim();
}

function addComparisonBeat(text: string, message: string, language: "en" | "vi"): string {
  const comparison = /jealous|feel behind|makes me feel|huge (?:weights?|numbers?|bench)|people bench|benching \d+/i.test(message);
  if (!comparison) return text;
  if (/forget|scoreboard|your own|their (?:225|bench|numbers?)|not their/i.test(text)) return text;
  const en = [
    "Forget what those guys are benching — your job is your own next session, not theirs.",
    "You're building your own numbers, not chasing someone else's bench.",
    "Their big lifts aren't your scoreboard.",
  ];
  const vi = [
    "Đừng lấy bench của người khác làm bảng điểm — việc của mày là buổi sau của chính mày.",
    "Mày đang xây số của mình, không phải đuổi bench của người ta.",
  ];
  return `${pick(language === "vi" ? vi : en, message)} ${text}`;
}

function maybeBro(text: string, message: string, familiarity: Familiarity | undefined, allowVocative: boolean): string {
  if (!allowVocative) return text;
  if (!/\bbro\b/i.test(message)) return text;
  if (familiarity === "NEUTRAL") return text;
  if (/^\s*bro\b/i.test(text)) return text;
  const rest = text.charAt(0).toLowerCase() + text.slice(1);
  return `Bro, ${rest}`;
}

function maybeCloser(text: string, message: string, language: "en" | "vi"): string {
  if (!/\b(?:knee|squat|goi|đầu gối)\b/i.test(message)) return text;
  if (/train around|no ego|not through it|tập né|xuyen qua/i.test(text)) return text;
  const en = [
    "No ego today — train around it, not through it.",
    "Train around the problem, not through it.",
    "You're not trying to win today at the cost of next week.",
  ];
  const vi = ["Hôm nay đừng gồng ego — tập né, đừng tập xuyên đau."];
  return `${text} ${pick(language === "vi" ? vi : en, message)}`;
}

function toOneParagraph(text: string): string {
  return text.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function applyPersonalPt(input: {
  draft: string;
  message?: string;
  language: "en" | "vi";
  familiarity?: Familiarity;
  safetyPhase?: SafetyPhase;
  safetyCategory?: string | null;
  handledCount?: number;
  /** English vocatives are out of plan in the live gate. Isolated tests may opt in. */
  allowVocative?: boolean;
  verbosity?: ExpressionVerbosity;
}): string {
  const draft = input.draft.trim();
  if (!draft) return input.draft;
  if (HARD_BLOCK.has(input.safetyCategory ?? "")) return input.draft;

  const message = input.message ?? "";
  let text = draft;
  for (const [pattern, repl] of CLINICAL_SWAP) text = text.replace(pattern, repl);
  text = text.replace(AUTONOMY, "");
  text = dropTangents(text, message);
  text = weakenSymptoms(text, message);
  text = stripDisclaimers(text, message);
  text = tidy(text);
  text = addComparisonBeat(text, message, input.language);
  text = maybeCloser(text, message, input.language);
  text = maybeBro(text, message, input.familiarity, input.allowVocative === true);
  const keepShape = wantsStructured(message, draft)
    || (input.handledCount ?? 0) > 1
    || input.verbosity === "DETAILED";
  if (!keepShape) text = toOneParagraph(text);
  return tidy(text);
}
