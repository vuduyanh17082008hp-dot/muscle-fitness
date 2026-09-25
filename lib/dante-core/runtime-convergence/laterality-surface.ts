/**
 * Laterality surface projection — shared by the Phase 1 claim projection and the output-claim validator.
 *
 * When authoritative state already says which side ("LEFT"), a draft that asserts the OTHER side must not be
 * "softened" into "vai (chưa chắc bên nào)": that turns a known fact into a claimed unknown (LATERALITY_FIDELITY).
 * The authoritative side is restated where the sentence is about yesterday's shoulder; elsewhere laterality is
 * simply omitted. A negated mention of the superseded side ("không phải vai phải") is truth-preserving and kept.
 */

export type Side = "LEFT" | "RIGHT";

const SIDE_WORDS: Record<Side, { vi: string; en: string; viRe: RegExp; enRe: RegExp }> = {
  LEFT: { vi: "vai trái", en: "left shoulder", viRe: /vai trái/gi, enRe: /\bleft shoulder\b/gi },
  RIGHT: { vi: "vai phải", en: "right shoulder", viRe: /vai phải/gi, enRe: /\bright shoulder\b/gi },
};

const NEGATION_BEFORE = /(?:không phải|chứ không phải|chứ không|khong phai|not(?: the)?|rather than|instead of)\s*$/i;
const YESTERDAY = /(?:hôm qua|hom qua|yesterday)/i;

function clauseAround(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf(".", index), text.lastIndexOf("!", index), text.lastIndexOf("?", index), text.lastIndexOf("\n", index)) + 1;
  const ends = [".", "!", "?", "\n"].map((c) => text.indexOf(c, index + length)).filter((i) => i >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length);
}

/** Replace mentions of `unauthorized` with the authoritative side (yesterday context) or a laterality-free word. */
export function projectAuthoritativeSide(
  text: string,
  unauthorized: Side,
  authoritative: Side,
  language: "en" | "vi",
): string {
  const words = SIDE_WORDS[unauthorized];
  const replaceOne = (re: RegExp, plain: string, own: (s: Side) => string): string =>
    text.replace(re, (match: string, ...rest: unknown[]) => {
      const offset = rest[rest.length - 2] as number;
      const source = rest[rest.length - 1] as string;
      if (NEGATION_BEFORE.test(source.slice(Math.max(0, offset - 24), offset))) return match;
      return YESTERDAY.test(clauseAround(source, offset, match.length)) ? own(authoritative) : plain;
    });
  const projected = language === "vi"
    ? replaceOne(new RegExp(words.viRe.source, words.viRe.flags), "vai", (s) => SIDE_WORDS[s].vi)
    : replaceOne(new RegExp(words.enRe.source, words.enRe.flags), "shoulder", (s) => SIDE_WORDS[s].en);
  // The other language's phrasing can appear in mixed text — project it too.
  return language === "vi"
    ? projected.replace(new RegExp(words.enRe.source, words.enRe.flags), (m, offset: number, source: string) =>
        NEGATION_BEFORE.test(source.slice(Math.max(0, offset - 24), offset)) ? m : "shoulder")
    : projected.replace(new RegExp(words.viRe.source, words.viRe.flags), (m, offset: number, source: string) =>
        NEGATION_BEFORE.test(source.slice(Math.max(0, offset - 24), offset)) ? m : "vai");
}

/** Text that asserts a shoulder side is "unknown" while authoritative state names one. */
export const LATERALITY_UNCERTAIN_MARKER = /vai \(chưa chắc bên nào\)|shoulder \(side uncertain\)/i;
