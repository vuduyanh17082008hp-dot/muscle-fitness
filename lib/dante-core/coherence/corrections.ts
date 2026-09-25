/**
 * Phase 2 — same-turn correction authority.
 *
 * Invariant: an EXPLICIT correction ("sửa lại", "à khoan", "nhớ lại", "actually", "nhầm rồi" …) outranks an
 * earlier assertion in the SAME message. The earlier value is not deleted — it is emitted first so the reducer
 * records it and then supersedes it (old value SUPERSEDED, new value ACTIVE, provenance of both kept).
 *
 * Operates on accent-folded text (see `understanding.ts::foldText`). Pure; reads the snapshot only to know
 * whether a bare correction has a referent.
 */

import type { CorrectionCandidate } from "@/lib/dante-core/coherence/types";

export const LATERALITY_TOPIC = "yesterday_shoulder_laterality";
export const DEADLINE_TOPIC = "deadline_weekday";

/** Words that turn the value that follows into an explicit correction of what came before. */
const MARKER_SOURCE = [
  "a khoan", "a khong", "a nham", "ua khong", "khoan da", "khong doi", "nham roi", "nham la", "noi nham", "nham",
  "sua lai", "chinh lai", "dinh chinh", "nho lai", "thuc ra", "y toi la", "y tao la", "y minh la",
  "no wait", "or wait", "wait", "actually", "correction", "i meant", "i misspoke", "my mistake", "sorry i meant", "oops",
].join("|");
const MARKER_RE = new RegExp(`\\b(?:${MARKER_SOURCE})\\b`, "g");
/** Suffix form: "thu 3 moi dung" — the value BEFORE it is the right one. */
const POSTFIX_RE = /\b(?:moi dung|moi chinh xac|moi la dung|is the right one|is the correct one)\b/;

const NEGATION_BEFORE = /(?:khong phai|ko phai|khong la|chu khong|chu ko|\bnot\b|rather than|thay vi|isn'?t|wasn'?t|khong)\s*(?:la\s+|the\s+)?$/;

type Mention<T extends string> = { index: number; end: number; value: T; negated: boolean; questioned: boolean };

function isNegated(text: string, index: number): boolean {
  return NEGATION_BEFORE.test(text.slice(Math.max(0, index - 20), index));
}

/**
 * A value the user is ASKING about ("hôm qua vai phải nhỉ?", "có phải vai phải không", "was it the right shoulder?")
 * is a request for confirmation, not an assertion — it must never overwrite a recorded value. The frame is local to
 * the mention, so "hôm qua đau vai phải, giờ tập được không?" (an assertion plus an unrelated question) still counts.
 */
const QUESTION_BEFORE = /(?:co phai|was it|is it|wasn'?t it|isn'?t it)\s+(?:hom qua\s+|yesterday\s+)?(?:la\s+)?(?:the\s+)?$/;
const QUESTION_AFTER = /^\s*(?:\?|(?:dung\s+(?:khong|ko)|nhi|ha|hen)\b)/;

/**
 * A value the user hedges ("hình như hôm qua đau vai trái, nhớ không rõ", "maybe the left one?") is an uncertain recall,
 * not a statement of fact: it must not become a durable AUTHORITATIVE correction (5R2 / F3 — Phase 1 already reads the same
 * sentence as USER_RECALL_UNCERTAIN, and two authority sources must not disagree about how sure the user was).
 */
