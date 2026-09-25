/**
 * Phase 2 — semantic decomposition around Phase 1 Obligation[].
 * Reads snapshot v_n only. May propose deltas. Never mutates state.
 */

import type { ObligationIntent } from "@/lib/dante-core/runtime-convergence/multi-intent";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { sidedShoulderContrast, withoutSidedClauses } from "@/lib/dante-core/adaptive-coach-v2/sided-shoulder";
import { decideObligationDecisionState } from "@/lib/dante-core/coherence/decision-first";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import { checkSafety, type SafetyCheckResult } from "@/lib/dante-core/safety-layer";
import { evaluateContrastiveSafety } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { looksVietnamese } from "@/lib/dante-language";
import { activeCorrections } from "@/lib/dante-core/coherence/reducer";
import {
  extractLateralityCorrections,
  extractWeekdayCorrections,
  LATERALITY_TOPIC,
} from "@/lib/dante-core/coherence/corrections";
import { dominantLanguage } from "@/lib/dante-core/coherence/session";
import { classifySafetyEvidence } from "@/lib/dante-core/coherence/safety-evidence";
import { buildObligationLedger, verifyLedgerCoverage } from "@/lib/dante-core/coherence/ledger";
import { detectAddressSignal, inferVerbosityPreference } from "@/lib/dante-core/coherence/style";
import { interpretExpressionFeedback } from "@/lib/dante-core/coherence/expression-feedback";
import type {
  BoundaryCandidate,
  CorrectionCandidate,
  DeltaOp,
  GateResult,
  TurnAnalysis,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");
}

function extractCorrections(repairedText: string, snapshot: VersionedState): CorrectionCandidate[] {
  const n = repairedText;
  // Explicit correction beats an earlier same-turn assertion; the earlier value is kept (superseded), not deleted.
  const found: CorrectionCandidate[] = [
    ...extractLateralityCorrections(n, activeCorrections(snapshot).some((c) => c.value.topic === LATERALITY_TOPIC)),
    ...extractWeekdayCorrections(n),
  ];

  // "Currently no pain" is a fact about the SHOULDER only when the same clause is about the shoulder. "hiện tại không
  // đau ngực" is a chest-pain report and must never be persisted as a shoulder fact.
  // "vai trái đau, vai phải không đau": that "không đau" belongs to ONE side, so those clauses say nothing about the whole
  // shoulder — only what is left of the turn can (the interpreter reads the same remainder).
  const shoulderScope = sidedShoulderContrast(n).length > 0 ? withoutSidedClauses(n) : n;
  const shoulderClauses = shoulderScope.split(/[.;!?\n]+/).filter((clause) => /\bvai\b|shoulder/.test(clause));
  if (shoulderClauses.some((clause) => /(?:hien tai|hom nay|bay gio|currently|right now|today).{0,40}(?:khong dau|no (?:shoulder )?pain|het dau)/.test(clause))
    || /(?:ca hai vai|both shoulders).{0,30}(?:khong dau|no pain)/.test(shoulderScope)) {
    found.push({ topic: "current_shoulder_pain", statement: "ABSENT" });
  }
  if (/(?:hien tai|currently).{0,40}(?:dang dau vai|shoulder (?:is |still )?pain)/.test(n)
    && !/(?:khong dau|no pain)/.test(n)) {
    found.push({ topic: "current_shoulder_pain", statement: "PRESENT" });
  }
  return found;
}

