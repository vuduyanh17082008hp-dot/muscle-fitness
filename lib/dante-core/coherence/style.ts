/**
 * Phase 2 — style layer: verbosity preference, address form, customer-service drift.
 * Surface only. Nothing here decides a fact, a safety phase or an obligation's disposition.
 *
 * Everything is inferred from the lossless normalized text (see understanding.ts), so slang, dropped accents,
 * abbreviations, Telex leftovers and pronoun noise ("mày nói dài quá", "r nói ngắn lại") reach the same
 * small preference class: BRIEF / DEFAULT / DETAILED.
 */

import { foldText, normalizeInput } from "@/lib/dante-core/coherence/understanding";
import type { AddressForm, Verbosity } from "@/lib/dante-core/coherence/types";

/* ------------------------------------------------------------------ */
/* Verbosity                                                           */
/* ------------------------------------------------------------------ */

const NEGATOR_BEFORE = /(?:\b(?:dung|khong|ko|chua can|no need|not|don't|do not|dont)\s+(?:can\s+|co\s+|qua\s+|too\s+)?)$/;

/** Talk about the reply's own length. "dai" alone is not enough ("dai han" = long-term). */
const BRIEF_PATTERNS: RegExp[] = [
  /\b(?:noi|tra loi|viet|dap|reply|answer|respond|giai thich|cho|tra)\s+(?:lai\s+)?(?:cho\s+)?(?:ngan|gon)\b/g,
  /\b(?:ngan gon|ngan thoi|gon thoi|gon lai|ngan lai|ngan hon|gon hon|it chu|bot chu|cut it short)\b/g,
  /\b(?:tra loi|noi|viet|dap|reply|answer|response|bai)\b.{0,16}\b(?:dai|lan man|dai dong|rom ra|lai nhai|nhieu chu)\s+(?:qua|lam|ghe|kinh|het suc|vay|the)\b/g,
  /\b(?:may|ban|ong|dante|m)\s+(?:noi|viet|tra loi|dap)\s+(?:dai|lan man|dai dong|rom ra)\b/g,
  /\b(?:dai|lan man|dai dong|rom ra)\s+(?:qua|lam)\b.{0,12}\b(?:roi|day|nha|nhe)\b/g,
  /\bchi\s+can\b.{0,14}\b(?:cau\s+)?(?:tra loi|dap an|ket luan|answer)\b/g,
  /\b(?:only|just)\s+(?:need|want|give me)\b.{0,14}\b(?:the\s+)?(?:answer|verdict|conclusion)\b/g,
  /\bthang\s+(?:vao\s+)?(?:van de|y chinh|ket luan)\b|\bto the point\b|\bstraight to\b|\btl;?dr\b/g,
  /\b(?:be\s+)?(?:brief|concise)\b|\bkeep\s+(?:it|replies|answers|responses)\s+(?:short|brief)\b|\bshort\s+answers?\b|\bless\s+(?:detail|text|words)\b|\btoo\s+(?:long|wordy|verbose)\b|\bshorter\s+(?:answers?|replies)\b/g,
];
/** "no need to explain" is itself a brevity request — its own negation must not flip it. */
const BRIEF_SELF_NEGATED = /\b(?:khong|dung|ko|no)\s+(?:can\s+)?(?:giai thich|dan nhap|explanation|explain|fluff|preamble|intro)\b/g;
/** "đừng dài dòng" — a brevity request phrased as a negated length word. */
const NEGATED_LENGTH = /\b(?:dung|khong can|ko can)\s+(?:co\s+)?(?:dai dong|lan man|rom ra|lai nhai|dong dai)\b/g;
/**
 * "tóm tắt lại" / "chốt nhanh" are brevity requests only as a BARE clause. With an object ("tóm tắt lại kế hoạch
 * tuần") the same words ask for a summary of something, so they are ambiguous and are not counted.
 */
const BARE_BRIEF_CLAUSE = /^(?:tom tat|tom gon|chot nhanh|chot lai|chot luon)(?:\s+(?:lai|di|nhe|nha|thoi|luon|nao))*$/;
const DETAILED_PATTERNS: RegExp[] = [
  /\b(?:noi|giai thich|tra loi|viet)\s+(?:lai\s+)?(?:chi tiet|ky|day du|cu the)\b/g,
  /\b(?:chi tiet|ky|day du|dai)\s+hon\b/g,
  /\bin\s+(?:more\s+)?detail\b|\bmore\s+detail\b|\bexplain\s+(?:fully|thoroughly|more)\b|\bgo\s+deeper\b/g,
];

/**
 * The text with every verbosity cue phrase blanked out. R3 (segment first): what is left of a clause after its
 * expression cue is removed is classified on its own, so a valid style cue can never hide a sibling constraint.
 */
export function removeVerbosityCues(text: string): string {
  let out = text;
  for (const pattern of [...BRIEF_PATTERNS, ...DETAILED_PATTERNS, BRIEF_SELF_NEGATED, NEGATED_LENGTH]) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), " ");
  }
  return BARE_BRIEF_CLAUSE.test(out.trim()) ? " " : out;
}

