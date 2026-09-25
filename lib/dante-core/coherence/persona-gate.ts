/**
 * Phase 2.5a — Persona Consistency Gate.
 *
 * Small on purpose: only deterministic, binary checks against the ExpressionPlan. It sits between response
 * realization and the existing Gate C / Final Coherence Gate. It never judges tone ("too polite", "felt
 * aggressive") — those are Phase 2.5b concerns — and it never touches facts: a surface change that alters an
 * authoritative fact or certainty is the truth gates' job (Gate C / Final Gate hard-fail), not this gate's.
 *
 *   REWRITE   A  humor markers in SAFETY_SERIOUS (or a serious plan whose humor is not OFF)
 *             B  a direct vocative the plan does not allow
 *             C  managed familiarity above the plan (slang interjection when familiarity != FAMILIAR)
 *             D  addressStyle NEUTRAL and the draft invents a managed direct vocative
 *             E  known customer-service/corporate pattern (reuses the Task-4 patterns)
 *   WARN/LOG  F  language drift     G  verbosity drift        (never a failure)
 *
 * Repair is deterministic and bounded: max_persona_rewrite_attempts = 2. After the second failed attempt there is
 * NO third rewrite, NO new provider call and the failed draft is never emitted — the deterministic neutral
 * renderer takes over (NEUTRAL address, NEUTRAL familiarity, humor OFF, DEFAULT verbosity).
 */

import { looksVietnamese } from "@/lib/dante-language";
import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import { blockSurfaceText, unverifiedDraftBlocks } from "@/lib/dante-core/coherence/authority";
import { neutralPlan } from "@/lib/dante-core/coherence/expression";
import { hasCustomerServiceDrift, stripCustomerService } from "@/lib/dante-core/coherence/style";
import type { ContextMode, ExpressionPlan, ResponseBlock } from "@/lib/dante-core/coherence/types";

/** HARD CONSTANT. Nothing in this module accepts a larger value. */
export const MAX_PERSONA_REWRITE_ATTEMPTS = 2 as const;

export type PersonaViolationCode =
  | "HUMOR_IN_SAFETY"
  | "HUMOR_NOT_ALLOWED"
  | "VOCATIVE_OUT_OF_PLAN"
  | "NEUTRAL_VOCATIVE"
  | "FAMILIARITY_ABOVE_PLAN"
  | "CUSTOMER_SERVICE"
  | "PLAN_CONTEXT";

export type PersonaGateResult = {
  passed: boolean;
  violations: PersonaViolationCode[];
  /** F/G — logged, never a failure. */
  warnings: Array<"LANGUAGE_DRIFT" | "VERBOSITY_DRIFT">;
};

/* ------------------------------------------------------------------ */
/* Direct-vocative matcher (small, position-based — not a word blacklist) */
/* ------------------------------------------------------------------ */

const EN_VOCATIVES = ["bro", "dude", "mate", "buddy", "man"] as const;
const VI_VOCATIVES = ["bạn", "ông", "cậu", "mày", "anh", "em"] as const;
/** Only unambiguous openers: "no man" / "right man" are ordinary phrases, not an address. */
const INTERJECTION = "(?:yes|yeah|yep|sure|ok|okay|hey|hi|hello|thanks|thank you|này|vâng|dạ|ừ)";
const L = "(?<![\\p{L}])";
const R = "(?![\\p{L}])";

export type Vocative = { token: string; start: number; end: number; replacement: string };

function vocativeTokens(language: "en" | "vi"): string[] {
  return language === "vi" ? [...EN_VOCATIVES, ...VI_VOCATIVES] : [...EN_VOCATIVES];
}

/**
 * Finds tokens used as a DIRECT vocative, by position only:
 *   sentence-initial  "Bro, …" / "Bro: …" / "Ông ơi, …" / "Yes bro, …"
 *   comma-delimited   "…, bro, …"          terminal  "…, bro." / "Thanks bro."
 *   isolated          "… — bro — …" / "… - bro - …" / "… — bro."   parenthetical  "… (bro) …"
 * A quoted, backticked or mentioned token ('bro', `bro`, "bro science") and a hyphenated compound ("mày-tao") are
 * not vocatives: the punctuation must isolate the token. A pronoun in subject position ("bạn giữ RPE 7") is NOT a vocative and is left to the existing address layer.
 */