function extractBoundaries(message: string): BoundaryCandidate[] {
  const n = norm(message);
  const found: BoundaryCandidate[] = [];
  if (/(?:dung|don't|do not|khong).{0,30}(?:jargon|ky thuat|technical dump)|no jargon/.test(n)) {
    found.push({ kind: "no_jargon", statement: "user asked to avoid jargon" });
  }
  if (/(?:khong can show memory|hidden notes|internal state|dump memory|nguyen van)/.test(n)) {
    found.push({ kind: "no_memory_dump", statement: "user forbade internal dump" });
  }
  if (/(?:dung lecture|don't lecture|khong day doi|stop preaching)/.test(n)) {
    found.push({ kind: "no_lecturing", statement: "user forbade lecturing" });
  }
  if (/(?:dont give me statistics|don't give me statistics|do not give me statistics|no numbers|hide the metrics|don't mention scores|move all the statistics away|giau so|khong dua so lieu)/.test(n)) {
    found.push({ kind: "hide_statistics", statement: "user asked to hide statistics" });
  }
  if (/(?:english isn['’]?t very good|simple english|explain simply|keep it simple|easy english|no complicated words|tieng anh khong gioi|noi don gian|giai thich don gian)/.test(n)) {
    found.push({ kind: "simple_language", statement: "user asked for simple language" });
  }
  return found;
}

const CLARIFY_MAX_WORDS = 8;
const EXPLICIT_EN = /\b(?:answer|reply|respond|switch).{0,20}(?:in )?english\b|\benglish please\b|\buse english\b/i;
const EXPLICIT_VI = /trả lời bằng tiếng việt|chuyển sang tiếng việt|nói tiếng việt|answer.{0,20}vietnamese/i;

export function analyzeTurn(input: {
  message: string;
  snapshot: VersionedState;
  /** The route's own (context-aware) safety result, so Phase 2 and the live route share one safety decision. */
  safety?: SafetyCheckResult;
}): TurnAnalysis {
  const ledger = buildObligationLedger(input.message, {
    hasLateralityReferent: activeCorrections(input.snapshot).some((c) => c.value.topic === LATERALITY_TOPIC),
  });
  const obligations = ledger.obligations;
  const ledgerCoverage = verifyLedgerCoverage(ledger);
  const intents = obligations.map((o) => o.intent) as ObligationIntent[];
  const corrections = extractCorrections(ledger.normalized.text, input.snapshot);
  const boundaries = extractBoundaries(input.message);
  const safety = input.safety ?? checkSafety(input.message);
  const current = extractCurrentTurnState(input.message);
  for (const obligation of obligations) {
    obligation.decisionState = decideObligationDecisionState(obligation, current);
  }
  const contrastive = evaluateContrastiveSafety(input.message);
  const interp = interpretUserTurn(input.message);
  const historicalNumb = interp.propositions.some(
    (p) =>
      p.concept === "NUMBNESS"
      && (p.temporalAnchor === "HISTORICAL" || p.temporal === "HISTORICAL")
      && p.polarity === "PRESENT",
  );
  const currentClear = current.numbnessPresent === false && !safety.triggered;
  const historicalOnly = historicalNumb && currentClear && !safety.triggered;
  const currentSafety = Boolean(safety.triggered) && !historicalOnly;
  const n = norm(input.message);
  const mixed = looksVietnamese(input.message) && /[A-Za-z]{4,}/.test(input.message)
    && (input.message.match(/[A-Za-z]/g)?.length ?? 0) > 8;
  const explicitLanguageSwitch = EXPLICIT_EN.test(input.message) || EXPLICIT_VI.test(input.message);
  const languageSignal = explicitLanguageSwitch
    ? (EXPLICIT_EN.test(input.message) ? "en" : "vi")
    : dominantLanguage(input.message);
  const numericConflict =
    (/(?:not|khong phai|không phải).{0,24}\d+/.test(n) && /(?:wait|actually|thuc ra|thực ra).{0,24}\d+/.test(n))
    || ((n.includes("wait") || n.includes("actually")) && (input.message.match(/\b\d+(?:\.\d+)?\s*kg\b/gi)?.length ?? 0) >= 2);
  const competingSameTurn = corrections.some((c) => c.conflictsWith) || numericConflict;
  // A clarification cue only points back at the prior answer when it is a short turn ("huh? what do you mean").
  // A long, self-contained question that merely contains the words is a new question, not a return-path request.
  const unclearPriorAsk = /(?:khong hieu|không hiểu|huh\??|what do you mean|noi ro hon|nói rõ|clarify)/i.test(input.message)
    && input.message.trim().split(/\s+/).length <= CLARIFY_MAX_WORDS;
  const profanity = /(?:\bfuck|\bshit|\bdamn|\bdm\b|\bvcl\b|đm)/i.test(input.message);
  const proposedOps: DeltaOp[] = [];

  for (const c of corrections) {
    if (c.statement === "CONFLICT" || c.conflictsWith) continue;
    proposedOps.push({
      op: "upsert_correction",
      topic: c.topic,
      statement: c.statement,
      provenance: "CURRENT_TURN_EXPLICIT",
    });
  }
  for (const b of boundaries) {
    proposedOps.push({
      op: "upsert_boundary",
      kind: b.kind,
      statement: b.statement,
      provenance: "CURRENT_TURN_EXPLICIT",
    });
  }
  if (explicitLanguageSwitch && (languageSignal === "en" || languageSignal === "vi")) {
    proposedOps.push({ op: "set_language", value: languageSignal, provenance: "explicit_switch" });
  }
  // Expression (address/familiarity/humor/verbosity) is NOT proposed here as ops: the interpreter classifies the
  // feedback, and the pipeline turns admissible, canonical events into expression ops. Fact corrections above and
  // expression feedback below feed different state domains (P-5).
  const verbosityCandidate = inferVerbosityPreference(ledger.normalized);
  const addressDetected = detectAddressSignal(input.message);
  const address = addressDetected.form;
  const expression = interpretExpressionFeedback(input.message, { hasFactCorrection: corrections.length > 0 });
  if (unclearPriorAsk) {
    proposedOps.push({ op: "open_loop", topic: "clarification" });
    proposedOps.push({ op: "mark_unclear", value: true });
  }

  return {
    obligations,
    intents,
    corrections,
    boundaries,
    commitments: unclearPriorAsk ? [{ kind: "clarification", text: "user asked to clarify prior answer" }] : [],
    safetyCandidates: {
      present: Boolean(safety.triggered) || contrastive.escalate || /\b(?:te tay|numb|chest pain|dau nguc|chong mat)\b/i.test(n),
      current: currentSafety,
      historicalOnly,
      category: safety.triggered ? safety.category : null,
    },
    safetyFollowUp: classifySafetyEvidence(ledger.normalized.text),
    verbosityCandidate,
    expression,
    languageSignal,
    addressSignal: address,
    addressExplicit: addressDetected.explicit,
    ledger,
    ledgerCoverage,
    explicitLanguageSwitch,
    mixedCodeSwitch: mixed && !explicitLanguageSwitch,
    profanityWithoutSafety: profanity && !currentSafety,
    unclearPriorAsk,
    competingCorrections: competingSameTurn,
    proposedOps,
  };
}

function competingWithSession(analysis: TurnAnalysis, snapshot: VersionedState): boolean {
  if (analysis.competingCorrections) return true;
  const active = activeCorrections(snapshot);
  for (const c of analysis.corrections) {
    const prior = active.find((a) => a.value.topic === c.topic);
    if (prior && prior.value.statement !== c.statement && c.statement !== "CONFLICT") {
      // Same-topic explicit update is supersession, not a conflict — unless both asserted this turn.
      continue;
    }
  }
  return false;
}

export function evaluateGateA(input: {
  analysis: TurnAnalysis;
  snapshot: VersionedState;
  attempt: number;
}): GateResult {
  if (input.analysis.competingCorrections || competingWithSession(input.analysis, input.snapshot) && input.analysis.corrections.filter((c) => c.conflictsWith).length > 0) {
    return { passed: false, code: "COMPETING_CORRECTIONS", message: "two explicit corrections conflict" };
  }
  if (input.analysis.obligations.length >= 2) {
    // Identity is the obligation id (several OPEN_REQUESTs legitimately share an intent).
    const ids = new Set(input.analysis.obligations.map((o) => o.id));
    if (ids.size !== input.analysis.obligations.length) {
      return { passed: false, code: "DUP_OBLIGATION", message: "duplicate obligation ids" };
    }
  }
  // Every request-like discourse segment must be carried by an obligation (checked with a broader detector than
  // the one that built the ledger, so an unclassified request cannot pass vacuously).
  if (!input.analysis.ledgerCoverage.ok) {
    return {
      passed: false,
      code: "UNCOVERED_REQUEST_SEGMENT",
      message: `request-like segment(s) ${input.analysis.ledgerCoverage.uncovered.join(",")} carry no obligation`,
    };
  }
  return { passed: true, code: null, message: null };
}

export function resolveLanguage(input: {
  snapshot: VersionedState;
  analysis: TurnAnalysis;
  sustainedOtherLanguage?: boolean;
}): "en" | "vi" {
  if (input.analysis.explicitLanguageSwitch && (input.analysis.languageSignal === "en" || input.analysis.languageSignal === "vi")) {
    return input.analysis.languageSignal;
  }
  const established = input.snapshot.language.value;
  if (established === "en" || established === "vi") {
    if (input.analysis.mixedCodeSwitch) return established;
    if (input.sustainedOtherLanguage && (input.analysis.languageSignal === "en" || input.analysis.languageSignal === "vi")) {
      return input.analysis.languageSignal;
    }
    if (input.analysis.languageSignal === "unresolved") return established;
    return established;
  }
  return input.analysis.languageSignal === "vi" ? "vi" : "en";
}