type Cue = { index: number; value: Verbosity };

function collectCues(text: string, patterns: RegExp[], value: Verbosity): Cue[] {
  const cues: Cue[] = [];
  for (const pattern of patterns) {
    for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const index = m.index ?? 0;
      const negated = NEGATOR_BEFORE.test(text.slice(Math.max(0, index - 14), index));
      cues.push({ index, value: negated ? (value === "brief" ? "detailed" : "brief") : value });
    }
  }
  return cues;
}

/**
 * Small explicit-preference inference. The LAST explicit cue in the message wins; a negated cue flips
 * ("đừng ngắn quá" → detailed). Returns null when the message states no preference about reply length.
 */
export function inferVerbosityPreference(input: string | { text: string }): Verbosity | null {
  const text = typeof input === "string" ? normalizeInput(input).text : input.text;
  const cues = [
    ...collectCues(text, BRIEF_PATTERNS, "brief"),
    ...collectCues(text, DETAILED_PATTERNS, "detailed"),
  ];
  for (const m of text.matchAll(BRIEF_SELF_NEGATED)) cues.push({ index: m.index ?? 0, value: "brief" });
  for (const m of text.matchAll(NEGATED_LENGTH)) cues.push({ index: m.index ?? 0, value: "brief" });
  let offset = 0;
  for (const clause of text.split(/([.!?;,\n]+)/)) {
    const trimmed = clause.trim();
    if (trimmed && BARE_BRIEF_CLAUSE.test(trimmed)) cues.push({ index: offset + clause.indexOf(trimmed), value: "brief" });
    offset += clause.length;
  }
  if (cues.length === 0) return null;
  return cues.sort((a, b) => a.index - b.index).at(-1)?.value ?? null;
}

/* ------------------------------------------------------------------ */
/* Address                                                             */
/* ------------------------------------------------------------------ */

export type AddressSignal = { form: AddressForm; explicit: boolean };

const L = "(?<![\\p{L}])";
const R = "(?![\\p{L}])";
const word = (w: string): RegExp => new RegExp(`${L}${w}${R}`, "iu");

const HAS_MAY_ACCENTED = word("mày");
const HAS_MAY_ANY = word("m[àa]y");
const HAS_TAO = word("tao");
const EXPLICIT_MAY_TAO = /(?:xưng|xung)\s*(?:hô|ho)?\s*(?:là\s*|la\s*)?(?:mày|may)\s*[-–/ ]\s*tao|(?:mày|may)\s*[-–]\s*tao|tao\s*[-–]\s*(?:mày|may)|cứ\s+(?:mày|may)\s+tao|cu\s+may\s+tao/iu;
const explicitPair = (user: string, self: string): RegExp =>
  new RegExp(
    `(?:xưng|xung)\\s*(?:hô|ho)?\\s*(?:là\\s*|la\\s*)?${user}\\s*[-–/ ]\\s*${self}|${user}\\s*[-–]\\s*${self}|cứ\\s+${user}\\s+${self}|cu\\s+${user}\\s+${self}`,
    "iu",
  );
