/**
 * Phase 2.5a — feedback interpreter + preference admissibility.
 *
 * One small, deterministic classification of what the user's message says about EXPRESSION:
 *
 *   FACT_CORRECTION      a fact is being corrected            -> truth/correction state only (never expression)
 *   EXPRESSION_FEEDBACK  implicit or explicit style feedback   -> expression path
 *   TURN_OVERRIDE        "câu này …" / "this time …"           -> this turn only; never persisted
 *   PREFERENCE_CHANGE    "từ giờ …" / "from now on …"          -> explicit durable preference
 *   NORMAL_REQUEST       nothing about expression
 *
 * ADMISSIBILITY (every attempted change, TURN overrides included): a candidate is admitted only if it maps cleanly
 * to one of { addressStyle, familiarity, humor, verbosity }. That allowlist is the whole prefilter — there is no
 * suspicious-word list. A clause that maps to none of them but constrains Dante's own behaviour ("cứ đồng ý với
 * tao", "đừng bao giờ cảnh báo tao") becomes a core-conflict CANDIDATE for the conditional classifier; anything
 * else is an ordinary request.
 *
 * Promotion never compares raw text: every phrase is normalised to a canonical (dimension, value) pair. An
 * ambiguous phrase produces no event — a missed promotion is preferred to a false one.
 */

import { fromAddressForm } from "@/lib/dante-core/coherence/expression";
import { assertedText } from "@/lib/dante-core/coherence/expression-scope";
import { detectAddressSignal, inferVerbosityPreference, removeVerbosityCues, type AddressSignal } from "@/lib/dante-core/coherence/style";
import { normalizeInput } from "@/lib/dante-core/coherence/understanding";
import type {
  ExpressionAnalysis,
  ExpressionChange,
  ExpressionDimension,
  ExpressionEvent,
  FeedbackKind,
  Familiarity,
  Humor,
  PreferenceScope,
} from "@/lib/dante-core/coherence/types";

/** This message only. */
const TURN_MARK = /\b(?:cau nay|lan nay|rieng cau nay|luot nay|cai nay|this time|for this (?:one|answer|reply|question|message)|just this once|this one)\b/;
/** A stated change of preference. */
const CHANGE_MARK = /\b(?:tu gio(?: tro di)?|ve sau|tu nay|sau nay|tu bay gio|from now on|going forward|moving forward|hereafter|from here on|in future)\b/;
/** Other explicit durable language. */
const DURABLE_MARK = /\b(?:cu|luon|mai mai|tao thich|toi thich|minh thich|always|i (?:prefer|like)|dung goi|khong goi|dung xung)\b/;

const CLAUSE_SPLIT = /[.!?;,\n]+|\s+(?:nhung|con|voi lai|roi|ma)\s+/;
const STYLE_VERB = /\b(?:noi|tra loi|viet|dap|giong|xung|goi|reply|answer|respond|talk|speak|be|tone|sound|chat)\b/;

type ValuePattern<T extends string> = readonly [value: T, pattern: RegExp];

/** Ordered: the first match per clause wins, so a negated form is listed before the word it contains. */
const FAMILIARITY_PATTERNS: ReadonlyArray<ValuePattern<Familiarity>> = [
  ["NEUTRAL", /\b(?:bot than mat|bot suong sa|dung suong sa|less familiar|less friendly)\b/],
  ["CASUAL", /\b(?:bot trang trong|bot formal|less formal|casual(?: hon)?|noi casual|thoai mai(?: hon| di)?|tu nhien hon|more casual|be casual|relax(?:ed)?|loosen up|chill(?: hon)?)\b/],
  ["FAMILIAR", /\b(?:than thiet(?: hon)?|than hon|than mat|noi nhu ban be|nhu ban be|more familiar|friendlier|like (?:a )?(?:friend|buddy|mate)s?)\b/],
  ["NEUTRAL", /\b(?:trang trong|formal|professional|more formal|be professional)\b/],
];

