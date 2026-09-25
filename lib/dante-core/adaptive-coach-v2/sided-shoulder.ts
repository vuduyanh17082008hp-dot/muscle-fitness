/**
 * Side-scoped shoulder statements ("vai trái đau, vai phải không đau" / "my left shoulder hurts, my right doesn't").
 *
 * The generic shoulder synthesizers read a message as ONE shoulder fact, so the negative sibling of a contrast pair
 * ("vai phải không đau") turned the whole turn into "no shoulder pain" and the painful side disappeared. This parser
 * finds each clause's own side and its own polarity so both survive. Pure, deterministic, works on accent-folded text.
 */

export type SidedShoulderStatement = {
  side: "LEFT" | "RIGHT";
  /** The clause says this side hurts (true) or does not hurt (false). */
  painful: boolean;
  clause: string;
  sentence: string;
};

const SENTENCE_BREAK = /[.!?;\n]+/;
/** Comma / contrast word, or a plain "and" that introduces another side ("vai trái đau và vai phải không đau"). */
const CLAUSE_BREAK =
  /,|\s+(?:nhung|whereas|while|but|tuy nhien)\s+|\s+(?:va|and|con|the)\s+(?=(?:vai\s+(?:ben\s+)?|ben\s+)(?:trai|phai)\b|(?:my\s+|the\s+)?(?:left|right)\b)/;

const SHOULDER_WORD = /\b(?:vai|shoulder)\b/;
const VI_SIDE = /\b(?:vai\s+(?:ben\s+)?|ben\s+)(trai|phai)\b/g;
const EN_SIDE = /\b(?:(?:my|the)\s+)?(left|right)(?:\s+(?:shoulder|one|side))?\b/g;

const NEGATIVE_AFTER_SIDE = [
  /^\s*(?:thi\s+|cung\s+)?(?:khong|ko|chua|het)\s+(?:bi\s+|con\s+|hoi\s+)?(?:dau|kho chiu|can|kich ung|nhuc|van de|sao)\b/,
  /^\s*(?:thi\s+)?(?:khong|ko)\s*$/,
  /^\s*(?:thi\s+)?(?:binh thuong|on|ok|khoe|tot)\b/,
  /^\s*(?:shoulder\s+)?(?:doesn['’]?t|does not|didn['’]?t|did not|isn['’]?t|is not|wasn['’]?t|was not|is fine|was fine|is ok|is okay|feels fine|is pain[- ]?free|is good|has no pain)\b/,
  /^\s*(?:shoulder\s+)?(?:doesn['’]?t|does not|didn['’]?t|did not)\s+hurt\b/,
  /\bno pain\b|\bpain[- ]?free\b/,
];
const POSITIVE_AFTER_SIDE = /\b(?:dau|kich ung|kho chiu|can|nhuc|hurts?|hurt|hurting|aches?|aching|painful|sore|irritated|bothering)\b/;

type SideHit = { side: "LEFT" | "RIGHT"; end: number };

function sideHits(clause: string, sentenceHasShoulder: boolean): SideHit[] {
  const hits: SideHit[] = [];
  for (const m of clause.matchAll(VI_SIDE)) {
    hits.push({ side: m[1] === "trai" ? "LEFT" : "RIGHT", end: (m.index ?? 0) + m[0].length });
  }
  // "left"/"right" are ordinary English words: they only name a side inside a shoulder context.
  if (sentenceHasShoulder || SHOULDER_WORD.test(clause)) {
    for (const m of clause.matchAll(EN_SIDE)) {
      hits.push({ side: m[1] === "left" ? "LEFT" : "RIGHT", end: (m.index ?? 0) + m[0].length });
    }
  }
  return hits;
}

/** "vai phải đau — à không, vai trái mới đau": a correction marker retracts the statement it trails / leads into. */
const CORRECTION_MARK = /\b(?:a khong|a khoan|ua khong|khoan da|nham roi|nham la|sua lai|no wait|or wait|wait|actually|i meant)\b/;

/**
 * Every clause that names exactly one side and says whether it hurts. Clauses with no pain predicate are skipped.
 * A statement the same sentence retracts ("… — à không, …") is not returned: the correction outranks it.
 */
export function extractSidedShoulderStatements(normalized: string): SidedShoulderStatement[] {
  const out: SidedShoulderStatement[] = [];
  for (const sentence of normalized.split(SENTENCE_BREAK)) {
    if (!sentence.trim()) continue;
    const sentenceHasShoulder = SHOULDER_WORD.test(sentence);
    const inSentence: SidedShoulderStatement[] = [];
    for (const clause of sentence.split(CLAUSE_BREAK)) {
      const mark = CORRECTION_MARK.exec(clause);
      const hits = sideHits(clause, sentenceHasShoulder);
      if (hits.length !== 1) {
        // "…, à không, vai trái mới đau": the marker sits in a clause of its own — it retracts the previous statement.
        if (mark && hits.length === 0) inSentence.pop();
        continue;
      }
      const after = clause.slice(hits[0].end);
      const negative = NEGATIVE_AFTER_SIDE.some((re) => re.test(after));
      const positive = !negative && POSITIVE_AFTER_SIDE.test(after);
      if (!negative && !positive) continue;
      // A marker AFTER the side ("vai phải đau — à không") retracts this very statement; one BEFORE it retracts the last one.
      if (mark && mark.index >= hits[0].end) continue;
      if (mark && mark.index < hits[0].end) inSentence.pop();
      inSentence.push({ side: hits[0].side, painful: positive, clause, sentence });
    }
    out.push(...inSentence);
  }
  return out;
}

/**
 * The statements when they form a contrast (one side hurts, the OTHER side does not); otherwise []. Only a contrast is
 * reinterpreted — a single sided statement keeps the established single-shoulder reading.
 */
export function sidedShoulderContrast(normalized: string): SidedShoulderStatement[] {
  const statements = extractSidedShoulderStatements(normalized);
  const painful = new Set(statements.filter((s) => s.painful).map((s) => s.side));
  const notPainful = new Set(statements.filter((s) => !s.painful).map((s) => s.side));
  const hasContrast = [...painful].some((side) => notPainful.has(side === "LEFT" ? "RIGHT" : "LEFT"));
  const conflicting = [...painful].some((side) => notPainful.has(side));
  return hasContrast && !conflicting ? statements : [];
}

/**
 * The text with every side-scoped clause (and the correction marker leading into one) removed. The single-shoulder
 * readings run on THIS, so "hiện tại cả hai vai không đau" elsewhere in the turn still counts, while the "không đau"
 * that belongs to one side can no longer be read as a statement about the whole shoulder.
 */
export function withoutSidedClauses(normalized: string): string {
  const sentences: string[] = [];
  for (const sentence of normalized.split(SENTENCE_BREAK)) {
    if (!sentence.trim()) continue;
    const sentenceHasShoulder = SHOULDER_WORD.test(sentence);
    const kept: string[] = [];
    let previousDropped = false;
    for (const clause of sentence.split(CLAUSE_BREAK)) {
      const hits = sideHits(clause, sentenceHasShoulder);
      const after = hits.length === 1 ? clause.slice(hits[0].end) : "";
      const sided = hits.length === 1 && (NEGATIVE_AFTER_SIDE.some((re) => re.test(after)) || POSITIVE_AFTER_SIDE.test(after));
      const markerOnly = hits.length === 0 && previousDropped && CORRECTION_MARK.test(clause);
      previousDropped = sided;
      if (!sided && !markerOnly) kept.push(clause);
    }
    if (kept.some((clause) => clause.trim())) sentences.push(kept.join(", "));
  }
  return sentences.join(". ");
}