export function findDirectVocatives(text: string, language: "en" | "vi"): Vocative[] {
  const tokens = vocativeTokens(language).join("|");
  const T = `${L}(${tokens})${R}(?:\\s+ơi)?`;
  const found: Vocative[] = [];

  // sentence-initial, optionally after an interjection: "Bro, …" "Yes bro, …"
  const leading = new RegExp(`(^|[.!?…]\\s+|\\n\\s*)(?:(${INTERJECTION})\\s+)?${T}\\s*[,!:]\\s*`, "giu");
  for (const m of text.matchAll(leading)) {
    const start = m.index ?? 0;
    const lead = m[1] ?? "";
    const interjection = m[2];
    found.push({
      token: (m[3] ?? "").toLowerCase(),
      start: start + lead.length,
      end: start + m[0].length,
      replacement: interjection ? `${interjection}, ` : "",
    });
  }
  // comma-delimited / terminal: ", bro," ", bro." ", bro"
  const inline = new RegExp(`\\s*,\\s*${T}(?=\\s*[,.!?…;:]|\\s*$|\\s*\\n)`, "giu");
  for (const m of text.matchAll(inline)) {
    const start = m.index ?? 0;
    if (found.some((f) => start >= f.start && start < f.end)) continue;
    found.push({ token: (m[1] ?? "").toLowerCase(), start, end: start + m[0].length, replacement: "" });
  }
  // isolated by dashes: "… — bro — …" (both sides) or "… — bro." (trailing). A bare hyphen must be spaced ("mày-tao" is a compound).
  const DASH = "(?:\\s*[—–]\\s*|\\s+-\\s+)";
  const bothDashes = new RegExp(`${DASH}${T}${DASH}`, "giu");
  for (const m of text.matchAll(bothDashes)) {
    const start = m.index ?? 0;
    if (found.some((f) => start < f.end && start + m[0].length > f.start)) continue;
    found.push({ token: (m[1] ?? "").toLowerCase(), start, end: start + m[0].length, replacement: " " });
  }
  const trailingDash = new RegExp(`${DASH}${T}(?=\\s*[.!?…]|\\s*$)`, "giu");
  for (const m of text.matchAll(trailingDash)) {
    const start = m.index ?? 0;
    if (found.some((f) => start < f.end && start + m[0].length > f.start)) continue;
    found.push({ token: (m[1] ?? "").toLowerCase(), start, end: start + m[0].length, replacement: "" });
  }
  // parenthetical: "… (bro) …"
  const parenthetical = new RegExp(`\\s*\\(\\s*${T}\\s*\\)`, "giu");
  for (const m of text.matchAll(parenthetical)) {
    const start = m.index ?? 0;
    if (found.some((f) => start < f.end && start + m[0].length > f.start)) continue;
    found.push({ token: (m[1] ?? "").toLowerCase(), start, end: start + m[0].length, replacement: "" });
  }
  // interjection + token + terminal punctuation, no comma: "Thanks bro."
  const tail = new RegExp(`(${INTERJECTION})\\s+${T}(?=\\s*[.!?…]|\\s*$)`, "giu");
  for (const m of text.matchAll(tail)) {
    const start = m.index ?? 0;
    if (found.some((f) => start >= f.start && start < f.end)) continue;
    found.push({ token: (m[2] ?? "").toLowerCase(), start, end: start + m[0].length, replacement: m[1] ?? "" });
  }
  return found.sort((a, b) => a.start - b.start);
}

function outOfPlan(vocatives: Vocative[], plan: ExpressionPlan): Vocative[] {
  const allowed = new Set(plan.allowedAddressBehavior.allowedVocatives.map((v) => v.toLowerCase()));
  return vocatives.filter((v) => !allowed.has(v.token));
}

/* ------------------------------------------------------------------ */
/* Humor markers / slang                                                */
/* ------------------------------------------------------------------ */

