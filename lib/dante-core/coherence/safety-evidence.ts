/**
 * Phase 2 — evidence-driven safety lifecycle.
 *
 *   NONE ──fresh current red flag──▶ ENTER
 *   ENTER ──symptom remains──▶ PERSIST ──material worsening──▶ ESCALATE
 *   ENTER/PERSIST/ESCALATE ──explicit credible improvement──▶ DOWNGRADE
 *   DOWNGRADE ──credible resolution──▶ EXIT ──normal continuation──▶ NONE
 *   DOWNGRADE ──symptom back / worse──▶ ENTER
 *
 * The principle: NO EVIDENCE OF RESOLUTION ≠ EVIDENCE OF RESOLUTION. A phase moves toward resolution only on
 * something the user said about the symptom — never because turns or time passed, never because a later message
 * merely does not mention it ("Ok cảm ơn" is not an improvement report).
 *
 * The same pure transition function is used live (against durable state) and to rebuild the minimum safety
 * continuity from request-supplied conversation when the durable store is unavailable.
 */

import { checkSafety } from "@/lib/dante-core/safety-layer";
import { foldText } from "@/lib/dante-core/coherence/understanding";
import type { SafetyFollowUp, SafetyPhase } from "@/lib/dante-core/coherence/types";

const NEGATED_WORSE = /(?:\bnot\b|\bno\b|n't|\bnever\b|\bkhong\b|\bchua\b|\bko\b)\s+(?:\w+\s+){0,2}(?:worse|nang hon|te hon|manh hon)\b/;
const WORSE = /\b(?:getting|gotten|got|become|becoming|is|are|much|even|way|feels?|feeling)\s+worse\b|\bworse\s+(?:now|than|and worse)\b|\bworsen(?:ed|ing|s)?\b|\bspreading\b|\bradiating\b|\bnang hon\b|\bte hon\b|\bmanh hon\b|\btram trong hon\b|\bkho tho hon\b|\bdau (?:nhieu )?hon\b|\b(?:dau|dizz\w*|chong mat|te|kho tho|trieu chung|symptoms?)\b[^.!?;]{0,24}\btang\b|\blan (?:ra|sang|xuong|len)\b|\bmore (?:severe|intense|painful)\b|\bharder to breathe\b/;
const UNCHANGED = /\bstill\s+(?:there|hurts?|hurting|painful|sore|numb|dizzy|tight|bad|the same|present)\b|\b(?:not|no|hasn'?t|isn'?t|haven'?t|didn'?t)\s+(?:\w+\s+)?(?:better|improved|improving|improvement|gone|changed|eased|easing)\b|\bsame as before\b|\bno change\b|\bvan\s+(?:con|dau|nhu cu|the|te|tuc)\b|\bchua\s+(?:do|het|bot|khoi|giam)\b|\bkhong\s+(?:do|bot|giam|het)\b/;

/**
 * Resolution: the user reports the symptom is absent NOW or gone. Deliberately about the symptom, not about the
 * conversation ("thanks", "ok", a new topic) — those carry no resolution evidence.
 */
const SYMPTOM = "(?:dau nguc|chest pain|chong mat|dizz\\w*|te tay|te chan|te bi|numb\\w*|kho tho|short(?:ness)? of breath|trieu chung|symptoms?|dau|pain|nguc|tingl\\w*)";
const RESOLVED_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:hien tai|bay gio|gio|hom nay|now|currently|today|at the moment)\\b[^.!?;\\n]{0,40}\\b(?:khong|no|not)\\s+(?:con\\s+|have\\s+|feel\\s+|any\\s+)?${SYMPTOM}`),
  new RegExp(`\\b(?:khong|no)\\s+(?:con\\s+)?${SYMPTOM}[^.!?;\\n]{0,36}\\b(?:nua|now|anymore|any more|hien tai|bay gio|today|hom nay|this morning|tonight)\\b`),
  new RegExp(`\\bhet(?!\\s+(?:suc|nuoc|minh|cach|y|ca)\\b)\\s+(?:han\\s+)?${SYMPTOM}`),
  new RegExp(`\\b${SYMPTOM}\\s+(?:da\\s+)?(?:het|khoi|bien mat|tan)(?!\\s+(?:suc|nuoc|minh|cach|y|ca)\\b)`),
  /\bkhoi\s+(?:roi|han|hoan toan)\b|\bda\s+(?:het|khoi)\b|\bkhong con\s+(?:dau|trieu chung|chong mat|te)\b/,
  /\b(?:fully |completely )?(?:resolved|gone|cleared up|went away)\b(?!\s*\?)/,
  /\b(?:i'?m|im) (?:fine|ok|okay|good|all good)\b|\btoi on roi\b|\bon roi\b|\bbinh thuong roi\b|\bkhoe roi\b|\ball clear\b/,
  /\b(?:bac si|doctor|physician|gp)\b.{0,24}\b(?:noi|bao|said|says|cleared|confirmed)\b.{0,20}\b(?:on|binh thuong|fine|ok|okay|nothing|cleared)\b/,
];
const IMPROVING = /\b(?:do|nhe|bot|giam)\s+(?:hon|nhieu|roi|bot|dan|han)\b|\bdo (?:nhieu |hon )?roi\b|\bbetter\b|\bimproved\b|\bimproving\b|\beasing\b|\bless (?:pain|dizzy|tight|numb)\b|\bnhe hon\b|\bgiam (?:bot|nhieu)\b/;

/** What the user said ABOUT THE SYMPTOM this turn. null when they said nothing about it. */
export function classifySafetyEvidence(text: string): SafetyFollowUp | null {
  const t = foldText(text);
  if (NEGATED_WORSE.test(t)) return "unchanged";
  if (WORSE.test(t)) return "worse";
  if (UNCHANGED.test(t)) return "unchanged";
  if (RESOLVED_PATTERNS.some((re) => re.test(t))) return "resolved";
  if (IMPROVING.test(t)) return "improving";
  return null;
}

export const ACTIVE_PHASES: ReadonlySet<SafetyPhase> = new Set<SafetyPhase>(["ENTER", "PERSIST", "ESCALATE"]);
export const isActivePhase = (phase: SafetyPhase): boolean => ACTIVE_PHASES.has(phase);

/**
 * The single transition function. `fresh` = a current, credible red flag was reported in THIS message
 * (already temporal/negation-aware in checkSafety). `evidence` = what the user said about the tracked symptom.
 */
export function advanceSafetyPhase(input: {
  current: SafetyPhase;
  fresh: boolean;
  evidence: SafetyFollowUp | null;
}): SafetyPhase {
  const { current, fresh, evidence } = input;

  if (current === "NONE") return fresh ? "ENTER" : "NONE";
  if (current === "EXIT") return fresh ? "ENTER" : "NONE";

  if (current === "DOWNGRADE") {
    if (fresh || evidence === "worse" || evidence === "unchanged") return "ENTER";
    if (evidence === "resolved") return "EXIT";
    return "DOWNGRADE"; // improving / silence: not credible resolution — hold
  }

  // ENTER / PERSIST / ESCALATE — an active episode.
  if (evidence === "worse") return "ESCALATE";
  // A fresh current red flag (checkSafety is per-symptom, so this is a symptom that is NOT resolved) always wins
  // over a resolution statement about a different one: the episode continues.
  if (fresh) return current === "ESCALATE" ? "ESCALATE" : "PERSIST";
  if (evidence === "resolved" || evidence === "improving") return "DOWNGRADE";
  if (evidence === "unchanged") return current === "ESCALATE" ? "ESCALATE" : "PERSIST";
  // No evidence either way: the episode stays exactly where it was. Silence is not resolution.
  return current;
}

/* ------------------------------------------------------------------ */
/* Store-outage continuity                                             */
/* ------------------------------------------------------------------ */

export type RecoveredSafety = { phase: SafetyPhase; category: string | null };

const OUTAGE_WINDOW_USER_TURNS = 6;

/**
 * Rebuild ONLY the safety-critical continuity from recent request-supplied user turns, using the same state
 * machine. Each turn is judged for a fresh red flag with checkSafety (temporal/negation-aware, with the turns
 * before it as context) and for evidence about the symptom. Nothing else about the session is reconstructed.
 * Returns null when the recent conversation does not establish an active serious episode.
 */
export function recoverSafetyFromHistory(userTurns: readonly string[]): RecoveredSafety | null {
  const recent = userTurns.filter((t) => t.trim()).slice(-OUTAGE_WINDOW_USER_TURNS);
  let phase: SafetyPhase = "NONE";
  let category: string | null = null;
  for (const [index, text] of recent.entries()) {
    const check = checkSafety(text, { recentMessages: recent.slice(Math.max(0, index - 3), index) });
    const fresh = check.triggered && check.responseMode === "HARD_BLOCK";
    const next = advanceSafetyPhase({ current: phase, fresh, evidence: classifySafetyEvidence(text) });
    if (fresh && next !== "NONE") category = check.category;
    phase = next;
    if (phase === "NONE" || phase === "EXIT") category = null;
  }
  return isActivePhase(phase) || phase === "DOWNGRADE" ? { phase, category } : null;
}