const HEDGE_BEFORE = /(?:hinh nhu|khong chac|chua chac|co le|chac la|khong nho ro|maybe|perhaps|probably|i think|i guess|not sure|might have been|could have been)[^.;!?]{0,40}$/;
const HEDGE_AFTER = /^[^.;!?]{0,12}(?:nho khong ro|khong nho ro|khong chac|chua chac|not sure|don'?t remember|not certain)/;

function isQuestioned(text: string, index: number, end: number): boolean {
  return (
    QUESTION_BEFORE.test(text.slice(Math.max(0, index - 30), index))
    || QUESTION_AFTER.test(text.slice(end, end + 16))
    || HEDGE_BEFORE.test(text.slice(Math.max(0, index - 60), index))
    || HEDGE_AFTER.test(text.slice(end, end + 30))
  );
}

/**
 * A clause that is nothing but a side ("vai phải", "bên trái nhé", "right shoulder") is a direct statement of the
 * side — typically the answer to "which shoulder?". It needs no "hôm qua" anchor to be recorded, so a later
 * "à không, sửa lại là vai trái" has something to correct. A clause that carries anything else ("vai phải đau lắm",
 * "tập vai phải hôm nay") stays unrecorded: its time reference is genuinely ambiguous.
 */
const BARE_SIDE_FRAGMENT =
  /^(?:(?:la|o|con)\s+)?(?:(?:vai\s*(?:ben\s*)?|ben\s+)(?:trai|phai)|(?:the\s+)?(?:left|right)(?:\s+(?:shoulder|one|side))?)(?:\s+(?:nhe|nha|thoi|day|do|ay|ne))?\s*$/;

const SIDE_RE =
  /vai\s*(?:ben\s*)?(trai|phai)\b|\b(left|right)\s+(?:shoulder|one|side)\b|\bshoulder\s+(?:was\s+|is\s+)?(left|right)\b|\b(?:la|is|was|ben)\s+(?:vai\s+)?(trai|phai|left|right)\b(?!\s+(?:now|away|here|there))/g;

/**
 * "vai phải không đau" / "my right doesn't hurt": the side is named only to say it is NOT the painful one. It is a
 * negated mention even though the negation FOLLOWS it — otherwise the last-named side wins and the side that does not
 * hurt is persisted as the side that did.
 */
const NOT_PAINFUL_AFTER =
  /^\s*(?:thi\s+|cung\s+)?(?:(?:khong|ko|chua|het)\s+(?:bi\s+|con\s+|hoi\s+)?(?:dau|kho chiu|can|kich ung|nhuc)\b|(?:doesn['’]?t|does not|didn['’]?t|did not|isn['’]?t|is not|wasn['’]?t|was not)\s+(?:hurt|painful|sore|irritated)\b)/;

function sideMentions(text: string): Mention<"LEFT" | "RIGHT">[] {
  const out: Mention<"LEFT" | "RIGHT">[] = [];
  for (const m of text.matchAll(SIDE_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!raw) continue;
    const index = m.index ?? 0;
    out.push({
      index,
      end: index + m[0].length,
      value: raw === "trai" || raw === "left" ? "LEFT" : "RIGHT",
      negated: isNegated(text, index) || NOT_PAINFUL_AFTER.test(text.slice(index + m[0].length, index + m[0].length + 24)),
      questioned: isQuestioned(text, index, index + m[0].length),
    });
  }
  return out;
}

const WEEKDAYS: Array<[string, RegExp]> = [
  ["MONDAY", /\b(?:thu\s*(?:hai|2)|t2|monday)\b/g],
  ["TUESDAY", /\b(?:thu\s*(?:ba|3)|t3|tuesday)\b/g],
  ["WEDNESDAY", /\b(?:thu\s*(?:tu|4)|t4|wednesday)\b/g],
  ["THURSDAY", /\b(?:thu\s*(?:nam|5)|t5|thursday)\b/g],
  ["FRIDAY", /\b(?:thu\s*(?:sau|6)|t6|friday)\b/g],
  ["SATURDAY", /\b(?:thu\s*(?:bay|7)|t7|saturday)\b/g],
  ["SUNDAY", /\b(?:chu\s*nhat|sunday)\b/g],
];

function weekdayMentions(text: string): Mention<string>[] {
  const out: Mention<string>[] = [];
  for (const [value, re] of WEEKDAYS) {
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      out.push({
        index,
        end: index + m[0].length,
        value,
        negated: isNegated(text, index),
        questioned: isQuestioned(text, index, index + m[0].length),
      });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Correction markers in a chunk; markers that touch each other ("wait actually") count once. */
function markerSpans(chunk: string): Array<{ index: number; end: number }> {
  const spans: Array<{ index: number; end: number }> = [];
  for (const m of chunk.matchAll(MARKER_RE)) {
    const index = m.index ?? 0;
    const end = index + m[0].length;
    const last = spans.at(-1);
    if (last && index - last.end <= 14) last.end = end;
    else spans.push({ index, end });
  }
  return spans;
}

const opposite = (side: "LEFT" | "RIGHT"): "LEFT" | "RIGHT" => (side === "LEFT" ? "RIGHT" : "LEFT");

/** Value each explicit marker points at: the first affirmed mention after it (or the opposite of a negated one). */
function markerTargets<T extends string>(
  markers: Array<{ index: number; end: number }>,
  mentions: Mention<T>[],
  invert: (value: T) => T | null,
): T[] {
  const targets: T[] = [];
  markers.forEach((marker, i) => {
    const limit = markers[i + 1]?.index ?? Number.POSITIVE_INFINITY;
    const after = mentions.filter((m) => m.index >= marker.end && m.index < limit);
    const affirmed = after.find((m) => !m.negated);
    if (affirmed) {
      targets.push(affirmed.value);
      return;
    }
    const negated = after.find((m) => m.negated);
    const flipped = negated ? invert(negated.value) : null;
    if (flipped) targets.push(flipped);
  });
  return targets;
}

type SlotOutcome<T extends string> =
  | { kind: "none" }
  | { kind: "assert"; value: T }
  | { kind: "correct"; earlier: T | null; value: T }
  | { kind: "conflict"; values: T[] };

function resolveSlotChunk<T extends string>(input: {
  chunk: string;
  mentions: Mention<T>[];
  anchored: boolean;
  hasReferent: boolean;
  invert: (value: T) => T | null;
  postfix: boolean;
  /** The clause is a bare value with no time anchor of its own (see BARE_SIDE_FRAGMENT). */
  bareValue?: boolean;
}): SlotOutcome<T> {
  const { chunk, mentions, anchored, hasReferent, invert } = input;
  if (mentions.length === 0) return { kind: "none" };
  const markers = markerSpans(chunk);

  if (markers.length === 0) {
    if (input.postfix && POSTFIX_RE.test(chunk)) {
      const post = POSTFIX_RE.exec(chunk);
      const before = mentions.filter((m) => !m.negated && m.end <= (post?.index ?? 0));
      const value = before.at(-1)?.value;
      if (value) {
        const earlier = mentions.find((m) => !m.negated && m.value !== value)?.value ?? null;
        return { kind: "correct", earlier, value };
      }
    }
    if (!anchored && !input.bareValue) return { kind: "none" };
    const positive = mentions.filter((m) => !m.negated && !m.questioned);
    const last = positive.at(-1);
    return last ? { kind: "assert", value: last.value } : { kind: "none" };
  }

  const before = mentions.filter((m) => m.index < markers[0].index && !m.negated);
  // A correction needs a referent: a "yesterday" anchor, durable state, or — self-contained — an earlier assertion
  // of the same slot in this very clause ("vai phải — à khoan, vai trái").
  if (!anchored && !hasReferent && before.length === 0) return { kind: "none" };
  const targets = markerTargets(markers, mentions, invert);
  if (targets.length === 0) return { kind: "none" };
  if (new Set(targets).size > 1) return { kind: "conflict", values: [...new Set(targets)] };
  const value = targets[0];
  const earlierMention = before.at(-1);
  const earlier = earlierMention && earlierMention.value !== value ? earlierMention.value : null;
  // "X mới đúng" / value-first form: the marker sits after the value it confirms.
  return { kind: "correct", earlier, value };
}

/** Clauses split on sentence punctuation; a clause's trailing "?" is kept so a question about a value stays visible. */
const clausesOf = (folded: string): string[] =>
  (folded.match(/[^.;!?\n]+(?:\?+|[.;!\n]+)?/g) ?? []).map((c) => c.replace(/[.;!\n]+$/, "").replace(/\?+$/, "?"));

function toCandidates<T extends string>(topic: string, outcomes: SlotOutcome<T>[]): CorrectionCandidate[] {
  const found: CorrectionCandidate[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "conflict") {
      found.push({ topic, statement: "CONFLICT", conflictsWith: outcome.values[0] });
      for (const value of outcome.values) found.push({ topic, statement: value, conflictsWith: outcome.values[0] });
    } else if (outcome.kind === "correct") {
      if (outcome.earlier) found.push({ topic, statement: outcome.earlier, role: "earlier_assertion" });
      found.push({ topic, statement: outcome.value });
    } else if (outcome.kind === "assert") {
      found.push({ topic, statement: outcome.value });
    }
  }
  return found;
}

/**
 * Reduce a topic's candidates to what the message finally says. Conflicts are terminal (the user must choose);
 * otherwise the last explicit correction — or, failing that, the last assertion — is authoritative.
 */
function collapseTopic(candidates: CorrectionCandidate[]): CorrectionCandidate[] {
  if (candidates.some((c) => c.conflictsWith)) return candidates.filter((c) => c.conflictsWith);
  return candidates;
}

export type SlotResolution = {
  candidates: CorrectionCandidate[];
  /** The message carried an explicit correction (marker or "X mới đúng"), not just an assertion. */
  explicit: boolean;
  conflict: boolean;
  /** Final and superseded values, for reporting. */
  value: string | null;
  superseded: string | null;
};

function summarize<T extends string>(topic: string, outcomes: SlotOutcome<T>[]): SlotResolution {
  const corrected = outcomes.flatMap((o) => (o.kind === "correct" ? [o] : []));
  const conflictValues = [
    ...outcomes.flatMap((o) => (o.kind === "conflict" ? o.values : [])),
    ...(new Set(corrected.map((o) => o.value)).size > 1 ? [...new Set(corrected.map((o) => o.value))] : []),
  ];
  if (conflictValues.length > 0) {
    const values = [...new Set(conflictValues)];
    return {
      candidates: toCandidates(topic, [{ kind: "conflict", values }]),
      explicit: true,
      conflict: true,
      value: null,
      superseded: null,
    };
  }
  const candidates = collapseTopic(toCandidates(topic, outcomes));
  const last = corrected.at(-1);
  const finalValue = candidates.filter((c) => !c.role && !c.conflictsWith).at(-1)?.statement ?? null;
  return {
    candidates,
    explicit: corrected.length > 0,
    conflict: false,
    value: finalValue,
    superseded: last?.earlier ?? null,
  };
}

/** `hasReferent`: durable state already holds a laterality slot, so a bare "sửa lại, là vai trái" has a target. */
export function resolveLaterality(folded: string, hasReferent: boolean): SlotResolution {
  const outcomes: SlotOutcome<"LEFT" | "RIGHT">[] = [];
  for (const chunk of clausesOf(folded)) {
    if (!chunk.trim()) continue;
    outcomes.push(
      resolveSlotChunk({
        chunk,
        mentions: sideMentions(chunk),
        anchored: /\b(?:hom qua|hqua|yesterday)\b/.test(chunk),
        hasReferent: hasReferent && /\bvai\b|shoulder/.test(chunk),
        invert: opposite,
        postfix: false,
        bareValue: BARE_SIDE_FRAGMENT.test(chunk.replace(/\?+$/, "").trim()),
      }),
    );
  }
  return summarize(LATERALITY_TOPIC, outcomes);
}

export function resolveWeekday(folded: string): SlotResolution {
  const outcomes: SlotOutcome<string>[] = [];
  for (const chunk of clausesOf(folded)) {
    if (!chunk.trim()) continue;
    const mentions = weekdayMentions(chunk);
    // A weekday is only a *deadline* slot when the message talks about a deadline/due day or corrects it.
    const deadlineContext = /\b(?:deadline|due|nop|han|bai|assignment|homework|hoan thanh)\b/.test(chunk)
      || markerSpans(chunk).length > 0;
    if (!deadlineContext) continue;
    outcomes.push(
      resolveSlotChunk({ chunk, mentions, anchored: true, hasReferent: true, invert: () => null, postfix: true }),
    );
  }
  return summarize(DEADLINE_TOPIC, outcomes);
}

export function extractLateralityCorrections(folded: string, hasReferent: boolean): CorrectionCandidate[] {
  return resolveLaterality(folded, hasReferent).candidates;
}

export function extractWeekdayCorrections(folded: string): CorrectionCandidate[] {
  const resolved = resolveWeekday(folded);
  return resolved.conflict ? [] : resolved.candidates;
}
