/**
 * Phase 2.5a (Task 5R / R2) — use vs. mention scope for expression feedback.
 *
 * An expression preference may only come from text the user ASSERTS. Text that is merely MENTIONED must never become
 * a ProfileDelta or a core-conflict candidate:
 *
 *   ASSERTED      "Từ giờ nói ngắn thôi"                        -> may carry a preference
 *   QUOTED        "…" '…' `…` «…» spans                           -> masked out (a quoted phrase is being talked about)
 *   HYPOTHETICAL  "Nếu tao bảo … thì mày làm gì?" / "If I said …" -> dropped
 *   META          "… nghĩa là gì?" / "Translate …" / "means"       -> dropped
 *   EXAMPLE       "Ví dụ …" / "Test case: …" / "e.g."             -> dropped
 *
 * This is deliberately NOT a discourse parser: it decides per raw SENTENCE (before the discourse segmenter, which
 * would split a frame such as "Ví dụ người ta nói" from the phrase it introduces) with a handful of frame patterns,
 * and it errs one way only — when the scope is doubtful the text is treated as not asserted. A missed adaptation is
 * cheap; a persona mutation caused by a quotation is not.
 *
 * The one quoted span that stays asserted is the VALUE of an explicit address instruction: gọi tao là "anh".
 */

import { foldText } from "@/lib/dante-core/coherence/understanding";

export type SentenceScope = "ASSERTED" | "QUOTED" | "HYPOTHETICAL" | "META" | "EXAMPLE";

export type ScopedSentence = {
  /** Offsets into the RAW message. */
  start: number;
  end: number;
  scope: SentenceScope;
  /** ASSERTED: the sentence with quoted spans masked (and address-value quotes unwrapped). Otherwise "". */
  text: string;
};

const META_FRAME =
  /\b(?:nghia la gi|nghia gi|co nghia|nghia cua|means?|meaning|translate|translation|dich (?:sang|ra|giup|cau|cum|tu)|phien dich|giai thich (?:tu|cum|cau|y nghia)|what (?:does|do|is)\b.{0,48}\bmean|the (?:phrase|word|term)|cum tu)\b/;
const EXAMPLE_FRAME = /\b(?:vi du|vd|chang han|for example|for instance|e\.?g|test case|use case|edge case|example|sample)\b/;
const HYPOTHETICAL_FRAME =
  /\b(?:gia su|gia dinh|gia thu|thu tuong|suppose|supposing|imagine|what if|hypothetical|assuming)\b|\bneu (?:tao|toi|minh|em|anh|i|nguoi dung|ai do)\b.{0,24}\b(?:bao|noi|muon|thich|yeu cau|nho|hoi|want|say|said|tell|told|ask)\b|\bif (?:i|we|someone|they|a user|the user)\b.{0,30}\b(?:say|said|tell|told|ask|asked|want|wanted|were)\b/;
/** Reported speech by someone else is not the user's own preference. */
const REPORTED_FRAME = /\b(?:nguoi ta|ai do|ong ay|ong ta|co ay|anh ay|they|someone|he|she)\s+(?:hay\s+)?(?:noi|bao|viet|said|says|say|told|write|wrote)\b/;

/** "…" “…” «…» `…` and '…' — a single quote counts only when it is not inside a word ("don't", "I'm"). */
const QUOTE_SPAN = /"[^"\n]{1,160}"|“[^”\n]{1,160}”|«[^»\n]{1,160}»|`[^`\n]{1,160}`|(?<![\p{L}\p{N}])[‘'][^'’\n]{1,160}[’'](?![\p{L}\p{N}])/gu;
/** A quote that is the VALUE of an address instruction: gọi tao là "anh" / call me "bro". */
const ADDRESS_VALUE_BEFORE = /(?:gọi|goi|call|xưng hô|xưng|xung ho|xung|address)\s+(?:(?:tôi|toi|tao|mình|minh|me|us)\s+)?(?:là|la|as|by|bằng|bang)?\s*$/iu;

function sentenceRanges(raw: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const end = ch === "\n" || (/[.!?…]/.test(ch) && (i + 1 === raw.length || /\s/.test(raw[i + 1])));
    if (end) {
      out.push({ start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < raw.length) out.push({ start, end: raw.length });
  return out.filter((r) => raw.slice(r.start, r.end).trim().length > 0);
}

/** Masks quoted spans (kept as a blank so neighbouring words do not fuse); unwraps an address-instruction value. */
export function maskQuotedSpans(text: string): string {
  return text.replace(QUOTE_SPAN, (span, offset: number) => {
    if (ADDRESS_VALUE_BEFORE.test(text.slice(0, offset))) return ` ${span.slice(1, -1)} `;
    return " ";
  });
}

function frameOf(folded: string): SentenceScope | null {
  if (META_FRAME.test(folded)) return "META";
  if (EXAMPLE_FRAME.test(folded)) return "EXAMPLE";
  if (HYPOTHETICAL_FRAME.test(folded)) return "HYPOTHETICAL";
  if (REPORTED_FRAME.test(folded)) return "EXAMPLE";
  return null;
}

export function scopeSentences(raw: string): ScopedSentence[] {
  return sentenceRanges(raw).map(({ start, end }) => {
    const sentence = raw.slice(start, end);
    const frame = frameOf(foldText(sentence));
    if (frame) return { start, end, scope: frame, text: "" };
    const masked = maskQuotedSpans(sentence);
    if (!/[\p{L}\p{N}]/u.test(masked) && /[\p{L}\p{N}]/u.test(sentence)) return { start, end, scope: "QUOTED" as const, text: "" };
    return { start, end, scope: "ASSERTED" as const, text: masked };
  });
}

/**
 * The message with everything that is not asserted removed. Removed sentences leave a line break, so the remaining
 * sentences never fuse into one clause.
 */
export function assertedText(raw: string): string {
  const scoped = scopeSentences(raw);
  if (scoped.every((s) => s.scope === "ASSERTED" && s.text === raw.slice(s.start, s.end))) return raw;
  return scoped.map((s) => (s.scope === "ASSERTED" ? s.text : "\n")).join("");
}

/** True when the raw range [start, end) lies in an asserted sentence (its quoted spans are NOT masked here). */
export function isAssertedRange(raw: string, start: number): boolean {
  const sentence = scopeSentences(raw).find((s) => start >= s.start && start < s.end);
  return !sentence || sentence.scope === "ASSERTED";
}
