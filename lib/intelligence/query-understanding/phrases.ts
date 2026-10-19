/**
 * Phrase-aware semantic layer. Runs BEFORE any isolated-word reading: the longest meaningful phrase wins and its words are
 * consumed, so "buồn ngủ" (sleepy) can never be read as "buồn" (sad) + "ngủ" (sleep), "buồn chán" (bored), or "ngu" (stupid).
 * Accentless spellings are listed only as WHOLE PHRASES ("buon ngu"), never as folded single words (see FOLD_UNSAFE in text.ts).
 */

export type PhraseState =
  | "SLEEPINESS" | "SHORT_SLEEP" | "FATIGUE" | "SORENESS" | "BOREDOM" | "SADNESS" | "HUNGER" | "FEELS_GOOD" | "FEELS_BAD";
export type PhraseAction = "GO_TRAIN" | "SKIP_TRAINING" | "HEAVY_TRAINING" | "REDUCE_VOLUME" | "REDUCE_INTENSITY";

export interface PhraseHit {
  kind: "STATE" | "ACTION";
  key: PhraseState | PhraseAction;
  surface: string;
  start: number;
  end: number;
}

const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";

/** Canonical meaning of each state, in plain English, for prompts and boundary replies. */
export const STATE_GLOSS: Record<PhraseState, string> = {
  SLEEPINESS: "sleepy / drowsy (NOT bored, NOT sad)",
  SHORT_SLEEP: "slept too little or badly",
  FATIGUE: "tired / low energy",
  SORENESS: "sore / achy muscles",
  BOREDOM: "bored (NOT sleepy)",
  SADNESS: "sad / low mood (NOT sleepy)",
  HUNGER: "hungry",
  FEELS_GOOD: "feels well / strong",
  FEELS_BAD: "does not feel well",
};

const STATE_PATTERNS: Array<[PhraseState, string]> = [
  ["SLEEPINESS", "buồn ngủ|buon ngu|sleepy|drowsy|can'?t keep my eyes open|díp mắt|dip mat"],
  ["SHORT_SLEEP", "ngủ ít|ngủ tệ|ngủ không đủ|ngủ không ngon|thiếu ngủ|mất ngủ|ngu it|ngu te|thieu ngu|mat ngu|slept (?:badly|poorly)|(?:little|no|bad|poor) sleep|sleep[- ]deprived|undersle+pt"],
  ["FATIGUE", "mệt quá|mệt mỏi|rất mệt|mệt|met qua|hết pin|het pin|không có sức|không còn sức|kiệt sức|đuối sức|đuối|tired|exhausted|drained|wiped|low energy|no energy|burn(?:ed|t) out"],
  ["SORENESS", "mỏi chân|mỏi cơ|mỏi|đau cơ|nhức|sore|aching|achy"],
  ["BOREDOM", "buồn chán|buon chan|chán quá|chán|bored|boring"],
  ["SADNESS", "buồn|sad|down in the dumps|depressed"],
  ["HUNGER", "đói|hungry|starving"],
  ["FEELS_BAD", "không khỏe|chưa khỏe|không được khỏe|khong khoe|not (?:really )?(?:feeling )?(?:great|good|well|strong)|feel (?:bad|terrible|awful|weak|off)"],
  ["FEELS_GOOD", "cảm thấy khỏe|thấy khỏe|vẫn khỏe|khỏe lắm|khỏe re|khỏe mạnh|thấy ổn|vẫn ổn|feel(?:ing)? (?:really |actually |pretty |very )?(?:strong|great|good|fine|well|fresh|energi[sz]ed)|(?:i'?m|i am) (?:really |actually |pretty )?(?:strong|fine|good|great)|khỏe"],
];

const ACTION_PATTERNS: Array<[PhraseAction, string]> = [
  ["SKIP_TRAINING", "nghỉ tập|nghỉ ngơi|nghỉ luôn|nghỉ ở nhà|nghỉ mẹ ở nhà|skip (?:the )?(?:gym|training|workout|session)|rest day|take (?:a |the )?(?:day )?(?:off|rest)"],
  ["GO_TRAIN", "đi tập|đi gym|vào phòng tập|go (?:to )?(?:the )?gym|go train(?:ing)?|hit the gym"],
  ["HEAVY_TRAINING", "tập nặng|tạ nặng|đánh nặng|train heavy|heavy (?:session|day|lifting)|go heavy"],
  ["REDUCE_VOLUME", "giảm volume|giảm khối lượng|giảm set|cut volume|reduce volume|lower volume"],
  ["REDUCE_INTENSITY", "giảm intensity|giảm cường độ|giảm tạ|reduce intensity|lower intensity|back off"],
];

interface Compiled { kind: PhraseHit["kind"]; key: PhraseHit["key"]; re: RegExp; len: number }

/** Split on top-level "|" only, so a group like "(?:a|b)" stays one alternative. */
function splitAlternatives(alts: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of alts) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "|" && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  return [...out, cur];
}

const COMPILED: Compiled[] = [
  ...STATE_PATTERNS.flatMap(([key, alts]) => splitAlternatives(alts).map((alt) => ({ kind: "STATE" as const, key, alt }))),
  ...ACTION_PATTERNS.flatMap(([key, alts]) => splitAlternatives(alts).map((alt) => ({ kind: "ACTION" as const, key, alt }))),
]
  .map(({ kind, key, alt }) => ({ kind, key, re: new RegExp(`${L}(?:${alt})${R}`, "giu"), len: alt.length }))
  // Longest alternative first, so a longer phrase claims its words before any shorter phrase can.
  .sort((a, b) => b.len - a.len);

/** Non-overlapping phrase hits over diacritic-intact, lower-cased text; longest phrase wins. Returned in text order. */
export function detectPhrases(normalized: string): PhraseHit[] {
  const taken: Array<[number, number]> = [];
  const hits: PhraseHit[] = [];
  for (const { kind, key, re } of COMPILED) {
    re.lastIndex = 0;
    for (const m of normalized.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      hits.push({ kind, key, surface: m[0], start, end });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Text with every recognised phrase blanked out — what is left is what isolated-word rules may still read. */
export function maskPhrases(normalized: string, hits: PhraseHit[] = detectPhrases(normalized)): string {
  let out = normalized;
  for (const h of [...hits].sort((a, b) => b.start - a.start)) out = `${out.slice(0, h.start)}${" ".repeat(h.end - h.start)}${out.slice(h.end)}`;
  return out;
}