const EXPLICIT_BAN_TOI = explicitPair("(?:bạn|ban)", "(?:tôi|toi|mình|minh)");
const EXPLICIT_ONG_TOI = explicitPair("(?:ông|ong)", "(?:tôi|toi)");
const EXPLICIT_ANH_EM = /(?:xưng|xung)\s*(?:hô|ho)?\s*(?:là\s*|la\s*)?anh\s*[-–/ ]?\s*em|anh\s*[-–]\s*em(?![\p{L}])|(?:gọi|goi)\s+(?:tôi|toi|tao|mình|minh)\s+(?:là|la)\s+anh(?![\p{L}])/iu;
/** "đừng gọi tao là bạn" names a form the user does NOT want — it must never be read as choosing it. */
const NEGATED_CALL = /(?:đừng|dung|không|khong|ko|don['’]?t|do not|stop|never)\s+(?:có\s+)?$/iu;
/** "à không anh-em" is a CORRECTION ("no wait — anh-em"), not the negation "don't call me anh-em". */
const CORRECTION_BEFORE = /(?:^|[\s,;.!?])(?:à|a|ah|ờ|ừ)\s+(?:không|khong|no)\s+$/iu;
const isNegatedBy = (prefix: string): boolean => NEGATED_CALL.test(prefix) && !CORRECTION_BEFORE.test(prefix);
/** Explicit return to the neutral form of address ("xưng hô trung tính"). Needs the address noun: a bare "neutral" is tone. */
const EXPLICIT_NEUTRAL_ADDRESS = /(?:xưng\s*hô|xung\s*ho|cách\s+gọi|cach\s+goi|address)\s+(?:là\s+|la\s+)?(?:neutral|trung\s+tính|trung\s+tinh|bình\s+thường|binh\s+thuong|mặc\s+định|mac\s+dinh)|(?:neutral|trung\s+tính|trung\s+tinh)\s+(?:address|xưng\s*hô|xung\s*ho)/iu;
const REFUSED_FORM = /(?:đừng|dung|không|khong|ko|don['’]?t|do not|stop|never)\s+(?:có\s+)?(?:gọi|goi|call|xưng|xung)[^,.;!?\n]*/giu;
const CALL_ME =/(?:call me|(?:gọi|goi)\s+(?:tôi|toi|tao|mình|minh)\s+(?:là|la))/iu;

/**
 * Address is resolved from what the user actually says: an explicit instruction, then stable usage.
 * A user who merely calls THEMSELVES "tao" has not told us how to address them, so that alone is not a signal.
 */
export function detectAddressSignal(text: string): AddressSignal {
  if (EXPLICIT_MAY_TAO.test(text)) return { form: "tao_may", explicit: true };
  if (EXPLICIT_ANH_EM.test(text) && !isNegatedBy(text.slice(0, text.search(EXPLICIT_ANH_EM)))) {
    return { form: "anh_em", explicit: true };
  }
  if (EXPLICIT_ONG_TOI.test(text)) return { form: "ong", explicit: true };
  if (EXPLICIT_BAN_TOI.test(text)) return { form: "ban", explicit: true };
  if (EXPLICIT_NEUTRAL_ADDRESS.test(text)) return { form: "neutral", explicit: true };
  const call = CALL_ME.exec(text);
  if (call && !isNegatedBy(text.slice(0, call.index))) {
    const after = text.slice(call.index + call[0].length);
    if (/^\s*bro(?![\p{L}])/iu.test(after)) return { form: "bro", explicit: true };
    if (/^\s*ông(?![\p{L}])/iu.test(after)) return { form: "ong", explicit: true };
    if (/^\s*bạn(?![\p{L}])/iu.test(after)) return { form: "ban", explicit: true };
  }
  // A form the user is REFUSING ("đừng gọi tao là bạn") is a mention, not usage: it must not read as chosen.
  const used = text.replace(REFUSED_FORM, " ");
  if (HAS_MAY_ACCENTED.test(used) || (HAS_MAY_ANY.test(used) && HAS_TAO.test(used))) {
    return { form: "tao_may", explicit: false };
  }
  if (/\bbro\b/i.test(used)) return { form: "bro", explicit: false };
  if (word("ông").test(used)) return { form: "ong", explicit: false };
  if (word("bạn").test(used)) return { form: "ban", explicit: false };
  return { form: "unresolved", explicit: false };
}

const P = { l: "(?<![\\p{L}])", r: "(?![\\p{L}])" };
const wordRe = (w: string, flags = "giu"): RegExp => new RegExp(`${P.l}${w}${P.r}`, flags);

/** Capitalize the first letter after a removed sentence-initial pronoun. */
function recapitalize(text: string): string {
  return text.replace(/(^|[.!?]\s+|\n\s*)([\p{Ll}])/gu, (_m, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/** No address established: never invent bạn/ông/bro — drop the second-person pronoun (Vietnamese is pro-drop). */
function neutralizeVi(text: string): string {
  let out = text;
  for (const p of ["ông", "bạn", "cậu", "bro"]) {
    out = out
      .replace(new RegExp(`\\s*${P.l}của\\s+${p}${P.r}`, "giu"), "")
      .replace(new RegExp(`${P.l}${p}${P.r}\\s*`, "giu"), "");
  }
  return recapitalize(out).replace(/\s+([.,!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Address the user in the form the session established (explicit preference > stable usage > neutral).
 * `\b` is ASCII-only, so every Vietnamese word here is bounded with Unicode lookarounds.
 */
export function applyAddressToText(text: string, address: AddressForm, language: "en" | "vi"): string {
  if (language !== "vi") return address === "bro" ? text.replace(/\bsir\b/gi, "bro") : text;
  switch (address) {
    case "ong":
      return text.replace(wordRe("(?:bạn|bro|cậu|mày)"), "ông");
    case "ban":
      return text.replace(wordRe("(?:ông|bro|cậu|mày)"), "bạn");
    case "tao_may":
      return text
        .replace(wordRe("(?:ông|bạn|bro|cậu)"), "mày")
        .replace(wordRe("(?:mình|tôi)"), "tao");
    case "anh_em":
      // The user is "anh", Dante answers as "em". Self-reference is swapped only as a sentence-initial subject, so
      // "một mình" / "tự mình" (non-address roles) are left alone.
      return text
        .replace(wordRe("(?:ông|bạn|bro|cậu|mày)"), "anh")
        .replace(/(^|[.!?]\s+|\n\s*)(mình|tôi)(?=\s+\p{L})/giu, (_m, lead: string) => `${lead}Em`);
    case "bro":
      return text;
    default:
      return neutralizeVi(text);
  }
}

/* ------------------------------------------------------------------ */
/* Customer-service drift                                              */
/* ------------------------------------------------------------------ */

/**
 * Behaviour patterns, not a word ban: each entry is a scripted care/closing/hedging phrase that reads as a
 * support-desk macro. Ordinary contextual uses of the same words ("bạn tập" as a workout partner, "hy vọng
 * PR tuần sau") do not match because the patterns require the scripted frame.
 */
export const CS_DRIFT_PATTERNS: Array<[RegExp, string]> = [
  // English
  [/i['’]?m happy to help[^.!\n]*[.!]?\s*/giu, ""],
  [/i hope (?:this|that|it) helps[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:please )?feel free to (?:ask|reach out)[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:please )?don['’]?t hesitate to[^.!\n]*[.!]?\s*/giu, ""],
  [/if you have any (?:other |further )?questions[^.!\n]*[.!]?\s*/giu, ""],
  [/i understand (?:that )?you (?:may|might|could) (?:be )?feel[^.!\n]*[.!]?\s*/giu, ""],
  [/thank you for (?:your )?(?:patience|understanding|reaching out)[^.!\n]*[.!]?\s*/giu, ""],
  // Vietnamese
  [/rất vui được (?:giúp|hỗ trợ)[^.!\n]*[.!]?\s*/giu, ""],
  [/hy vọng (?:điều|thông tin|câu trả lời|những gì) (?:này|trên|đó)[^.!\n]*(?:giúp ích|hữu ích|giúp được)[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:mong|hi vọng) (?:rằng )?(?:điều|thông tin) (?:này|trên) (?:sẽ )?(?:giúp|hữu ích)[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:đừng|xin đừng|vui lòng đừng) ngần ngại[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:nếu|khi) (?:bạn|ông|anh|chị|cậu|quý khách)? ?(?:cần|có) (?:thêm )?(?:bất kỳ )?(?:câu hỏi|thắc mắc|hỗ trợ|giúp đỡ)[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:mình|tôi|chúng tôi) (?:hiểu|thấu hiểu) (?:rằng )?(?:bạn|ông|anh|chị|cậu)? ?(?:có thể )?(?:đang )?(?:cảm thấy|thấy)[^.!\n]*[.!]?\s*/giu, ""],
  [/cảm ơn (?:bạn|ông|anh|chị|cậu)? ?(?:đã )?(?:kiên nhẫn|thông cảm|liên hệ|quan tâm)[^.!\n]*[.!]?\s*/giu, ""],
  [/xin vui lòng[^.!\n]*[.!]?\s*/giu, ""],
  [/(?:nếu|khi) (?:bạn|ông) cần thêm[^.!\n]*[.!]?\s*/giu, ""],
  /* Long self-description of the assistant's own purpose. */
  [/(?:mục tiêu|nhiệm vụ|vai trò) của (?:mình|tôi|dante) (?:là|luôn là)[^.!\n]{20,}[.!]?\s*/giu, ""],
  [/(?:my|dante['’]?s) (?:goal|purpose|role|mission) is (?:to )?[^.!\n]{20,}[.!]?\s*/giu, ""],
];

export function stripCustomerService(text: string): string {
  return CS_DRIFT_PATTERNS.reduce((out, [pattern, repl]) => out.replace(pattern, repl), text)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasCustomerServiceDrift(text: string): boolean {
  return CS_DRIFT_PATTERNS.some(([pattern]) => new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text));
}

export { foldText };
