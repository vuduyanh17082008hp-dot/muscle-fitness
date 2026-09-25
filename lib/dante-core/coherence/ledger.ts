/**
 * Phase 2 — Obligation ledger.
 *
 *   RAW INPUT → LOSSLESS NORMALIZATION → DISCOURSE SEGMENTATION → SEMANTIC DECOMPOSITION → OBLIGATION LEDGER
 *
 * Every meaningful request in a message becomes an Obligation with a raw-text source span, a normalized meaning,
 * ambiguity metadata and (later) a disposition. The ledger is built from the discourse segments — not from the
 * shapes an extractor happened to recognise — so an unrecognised request is surfaced as an OPEN_REQUEST instead of
 * vanishing. `verifyLedgerCoverage` re-checks segments against obligations with a deliberately BROADER detector than
 * the one that built the ledger, so "no silent drop" cannot pass vacuously.
 *
 * Invariants owned here:
 *   INV-11 DEFENSE ISOLATION   a refusal applies to the obligation that triggered it; siblings stay alive.
 *   INV-13 LOCAL AMBIGUITY     one unclear obligation asks for clarification; its siblings are still handled.
 *   INV-14 PRESERVATION        14 meaningful obligations are 14 obligations until each has a disposition.
 */

import {
  DISPOSED,
  extractTurnObligations,
  OBLIGATION_PRIORITY,
  type HandledObligation,
  type ObligationDisposition,
  type ObligationIntent,
  type OpenRequestKind,
  type TurnObligation,
} from "@/lib/dante-core/runtime-convergence/multi-intent";
import { bindObligationScopes } from "@/lib/dante-core/reasoning-scope";
import { resolveLaterality, resolveWeekday } from "@/lib/dante-core/coherence/corrections";
import { inferVerbosityPreference } from "@/lib/dante-core/coherence/style";
import { isAssertedRange, maskQuotedSpans } from "@/lib/dante-core/coherence/expression-scope";
import {
  normalizeInput,
  segmentDiscourse,
  type DiscourseSegment,
  type NormalizedInput,
  type NormalizedToken,
} from "@/lib/dante-core/coherence/understanding";

export type SegmentRole = "obligation" | "context" | "meta";

export type LedgerSegment = DiscourseSegment & {
  role: SegmentRole;
  /** Obligation ids that carry this segment. */
  obligationIds: string[];
};

export type ObligationLedger = {
  raw: string;
  normalized: NormalizedInput;
  segments: LedgerSegment[];
  obligations: TurnObligation[];
};

/* ------------------------------------------------------------------ */
/* Segment predicates (all on folded + repaired text)                  */
/* ------------------------------------------------------------------ */

const META = /\b(?:tra loi het|tra loi day du|tra loi tat ca|tra loi cac y|answer (?:all|everything|each)|cover (?:all|every)|het cac y|tat ca cac y|cac y tren)\b/;

/** Reveal-verb + internal object: refusal territory. */
const PRIVACY =
  /\b(?:system\s*prompt|hidden\s*prompt|hidden\s*notes?|internal\s*state|context\s*capsule|decision\s*object|raw\s*(?:memory|context)|prompt\s*(?:he\s*thong|an|noi\s*bo)|chi\s*dan\s*(?:he\s*thong|an|noi\s*bo)|ghi\s*chu\s*an)\b|(?:\b(?:bo\s*qua|ignore|forget|quen)\s+(?:the\s+|your\s+|all\s+|moi\s+|cac\s+)?(?:system|he\s*thong|previous|prior|chi\s*dan))|(?:\b(?:reveal|tiet\s*lo|dump|in\s*ra|show|cho\s*xem|ke\s*(?:het|lai|nguyen\s*van))\b.{0,60}\b(?:memory|prompt|hidden|internal|noi\s*bo|instruction|state)\b)|(?:\bin\b.{0,20}\b(?:hidden|system)\b.{0,12}\bprompt\b)/;