const HUMOR_MARKERS = /[😂🤣💀😭😅😜😆😹]|(?<![\p{L}])(?:ha(?:ha)+h?|hehe+|hihi+|lol|lmao|rofl|kkk+)(?![\p{L}])|=\)\)+|:\)\)+|(?<![\p{L}])xD(?![\p{L}])/giu;
const SLANG_INTERJECTION = /(^|[.!?…]\s+|\n\s*)yo(?![\p{L}])\s*[,!]?\s*/giu;

/**
 * Re-derived from the plan's own fields rather than trusted from its flag: laughter/emoji are only ever permitted for
 * humor LIGHT in a NORMAL context.
 */
function humorAllowed(plan: ExpressionPlan): boolean {
  return plan.allowHumorMarkers && plan.humor === "LIGHT" && plan.contextMode === "NORMAL";
}

export function hasHumorMarkers(text: string): boolean {
  return new RegExp(HUMOR_MARKERS.source, HUMOR_MARKERS.flags.replace("g", "")).test(text);
}

function hasSlangInterjection(text: string): boolean {
  return new RegExp(SLANG_INTERJECTION.source, SLANG_INTERJECTION.flags.replace("g", "")).test(text);
}

/* ------------------------------------------------------------------ */
/* Gate                                                                 */
/* ------------------------------------------------------------------ */

const BRIEF_MAX_WORDS = 140;
const DETAILED_MIN_WORDS = 15;

export function evaluatePersonaGate(input: {
  draft: string;
  plan: ExpressionPlan;
  language: "en" | "vi";
}): PersonaGateResult {
  const { draft, plan, language } = input;
  const violations: PersonaViolationCode[] = [];
  const warnings: PersonaGateResult["warnings"] = [];

  // A — a serious safety context whose plan still allows humor is inconsistent by itself.
  if (plan.contextMode === "SAFETY_SERIOUS" && plan.humor !== "OFF") violations.push("PLAN_CONTEXT");
  if (hasHumorMarkers(draft) && !humorAllowed(plan)) {
    violations.push(plan.contextMode === "SAFETY_SERIOUS" ? "HUMOR_IN_SAFETY" : "HUMOR_NOT_ALLOWED");
  }
  // B / D — direct vocatives outside what the address style allows (NEUTRAL allows none).
  const offending = outOfPlan(findDirectVocatives(draft, language), plan);
  if (offending.length > 0) {
    violations.push(plan.addressStyle === "NEUTRAL" ? "NEUTRAL_VOCATIVE" : "VOCATIVE_OUT_OF_PLAN");
  }
  // C — managed familiarity above the plan.
  if (plan.familiarity !== "FAMILIAR" && hasSlangInterjection(draft)) violations.push("FAMILIARITY_ABOVE_PLAN");
  // E — the Task-4 customer-service patterns.
  if (hasCustomerServiceDrift(draft)) violations.push("CUSTOMER_SERVICE");

  // F / G — warn only.
  const words = draft.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (language === "vi" && words >= 14 && !looksVietnamese(draft)) warnings.push("LANGUAGE_DRIFT");
  if ((plan.verbosity === "BRIEF" && words > BRIEF_MAX_WORDS) || (plan.verbosity === "DETAILED" && words > 0 && words < DETAILED_MIN_WORDS)) {
    warnings.push("VERBOSITY_DRIFT");
  }
  return { passed: violations.length === 0, violations, warnings };
}

/* ------------------------------------------------------------------ */
/* Repair (deterministic; wording only)                                 */
/* ------------------------------------------------------------------ */