const HUMOR_PATTERNS: ReadonlyArray<ValuePattern<Humor>> = [
  ["LIGHT", /\b(?:dung nghiem tuc qua|don'?t be so serious)\b/],
  ["OFF", /\b(?:khong can hai huoc|bot dua|dung dua|khong dua|het dua|thoi dua|nghiem tuc(?: di| hon| thoi)?|no jokes?|stop joking|less joking|no humou?r|be serious|serious please)\b/],
  ["LIGHT", /\b(?:dua di|dua tiep|hai huoc(?: hon)?|humou?r (?:nhe|vua phai|it thoi)|vui len|vui ve hon|crack (?:a )?jokes?|be funny|funnier|lighten up|joke around)\b/],
];

/** A style phrase counts only in a style-directive clause: short, or carrying a speaking verb. */
function isStyleDirective(clause: string): boolean {
  return clause.split(/\s+/).filter(Boolean).length <= 6 || STYLE_VERB.test(clause);
}

function firstMatch<T extends string>(clause: string, table: ReadonlyArray<ValuePattern<T>>): T | null {
  for (const [value, pattern] of table) {
    if (pattern.test(clause)) return value;
  }
  return null;
}

function cuesIn(clause: string): ExpressionChange[] {
  const found: ExpressionChange[] = [];
  const verbosity = inferVerbosityPreference({ text: clause });
  if (verbosity === "brief") found.push({ dimension: "verbosity", value: "BRIEF" });
  if (verbosity === "detailed") found.push({ dimension: "verbosity", value: "DETAILED" });
  if (isStyleDirective(clause)) {
    const familiarity = firstMatch(clause, FAMILIARITY_PATTERNS);
    if (familiarity) found.push({ dimension: "familiarity", value: familiarity });
    const humor = firstMatch(clause, HUMOR_PATTERNS);
    if (humor) found.push({ dimension: "humor", value: humor });
  }
  return found;
}

/* Core-conflict candidacy: a directive frame aimed at Dante  AND  a Dante-behaviour predicate. Neither alone counts. */
const DIRECTIVE_LEAD = /^(?:noi|tra loi|bao|hay|cu|dung|khong duoc|dong y|say|tell|answer|just|always|never|don'?t|do not|stop|be|act|pretend|please|you (?:must|should|have to)|phai)\b/;
const NEVER_ALWAYS = /\b(?:bao gio|luon luon|luon|luc nao cung|moi luc|moi khi|always|never|don'?t ever|from now on)\b/;
/** A skip/waive verb carries directive force wherever it sits ("mấy cảnh báo an toàn bỏ qua"). */
const WAIVER = /\b(?:bo qua|bo di|bo het|khoi can|khoi|skip|ignore|waive)\b/;
const BEHAVIOR_PREDICATE = /\b(?:dong y|tan dong|khen|chieu|nghe theo|dung ve phia|tu choi|canh bao|nguy hiem|chac chan|khong chac|khong biet|doan|bo qua|xac nhan|phan doi|noi doi|contradict|nhu the|as if|uncertain\w*|agree|disagree|refuse|warn|warning|flatter|certain|confident|pretend|guess|ignore|correct me|lie)\b/;

function isBehaviorDirective(clause: string, hasScopeFrame: boolean): boolean {
  if (!BEHAVIOR_PREDICATE.test(clause)) return false;
  return hasScopeFrame || DIRECTIVE_LEAD.test(clause.trim()) || NEVER_ALWAYS.test(clause) || WAIVER.test(clause);
}

/**
 * SEGMENT FIRST, CLASSIFY SECOND. A clause may carry a valid expression cue AND a constraint on Dante's own
 * behaviour ("nói casual kiểu lúc nào cũng đứng về phía tao"). The cue phrases are removed and whatever is left is
 * judged on its own, so an expression sibling can never make its neighbour admissible by association.
 */
function withoutExpressionCues(clause: string): string {
  let rest = removeVerbosityCues(clause);
  for (const [, pattern] of [...FAMILIARITY_PATTERNS, ...HUMOR_PATTERNS]) {
    rest = rest.replace(new RegExp(pattern.source, "g"), " ");
  }
  return rest.replace(/\s+/g, " ").trim();
}

function scopeOf(clause: string): { scope: PreferenceScope | null; change: boolean } {
  const change = CHANGE_MARK.test(clause);
  if (TURN_MARK.test(clause) && !change) return { scope: "TURN", change };
  if (change || DURABLE_MARK.test(clause)) return { scope: "DURABLE", change };
  return { scope: null, change };
}

/** A clause that is only a scope marker ("từ giờ", "cứ") — its scope carries to the next clause. */
function isMarkerOnly(clause: string): boolean {
  const rest = clause
    .replace(new RegExp(TURN_MARK.source, "g"), " ")
    .replace(new RegExp(CHANGE_MARK.source, "g"), " ")
    .replace(new RegExp(DURABLE_MARK.source, "g"), " ")
    .trim();
  return rest.split(/\s+/).filter(Boolean).length <= 1;
}

const EXPLICIT_RANK = (e: ExpressionEvent): number => (e.explicit ? 1 : 0);

/**
 * SAME-TURN CORRECTION. A clause that opens with a correction marker ("thôi", "à không", "actually", "wait", …)
 * supersedes the value of the SAME dimension it corrects. It is a semantic relation, not "last substring wins":
 * without a marker the pre-existing resolution applies, and a value in a different dimension is never affected.
 * The marker is removed before the wording is read, so "à không giải thích kỹ" is not the negation of "giải thích kỹ".
 */
const CORRECTION_LEAD = /^(?:a khong|a nham|ah no|thoi|nham|khoan|actually|no wait|wait|scratch that|i mean|y (?:tao|toi|minh) la|sua lai|doi lai|oops)\b\s*/;
/** Only the words of a clause that are addressed to the address style: a bare "neutral" counts only as a correction. */
const NEUTRAL_WORD = /\b(?:neutral|trung tinh|binh thuong|mac dinh|default)\b/;
const RAW_CLAUSE_SPLIT = /[.!?;,\n]+|\s+(?:nhưng|nhung|còn|con|với lại|voi lai|rồi|roi|mà|ma)\s+/iu;

/** Address resolved per raw clause (accents matter): a later explicit correction wins, otherwise the whole-text rule. */
function resolveAddressSignal(raw: string): AddressSignal {
  const found: Array<{ signal: AddressSignal; correcting: boolean }> = [];
  let pending = false;
  for (const rawClause of raw.split(RAW_CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean)) {
    const folded = normalizeInput(rawClause).text;
    const marker = CORRECTION_LEAD.exec(folded);
    const correcting = pending || Boolean(marker);
    const body = marker ? folded.slice(marker[0].length).trim() : folded;
    pending = false;
    if (!body) {
      pending = true;
      continue;
    }
    let signal = detectAddressSignal(rawClause);
    if (correcting && !signal.explicit && NEUTRAL_WORD.test(body) && found.length > 0) signal = { form: "neutral", explicit: true };
    if (signal.explicit && signal.form !== "unresolved") found.push({ signal, correcting });
  }
  return found.filter((f) => f.correcting).at(-1)?.signal ?? detectAddressSignal(raw);
}

export function interpretExpressionFeedback(message: string, options: { hasFactCorrection?: boolean } = {}): ExpressionAnalysis {
  // Use vs. mention (R2): only ASSERTED text may carry a preference. Quoted spans, hypotheticals, examples, meta
  // questions and translation requests are removed BEFORE any cue is read, so no later stage can act on them.
  const raw = assertedText(message);
  const normalized = normalizeInput(raw).text;
  // One event per (dimension, scope class): a this-turn exception ("câu này giải thích kỹ") is not a correction of the
  // durable preference ("từ giờ nói ngắn"), so the two coexist — the TURN one lives in the plan only.
  const events = new Map<string, ExpressionEvent>();
  const latest = new Map<ExpressionDimension, string>();
  const candidates: string[] = [];
  const keyOf = (e: ExpressionEvent): string => `${e.dimension}|${e.scope === "TURN" ? "turn" : "keep"}`;
  const put = (e: ExpressionEvent): void => {
    events.set(keyOf(e), e);
    latest.set(e.dimension, keyOf(e));
  };
  const admit = (event: ExpressionEvent, supersede = false): void => {
    const heldKey = latest.get(event.dimension);
    const held = heldKey ? events.get(heldKey) : undefined;
    if (held && heldKey && supersede) {
      // An explicit correction replaces the value it corrects — even an explicit one. Unless it states a scope of its
      // own, it keeps the scope of what it corrects ("từ giờ nói ngắn, à không giải thích kỹ" stays a durable choice).
      const next = { ...event, scope: event.explicit ? event.scope : held.scope, explicit: event.explicit || held.explicit } as ExpressionEvent;
      if (heldKey !== keyOf(next)) events.delete(heldKey);
      put(next);
      return;
    }
    // Later wording wins within a message, but an implicit cue never displaces an explicit one of its own scope class.
    const same = events.get(keyOf(event));
    if (same && EXPLICIT_RANK(same) > EXPLICIT_RANK(event)) return;
    put(event);
  };

  let carried: { scope: PreferenceScope; change: boolean } | null = null;
  let sawChangeMark = false;
  let pendingCorrection = false;
  for (const fullClause of normalized.split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean)) {
    const marker = CORRECTION_LEAD.exec(fullClause);
    const correcting = pendingCorrection || Boolean(marker);
    const clause = marker ? fullClause.slice(marker[0].length).trim() : fullClause;
    pendingCorrection = false;
    if (!clause) {
      pendingCorrection = true; // "thôi," / "à không," on its own: the NEXT clause is the correction
      continue;
    }
    const own = scopeOf(clause);
    sawChangeMark ||= own.change;
    const stripped = cuesIn(clause);
    // "thôi đùa" reads as a whole ("stop joking"); only fall back to it when the marker-free wording has no cue.
    const cues = stripped.length > 0 || !marker ? stripped : cuesIn(fullClause);
    if (cues.length === 0) {
      if (own.scope && isMarkerOnly(clause)) {
        carried = { scope: own.scope, change: own.change };
        continue;
      }
      if (isBehaviorDirective(clause, Boolean(own.scope || carried))) candidates.push(clause);
      carried = null;
      continue;
    }
    const scope = own.scope ?? carried?.scope ?? null;
    sawChangeMark ||= Boolean(carried?.change);
    carried = null;
    for (const cue of cues) {
      admit({ ...cue, scope: scope ?? "SESSION", explicit: scope !== null } as ExpressionEvent, correcting);
    }
    // The valid cue is admitted above; its residual is a separate segment and is routed on its own.
    if (isBehaviorDirective(withoutExpressionCues(clause), Boolean(scope))) candidates.push(clause);
  }

  // Address is read from the raw text (accents matter). An explicit instruction is durable unless it is a
  // this-turn-only request; plain usage ("Chào ông") is an implicit signal.
  const address = resolveAddressSignal(raw);
  const turnOnly = TURN_MARK.test(normalized) && !CHANGE_MARK.test(normalized);
  if (address.form === "bro") {
    // "call me bro" is a FAMILIARITY request. Custom vocatives are deferred, so no address style is created, and
    // ordinary use of "bro" by the user is not a signal at all.
    if (address.explicit) admit({ dimension: "familiarity", value: "FAMILIAR", scope: turnOnly ? "TURN" : "DURABLE", explicit: true });
  } else {
    const style = address.form === "neutral" && address.explicit ? "NEUTRAL" : fromAddressForm(address.form);
    if (style) {
      admit({
        dimension: "addressStyle",
        value: style,
        scope: address.explicit ? (turnOnly ? "TURN" : "DURABLE") : "SESSION",
        explicit: address.explicit,
      });
    }
  }

  const list = [...events.values()];
  let kind: FeedbackKind = "NORMAL_REQUEST";
  if (list.length > 0) {
    kind = list.every((e) => e.scope === "TURN")
      ? "TURN_OVERRIDE"
      : sawChangeMark && list.some((e) => e.scope === "DURABLE")
        ? "PREFERENCE_CHANGE"
        : "EXPRESSION_FEEDBACK";
  } else if (options.hasFactCorrection) {
    kind = "FACT_CORRECTION";
  }
  return { kind, events: list, coreConflictCandidates: candidates };
}