const MEMORY_BOUNDARY =
  /\b(?:dung|khong|ko|dont|don't|do not|no need|khoi|stop|never|chua)\s+(?:can\s+|co\s+)?(?:luu|save|ghi(?:\s+nho)?|persist|store|nho|remember|log)\b.{0,32}\b(?:memory|tri\s*nho|bo\s*nho|remember|ghi\s*nho)\b|\b(?:memory|tri\s*nho|bo\s*nho)\b.{0,24}\b(?:dung|khong|ko|don't|do not)\s+(?:luu|save|ghi)\b|\b(?:dung|khong|ko|don't|do not)\s+(?:luu|save|ghi)\b.{0,20}\b(?:memory|tri\s*nho|cai\s*nay|dieu\s*nay|chuyen\s*nay)\b/;
const LANGUAGE_KEEP =
  /\b(?:dung|khong|ko|dont|don't|do not|no need|khoi|stop)\s+(?:can\s+|co\s+)?(?:doi|chuyen|switch|change|swap)\s+(?:sang\s+)?(?:ngon\s*ngu|language|tieng)\b|\b(?:giu|keep|stay|stick)\b.{0,24}\b(?:tieng\s*viet|vietnamese|ngon\s*ngu)\b|\b(?:english|tieng\s*anh)\b.{0,24}\b(?:chi\s*la|only|just)\s*(?:vi\s*du|example|vd)\b/;
const LANGUAGE_SWITCH_EN = /\b(?:tra\s*loi|reply|answer|respond|noi)\b.{0,16}\b(?:bang\s+)?(?:tieng\s*anh|english)\b|\benglish\s+please\b/;
const LANGUAGE_SWITCH_VI = /\b(?:tra\s*loi|reply|answer|respond|noi)\b.{0,16}\b(?:bang\s+)?(?:tieng\s*viet|vietnamese)\b/;

const INTERROGATIVE =
  /\b(?:nao|gi|sao|bao nhieu|bao lau|may (?:ngay|lan|tieng|set|rep|buoi|tuan|thang|phut|gio)|khi nao|luc nao|the nao|tai sao|vi sao|co nen|nen (?:lam|tap|an|nghi|ngu|chon|dung|tang|giam|bat dau)|duoc khong|co duoc|dung khong|phai khong|hay khong|hay la|what|why|how|when|which|where|who|whether|should|can i|could i|do i|does|is it|are there)\b/;
const FINAL_QUESTION = /\b(?:khong|hong|chua|nhi|the nao|sao)[?.!]*$/;
const FILLER = "(?:a|ua|oi|roi|ma|thoi|ok|vay|the|con|va|nua|hay|giup|lam on|please|pls|and|also|so|then|now|thi)";
const IMPERATIVE_VERB =
  "(?:viet|soan|lam|tra loi|giai thich|so sanh|goi y|de xuat|lap|tao|tinh|dich|tom tat|liet ke|ke|chi|dua|kiem tra|check|write|draft|compare|explain|list|summari[sz]e|give|tell|plan|suggest|make|create|show|calculate|translate|recommend|help|design|build|need (?:a|an|some|the|my)|i (?:want|need|would like) (?:you to|a|an|some|the|my)|cho (?:toi|tao|minh|em|t)|len (?:lich|ke hoach|thuc don|menu|chuong trinh)|huong dan|thiet ke|tu van|xay dung)";
const IMPERATIVE_START = new RegExp(`^(?:${FILLER}\\s+)*${IMPERATIVE_VERB}\\b`);
const DIRECTIVE_START =
  /^(?:(?:a|ua|oi|roi|ma|va|con|nua)\s+)*(?:dung|khong can|khoi|chi can|cu|coi nhu|bo qua|ignore|forget|quen di|don't|do not|no need|stop|always|luon|dont|never|only|just)\b/;
/** Broader "this asks something of you" cues — used by the coverage sweep, not by the primary classifier. */
const LOOSE_ASK =
  /\?|\b(?:cho (?:toi|tao|minh|em) (?:biet|xem)|giup (?:toi|tao|minh|em)|hay (?:cho|noi|chi|goi y)|can (?:ban|ong|may)|xin|please|could you|can you|would you|i (?:would )?like you to|i want you to|i need you to|(?:tao|toi|minh) (?:muon|can))\b/;

const STOP_WORDS = new Set([
  "toi", "tao", "minh", "may", "ban", "ong", "la", "va", "thi", "ma", "cua", "nhe", "nha", "nhi", "cai", "kia",
  "do", "nay", "ay", "con", "vay", "sao", "the", "nao", "gi", "khong", "co", "duoc", "nen", "giup", "voi", "roi",
  "a", "ok", "an", "is", "it", "that", "this", "what", "about", "how", "and", "or", "does", "hay", "cho", "de",
  "khi", "nua", "di", "da", "se", "dang", "rat", "qua", "lam", "thoi", "chi", "cung", "van", "no", "mot",
]);

function contentTokens(text: string): string[] {
  return text
    .replace(/[.,;:!?…—]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** Strip trailing punctuation from a segment's folded text so anchors like `$` behave. */
const bare = (segText: string): string => segText.replace(/[.,;:!?…—]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();

export function isRequestLike(seg: DiscourseSegment): boolean {
  const t = bare(seg.text);
  return (
    seg.hasQuestionMark
    || INTERROGATIVE.test(t)
    || FINAL_QUESTION.test(seg.text)
    || IMPERATIVE_START.test(t)
    || DIRECTIVE_START.test(t)
  );
}

function looksLikeAsk(seg: DiscourseSegment): boolean {
  return LOOSE_ASK.test(seg.raw.toLowerCase()) || LOOSE_ASK.test(seg.text);
}

/** A request with (almost) nothing to anchor it: only pronouns/deictics/particles. Ask, don't guess. */
function isAmbiguous(seg: DiscourseSegment): boolean {
  return contentTokens(seg.text).length <= 0
    || /^(?:con\s+)?(?:cai|chuyen|van de|y|no)\s+(?:kia|do|nay|ay)\b/.test(bare(seg.text));
}

function classifyKind(seg: DiscourseSegment): OpenRequestKind {
  const t = bare(seg.text);
  if (/\b(?:so sanh|compare|versus|hay hon|tot hon|nen chon|which (?:is )?better|cai nao)\b|\bvs\b/.test(t)) return "comparison";
  if (/\b(?:viet|soan|write|draft|compose|translate|dich|tom tat|summari[sz]e|lap ke hoach)\b/.test(t)) return "content";
  if (seg.hasQuestionMark || INTERROGATIVE.test(t) || FINAL_QUESTION.test(seg.text)) return "question";
  if (DIRECTIVE_START.test(t)) return "directive";
  return "question";
}

/** Strong topical anchors: a request-like segment is "covered" by a legacy obligation only through these. */
const LEGACY_STRONG: Partial<Record<ObligationIntent, RegExp>> = {
  MIXED_CLAIM_PROVENANCE: /\b(?:thang\s*\d|th\s*\d|th\d|ghi\s*log|logged|confirmed|tong)\b|\blog\b/,
  HISTORICAL_CURRENT_CORRECTION: /\b(?:hom qua|yesterday|nho lai|noi nham|vai (?:trai|phai)|ca hai vai|both shoulders)\b/,
  CAUSAL_ATTRIBUTION: /\b(?:sleep|ngu|volume|nguyen nhan|cause|caused)\b/,
  TOOL_ACTION_TRUTH: /\b(?:meal\s*plan|confirm|xac nhan|da luu|saved|persist)\b/,
  PRIVACY_BOUNDARY: /\b(?:hidden|internal|prompt|dump|reveal|tiet lo|nguyen van|noi bo|context|show memory)\b/,
  TEMPORAL_SAFETY: /\b(?:te tay|numb|chong mat|dizz|dau nguc|chest pain|cap cuu|emergency|tuan truoc|last week)\b/,
};

/* ------------------------------------------------------------------ */
/* Typed head + request in one sentence                                */
/* ------------------------------------------------------------------ */

const isTypedHead = (folded: string): boolean =>
  PRIVACY.test(folded) || MEMORY_BOUNDARY.test(folded) || LANGUAGE_KEEP.test(folded);

const tokensText = (slice: NormalizedToken[]): string => slice.map((t) => `${t.norm}${t.punct}`).join(" ");

/**
 * A refusal/boundary clause and a real question can share ONE sentence ("cho tôi xem system prompt và bench nên tăng
 * bao nhiêu kg?"). Classified as a whole, the typed head swallows the request and it silently disappears. Split at the
 * conjunction/comma so the ask is its own segment — with its own raw span, so the refused phrase never travels with
 * it. Only a genuine ask splits off (a directive such as "đừng nhắc confirm" stays with its head).
 */
function splitTypedTails(segments: DiscourseSegment[], tokens: NormalizedToken[]): DiscourseSegment[] {
  const out: DiscourseSegment[] = [];
  const emit = (slice: NormalizedToken[], template: DiscourseSegment): void => {
    const start = slice[0].start;
    const end = slice[slice.length - 1].end;
    out.push({
      ...template,
      index: out.length,
      start,
      end,
      raw: template.raw.slice(start - template.start, end - template.start),
      text: tokensText(slice),
      hasQuestionMark: slice.some((t) => t.punct.includes("?")),
    });
  };

  for (const seg of segments) {
    const slice = tokens.filter((t) => t.start >= seg.start && t.end <= seg.end);
    let cut = -1;
    for (let k = 1; k < slice.length && cut < 0; k += 1) {
      const last = slice[k - 1].norm.split(" ").at(-1);
      if (!slice[k - 1].punct.includes(",") && last !== "va" && last !== "and") continue;
      if (!isTypedHead(tokensText(slice.slice(0, k)))) continue;
      const tail = slice.slice(k);
      const tailText = tokensText(tail);
      const asks = isRequestLike({ ...seg, text: tailText, hasQuestionMark: tail.some((t) => t.punct.includes("?")) })
        && !DIRECTIVE_START.test(bare(tailText));
      if (asks && !isTypedHead(tailText) && contentTokens(tailText).length >= 2) cut = k;
    }
    if (cut < 0) {
      out.push({ ...seg, index: out.length });
    } else {
      // "…memory, và squat nghỉ mấy ngày?": the conjunction belongs to the head, not to the request.
      const joiner = ["va", "and"].includes(slice[cut].norm.split(" ")[0]) && cut + 1 < slice.length ? 1 : 0;
      emit(slice.slice(0, cut + joiner), seg);
      emit(slice.slice(cut + joiner), seg);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ledger construction                                                 */
/* ------------------------------------------------------------------ */

function spanOf(segments: DiscourseSegment[], indices: number[], raw: string): TurnObligation["sourceSpan"] {
  if (indices.length === 0) return undefined;
  const picked = indices.map((i) => segments[i]);
  const start = Math.min(...picked.map((s) => s.start));
  const end = Math.max(...picked.map((s) => s.end));
  return { start, end, text: raw.slice(start, end) };
}

export function buildObligationLedger(
  message: string,
  options: { hasLateralityReferent?: boolean } = {},
): ObligationLedger {
  const normalized = normalizeInput(message);
  const base = splitTypedTails(segmentDiscourse(normalized), normalized.tokens);
  const segments: LedgerSegment[] = base.map((s) => ({ ...s, role: "context", obligationIds: [] }));

  // Legacy (Phase 1) detectors run on the raw text and on the repaired text, so typos/no-accent variants of the
  // same six intents are still found. Union by intent.
  const legacy = new Map<ObligationIntent, TurnObligation>();
  for (const o of [...extractTurnObligations(message), ...extractTurnObligations(normalized.text)]) {
    if (!legacy.has(o.intent)) legacy.set(o.intent, { ...o, payload: { ...o.payload } });
  }

  const obligations = new Map<string, TurnObligation>();
  const attach = (o: TurnObligation, indices: number[]): void => {
    const existing = obligations.get(o.id);
    const merged = existing
      ? { ...existing, segmentIndices: [...new Set([...(existing.segmentIndices ?? []), ...indices])].sort((a, b) => a - b) }
      : { ...o, segmentIndices: [...new Set(indices)].sort((a, b) => a - b) };
    merged.sourceSpan = spanOf(segments, merged.segmentIndices ?? [], message) ?? merged.sourceSpan;
    obligations.set(o.id, merged);
    for (const i of indices) {
      segments[i].role = "obligation";
      if (!segments[i].obligationIds.includes(o.id)) segments[i].obligationIds.push(o.id);
    }
  };
  const make = (
    id: string,
    intent: ObligationIntent,
    payload: TurnObligation["payload"],
  ): TurnObligation => ({ id, intent, payload, priority: OBLIGATION_PRIORITY[intent] });

  const folded = normalized.text;
  const laterality = resolveLaterality(folded, options.hasLateralityReferent ?? false);
  const weekday = resolveWeekday(folded);

  // Slot corrections: an EXPLICIT correction is an obligation (acknowledge + apply); a bare assertion is not.
  const sideWord = /\b(?:vai\s*(?:ben\s*)?(?:trai|phai)|left|right|hom qua|yesterday)\b/;
  const markerWord = /\b(?:a khoan|a khong|a nham|khoan da|nham roi|nham la|noi nham|sua lai|chinh lai|nho lai|thuc ra|wait|actually|i meant|misspoke|oops)\b/;
  const weekdayWord = /\b(?:thu\s*(?:hai|ba|tu|nam|sau|bay|[2-7])|t[2-7]|chu\s*nhat|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;

  if (laterality.explicit || legacy.has("HISTORICAL_CURRENT_CORRECTION")) {
    const hit = segments.filter((s) => sideWord.test(s.text) || (laterality.explicit && markerWord.test(s.text))).map((s) => s.index);
    const found = legacy.get("HISTORICAL_CURRENT_CORRECTION") ?? make("obl_correction", "HISTORICAL_CURRENT_CORRECTION", { reason: "laterality_or_current_state_correction" });
    found.payload = { ...found.payload, ...(laterality.value ? { value: laterality.value } : {}), ...(laterality.superseded ? { superseded: laterality.superseded } : {}) };
    attach(found, hit);
  }
  if (weekday.explicit && !weekday.conflict) {
    const hit = segments.filter((s) => weekdayWord.test(s.text) || markerWord.test(s.text)).map((s) => s.index);
    attach(
      make("obl_deadline", "DEADLINE_CORRECTION", {
        reason: "deadline_weekday_correction",
        ...(weekday.value ? { value: weekday.value } : {}),
        ...(weekday.superseded ? { superseded: weekday.superseded } : {}),
      }),
      hit,
    );
  }

  const strongFor = (seg: LedgerSegment): ObligationIntent | null => {
    for (const [intent, re] of Object.entries(LEGACY_STRONG) as Array<[ObligationIntent, RegExp]>) {
      if (legacy.has(intent) && re.test(seg.text)) return intent;
    }
    return null;
  };

  for (const seg of segments) {
    if (META.test(seg.text)) {
      seg.role = "meta";
      continue;
    }
    if (seg.obligationIds.length > 0) continue;
    const t = bare(seg.text);

    // Typed detectors are independent: a run-on segment (no punctuation) can carry several of them, and each one
    // is its own obligation — a refusal never absorbs the boundary or preference next to it.
    let typed = false;
    if (PRIVACY.test(t)) {
      attach(legacy.get("PRIVACY_BOUNDARY") ?? make("obl_privacy", "PRIVACY_BOUNDARY", { reason: "memory_or_internal_dump_ask" }), [seg.index]);
      typed = true;
    }
    if (MEMORY_BOUNDARY.test(t)) {
      attach(make("obl_memory_boundary", "MEMORY_BOUNDARY", { reason: "user_forbids_persisting_to_memory" }), [seg.index]);
      typed = true;
    }
    if (LANGUAGE_KEEP.test(t)) {
      attach(make("obl_language", "LANGUAGE_PREFERENCE", { reason: "keep_current_language", kind: "keep" }), [seg.index]);
      typed = true;
    } else if (LANGUAGE_SWITCH_EN.test(t) || LANGUAGE_SWITCH_VI.test(t)) {
      attach(
        make("obl_language", "LANGUAGE_PREFERENCE", {
          reason: "explicit_language_switch",
          kind: LANGUAGE_SWITCH_EN.test(t) ? "switch_en" : "switch_vi",
        }),
        [seg.index],
      );
      typed = true;
    }
    // Use vs. mention: a preference in a quoted / hypothetical / meta / example sentence is being talked about, not
    // asserted — it must not become a STYLE_PREFERENCE obligation (which would also swallow the real question).
    const maskedRaw = isAssertedRange(message, seg.start) ? maskQuotedSpans(seg.raw) : null;
    const verbosity = maskedRaw === null ? null : inferVerbosityPreference(maskedRaw === seg.raw ? { text: t } : maskedRaw);
    if (verbosity) {
      attach(make("obl_style", "STYLE_PREFERENCE", { reason: "reply_length_preference", kind: verbosity }), [seg.index]);
      typed = true;
    }
    if (typed) continue;

    if (!isRequestLike(seg)) continue;
    const covered = strongFor(seg);
    if (covered) {
      const owner = legacy.get(covered);
      if (owner) attach(owner, [seg.index]);
      continue;
    }
    attach(
      make(`obl_req_${seg.index}`, "OPEN_REQUEST", {
        reason: "request_without_dedicated_handler",
        kind: classifyKind(seg),
        normalized: bare(seg.text),
        ambiguity: isAmbiguous(seg) ? "ambiguous" : "clear",
      }),
      [seg.index],
    );
  }

  // Legacy obligations no segment claimed (whole-message detectors) are kept as they were detected.
  for (const o of legacy.values()) if (!obligations.has(o.id)) attach(o, []);

  // Semantic coverage sweep: anything that still looks like an ask but was not classified is surfaced — never dropped.
  for (const seg of segments) {
    if (seg.role !== "context" || META.test(seg.text)) continue;
    if (!looksLikeAsk(seg) || contentTokens(seg.text).length < 2) continue;
    attach(
      make(`obl_req_${seg.index}`, "OPEN_REQUEST", {
        reason: "unclassified_request_like_segment",
        kind: "unclassified",
        normalized: bare(seg.text),
        ambiguity: isAmbiguous(seg) ? "ambiguous" : "clear",
      }),
      [seg.index],
    );
  }

  const ordered = [...obligations.values()].sort(
    (a, b) =>
      a.priority - b.priority
      || (a.segmentIndices?.[0] ?? Number.MAX_SAFE_INTEGER) - (b.segmentIndices?.[0] ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id),
  );
  return { raw: message, normalized, segments, obligations: bindObligationScopes(message, ordered) };
}

/* ------------------------------------------------------------------ */
/* Coverage + disposition checks (Gate A / pre-emit)                   */
/* ------------------------------------------------------------------ */

/**
 * Segments that look like they ask something of Dante but no obligation carries. Uses the broader detector on
 * purpose, and inspects segments independently of how the ledger was built.
 */
export function verifyLedgerCoverage(ledger: Pick<ObligationLedger, "segments" | "obligations">): {
  ok: boolean;
  uncovered: number[];
  requestSegments: number;
  coveredSegments: number;
} {
  const carried = new Set(ledger.obligations.flatMap((o) => o.segmentIndices ?? []));
  const candidates = ledger.segments.filter((s) => {
    if (META.test(s.text)) return false;
    if (s.role === "obligation" || carried.has(s.index)) return true;
    return isRequestLike(s) || (looksLikeAsk(s) && contentTokens(s.text).length >= 2);
  });
  const uncovered = candidates.filter((s) => !carried.has(s.index)).map((s) => s.index);
  return {
    ok: uncovered.length === 0,
    uncovered,
    requestSegments: candidates.length,
    coveredSegments: candidates.length - uncovered.length,
  };
}

/**
 * Obligations with no disposition in `handled`. Matches by obligation id, or — for callers whose handlers label by
 * intent — by intent with cardinality preserved (three OPEN_REQUESTs need three dispositions, not one).
 */
export function undisposedObligations<O extends { id: string; intent: string }>(
  obligations: ReadonlyArray<O>,
  handled: ReadonlyArray<{ id: string; intent: string; disposition?: ObligationDisposition }>,
): O[] {
  const live = handled.filter((h) => !h.disposition || DISPOSED.has(h.disposition));
  const byId = new Set(live.map((h) => h.id));
  const spare = new Map<string, number>();
  for (const h of live) if (!obligations.some((o) => o.id === h.id)) spare.set(h.intent, (spare.get(h.intent) ?? 0) + 1);
  const missing: O[] = [];
  for (const o of obligations) {
    if (byId.has(o.id)) continue;
    const left = spare.get(o.intent) ?? 0;
    if (left > 0) spare.set(o.intent, left - 1);
    else missing.push(o);
  }
  return missing;
}

/**
 * detected obligations must equal disposed obligations. Returns the ids that have no user-visible disposition,
 * and — INV-11 — whether one refusal swallowed siblings.
 */
export function checkDispositions(
  obligations: ReadonlyArray<Pick<TurnObligation, "id" | "intent">>,
  handled: ReadonlyArray<Pick<HandledObligation, "id" | "intent" | "disposition">>,
): { ok: boolean; undisposed: string[]; refused: number; siblingsMissing: number } {
  const undisposed = undisposedObligations(obligations, handled).map((o) => o.id);
  const refused = handled.filter((h) => h.disposition === "REFUSED").length;
  return {
    ok: undisposed.length === 0,
    undisposed,
    refused,
    siblingsMissing: refused > 0 ? undisposed.length : 0,
  };
}

/** Deterministic obligations can be answered without a provider; open ones cannot. */
export function isDeterministicLedger(obligations: ReadonlyArray<Pick<TurnObligation, "intent" | "payload">>): boolean {
  return !obligations.some((o) => o.intent === "OPEN_REQUEST" && o.payload.ambiguity !== "ambiguous");
}

/**
 * Does this turn need the obligation-ledger route (per-obligation dispositions) rather than a single answer path?
 *  - two or more dedicated obligations (as Phase 1 always did), or
 *  - one refusal-class obligation next to ordinary requests: INV-11 — the refusal must not become the whole reply.
 * A lone open request, or one dedicated obligation with a single ordinary ask, keeps its specialised route.
 */
const LEDGER_ROUTED: ReadonlySet<ObligationIntent> = new Set<ObligationIntent>([
  "PRIVACY_BOUNDARY",
  "MEMORY_BOUNDARY",
  "DEADLINE_CORRECTION",
  "LANGUAGE_PREFERENCE",
]);

export function isLedgerMultiTurn(obligations: ReadonlyArray<Pick<TurnObligation, "intent" | "payload">>): boolean {
  const dedicated = obligations.filter((o) => o.intent !== "OPEN_REQUEST");
  const open = obligations.filter((o) => o.intent === "OPEN_REQUEST");
  if (dedicated.length >= 2) return true;
  // One boundary/refusal/applied-class obligation next to ordinary requests: the ledger route keeps each one alive.
  return dedicated.length === 1 && open.length >= 1 && LEDGER_ROUTED.has(dedicated[0].intent);
}

export function openRequests(obligations: ReadonlyArray<TurnObligation>): TurnObligation[] {
  return obligations.filter((o) => o.intent === "OPEN_REQUEST" && o.payload.ambiguity !== "ambiguous");
}

/**
 * After a provider (or any generation stage) answered: a DEFERRED open request becomes ANSWERED when the draft
 * touches its content terms, otherwise NEEDS_CLARIFICATION with a targeted one-line question. Never dropped.
 */
export function disposeOpenRequests(input: {
  handled: HandledObligation[];
  draft: string;
  language: "en" | "vi";
  /** P-15R: each open request keeps its own scoped draft. Absent → legacy single-carrier text. */
  draftsByObligationId?: Record<string, string>;
}): HandledObligation[] {
  if (input.draftsByObligationId) {
    return input.handled.map((h) => {
      if (h.intent !== "OPEN_REQUEST" || h.disposition !== "DEFERRED") return h;
      const part = input.draftsByObligationId?.[h.id]?.trim() ?? "";
      if (part) {
        return { ...h, disposition: "ANSWERED" as ObligationDisposition, text: part, origin: "PROVIDER_OUTPUT" as const };
      }
      const excerpt = (h.sourceSpan?.text ?? "").replace(/\s+/g, " ").slice(0, 70);
      return {
        ...h,
        disposition: "NEEDS_CLARIFICATION" as ObligationDisposition,
        text: input.language === "vi"
          ? `Phần "${excerpt}" mình chưa trả lời được từ dữ kiện hiện có — nói rõ hơn giúp.`
          : `I could not answer "${excerpt}" from what I have — say a bit more and I will.`,
      };
    });
  }
  const draftTokens = new Set(contentTokens(normalizeInput(input.draft).text));
  // Only a request THIS call disposed can carry the generated text; an open request that was already answered
  // deterministically (a safety-constrained answer, a rejected core-conflict clause) keeps its own text.
  const generated = new Set<string>();
  const decided = input.handled.map((h) => {
    if (h.intent !== "OPEN_REQUEST" || h.disposition !== "DEFERRED") return h;
    const terms = contentTokens(h.payload.normalized ?? "");
    const hit = input.draft.trim().length > 0 && (terms.length === 0 || terms.some((term) => draftTokens.has(term)));
    if (hit) {
      generated.add(h.id);
      return { ...h, disposition: "ANSWERED" as ObligationDisposition };
    }
    const excerpt = (h.sourceSpan?.text ?? "").replace(/\s+/g, " ").slice(0, 70);
    return {
      ...h,
      disposition: "NEEDS_CLARIFICATION" as ObligationDisposition,
      text: input.language === "vi"
        ? `Phần "${excerpt}" mình chưa trả lời được từ dữ kiện hiện có — nói rõ hơn giúp.`
        : `I could not answer "${excerpt}" from what I have — say a bit more and I will.`,
    };
  });
  // One generation call answered all the open requests together: its text rides on the first answered one, so the
  // composed reply carries it exactly once, in ledger order, after the decisions that were already made.
  const carrier = decided.findIndex((h) => generated.has(h.id));
  // The carrier's text is provider prose: it is marked so the authority guard cannot mistake it for a decision.
  return decided.map((h, index) => (index === carrier ? { ...h, text: input.draft.trim(), origin: "PROVIDER_OUTPUT" as const } : h));
}