function capitalizeStarts(text: string): string {
  return text.replace(/(^|[.!?…]\s+|\n\s*)(\p{Ll})/gu, (_m, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

function tidy(text: string): string {
  return capitalizeStarts(
    text
      .replace(/[ \t]+([.,!?;:…])/g, "$1")
      .replace(/([,;:])(?=\s*[.!?])/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

export function stripHumorMarkers(text: string): string {
  return text.replace(HUMOR_MARKERS, "").replace(/[ \t]{2,}/g, " ");
}

/**
 * Removes the direct vocatives the plan does not allow, WITH their punctuation frame ("Bro, …", "— bro —", "(bro)").
 * Realization runs this before address application: the address layer drops a bare pronoun token and would leave the
 * frame behind (", giảm volume", "— —", "()").
 */
export function removeOutOfPlanVocatives(text: string, plan: ExpressionPlan, language: "en" | "vi"): string {
  const offending = outOfPlan(findDirectVocatives(text, language), plan);
  return offending.length > 0 ? tidy(removeVocatives(text, offending)) : text;
}

function removeVocatives(text: string, vocatives: Vocative[]): string {
  let out = text;
  for (const v of [...vocatives].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, v.start)}${v.replacement}${out.slice(v.end)}`;
  }
  return out;
}

/**
 * One deterministic repair pass. It removes exactly what the gate flags: customer-service macros, humor markers the
 * plan does not allow, out-of-plan direct vocatives, and slang above the plan. Nothing else is rewritten.
 */
export function repairPersonaDraft(draft: string, plan: ExpressionPlan, language: "en" | "vi"): string {
  let out = stripCustomerService(draft);
  if (!humorAllowed(plan)) out = stripHumorMarkers(out);
  out = removeVocatives(out, outOfPlan(findDirectVocatives(out, language), plan));
  if (plan.familiarity !== "FAMILIAR") out = out.replace(SLANG_INTERJECTION, "$1");
  return tidy(out);
}

/* ------------------------------------------------------------------ */
/* Deterministic neutral renderer (never calls a model)                  */
/* ------------------------------------------------------------------ */

function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“(\[])/u).map((s) => s.trim()).filter(Boolean);
}

/**
 * Persona SPANS only (vocative, laughter/emoji, slang opener, customer-service macro) are removed, positionally.
 * Nothing is reworded and no clause is judged: the words that carry advice, negation, side, time and conditions are
 * never touched. Independent of repairPersonaDraft on purpose — it must still work when the repair itself failed.
 */
function hardScrub(sentence: string, plan: ExpressionPlan, language: "en" | "vi"): string {
  const noCs = sentence.replace(/(?:i['’]?m happy to help|i hope (?:this|that|it) helps|feel free to|rất vui được|hy vọng (?:điều|thông tin))[^.!?\n]*[.!?]?/giu, "");
  const noHumor = noCs.replace(HUMOR_MARKERS, "");
  return tidy(removeVocatives(noHumor, findDirectVocatives(noHumor, language))).replace(SLANG_INTERJECTION, "$1").trim();
}

const HAS_CONTENT = /[\p{L}\p{N}]/u;

export type NeutralRender = {
  text: string;
  /** Blocks with content that reached the output. */
  rendered: number;
  /** Fragments that still violated the neutral plan after span removal and had to be left out (expected 0). */
  droppedFragments: number;
};

/**
 * Deterministic neutral renderer over structured response blocks. The blocks are the authoritative layers' own
 * pre-realization content (handled obligations + composed lines + already-guarded provider units), so the fallback
 * never has to recover meaning from the failed surface text. Each block surfaces through `blockSurfaceText` — the SAME
 * authority contract the normal path renders through (P-10): a block without authority yields its neutral
 * acknowledgement and never its text. A surfaceable block is rendered with only its persona spans removed, blocks are
 * joined in obligation order with a blank line, and NO model is called: no fact, advice, reasoning or wording is added.
 * A block that carries nothing but persona spans has no content to lose.
 */
export function renderNeutralBlocks(input: {
  blocks: readonly ResponseBlock[];
  language: "en" | "vi";
  contextMode: ContextMode;
}): NeutralRender {
  const { language } = input;
  const plan = neutralPlan(input.contextMode);
  const passes = (text: string): boolean => evaluatePersonaGate({ draft: text, plan, language }).passed;
  let droppedFragments = 0;

  const neutralize = (raw: string): string => {
    const text = scrubInternalJargon(raw, language).trim();
    if (!text) return "";
    if (passes(text)) return text;
    const scrubbed = hardScrub(text, plan, language);
    // Nothing but persona spans (a stray "." is left over) means there was no content to lose.
    if (!HAS_CONTENT.test(scrubbed)) return "";
    if (passes(scrubbed)) return scrubbed;
    // A residual violation the span removal could not express: keep every sentence that is clean and count the rest.
    return splitSentences(scrubbed)
      .map((sentence) => {
        if (passes(sentence)) return sentence;
        const again = hardScrub(sentence, plan, language);
        if (!HAS_CONTENT.test(again)) return "";
        if (passes(again)) return again;
        droppedFragments += 1;
        return "";
      })
      .filter(Boolean)
      .join(" ");
  };

  const rendered = [...input.blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => neutralize(blockSurfaceText(block, language)))
    .filter(Boolean);
  if (rendered.length === 0) {
    return {
      text: language === "vi"
        ? "Mình giữ đúng dữ kiện hiện có. Nói tiếp ý cần xử lý."
        : "Holding the current facts. Tell me which point to work next.",
      rendered: 0,
      droppedFragments,
    };
  }
  return { text: rendered.join("\n\n"), rendered: rendered.length, droppedFragments };
}

/**
 * Entry for callers that have a draft: with `blocks` it renders them; a bare string has NO provenance, so it is
 * provider prose — UNVERIFIED — and yields the neutral acknowledgement rather than being trusted (fail-closed).
 */
export function renderNeutralFallback(input: {
  draft: string;
  blocks?: readonly ResponseBlock[];
  language: "en" | "vi";
  contextMode: ContextMode;
}): string {
  const blocks = input.blocks?.length ? input.blocks : unverifiedDraftBlocks(input.draft);
  return renderNeutralBlocks({ blocks, language: input.language, contextMode: input.contextMode }).text;
}

/* ------------------------------------------------------------------ */
/* Bounded loop                                                         */
/* ------------------------------------------------------------------ */

export type PersonaOutcome = {
  text: string;
  /** Repair attempts spent (0..2). */
  repairAttempts: number;
  /** True when the deterministic neutral renderer replaced the draft. */
  fallback: boolean;
  /** Violations found on the first evaluation. */
  violations: PersonaViolationCode[];
  warnings: PersonaGateResult["warnings"];
};

export type PersonaRepair = (draft: string, plan: ExpressionPlan, language: "en" | "vi") => string;

export function enforcePersonaGate(input: {
  draft: string;
  plan: ExpressionPlan;
  language: "en" | "vi";
  /**
   * Guarded pre-realization blocks: what the neutral renderer renders if both repairs fail. Omitted → the draft is a
   * bare string with no authority and is treated as UNVERIFIED provider prose.
   */
  blocks?: readonly ResponseBlock[];
  /** Injectable for tests (e.g. a repair that keeps re-introducing the violation). Defaults to repairPersonaDraft. */
  repair?: PersonaRepair;
}): PersonaOutcome {
  const { language } = input;
  let plan = input.plan;
  const repair = input.repair ?? repairPersonaDraft;
  let text = input.draft;
  let gate = evaluatePersonaGate({ draft: text, plan, language });
  const first = gate;
  let attempts = 0;
  while (!gate.passed && attempts < MAX_PERSONA_REWRITE_ATTEMPTS) {
    attempts += 1;
    // A serious-safety plan that still allows humor is itself the defect: rewrite against the corrected plan.
    if (plan.contextMode === "SAFETY_SERIOUS" && plan.humor !== "OFF") plan = { ...plan, humor: "OFF", allowHumorMarkers: false };
    text = repair(text, plan, language);
    gate = evaluatePersonaGate({ draft: text, plan, language });
  }
  if (!gate.passed) {
    return {
      text: renderNeutralFallback({ draft: input.draft, blocks: input.blocks, language, contextMode: plan.contextMode }),
      repairAttempts: attempts,
      fallback: true,
      violations: first.violations,
      warnings: first.warnings,
    };
  }
  return { text, repairAttempts: attempts, fallback: false, violations: first.violations, warnings: gate.warnings };
}
