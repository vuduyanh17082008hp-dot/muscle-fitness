/**
 * Phase 2 — Gate C, final coherence gate, bounded surface repair, degraded fallback.
 * Repair may change wording/order/tone. It must not change facts or dispositions.
 *
 * Gate C catches: missing dispositions (obligation loss), DEFENSE_ISOLATION (a refusal that swallowed siblings),
 * LATERALITY_FIDELITY (authoritative LEFT surfacing as RIGHT/unknown), address/language drift, internal
 * placeholders, customer-service fallback, privacy artifacts.
 */

import { looksVietnamese } from "@/lib/dante-language";
import { projectAuthoritativeSide, LATERALITY_UNCERTAIN_MARKER } from "@/lib/dante-core/runtime-convergence/laterality-surface";
import type { HandledObligation, TurnObligation } from "@/lib/dante-core/runtime-convergence/multi-intent";
import { blockSurfaceText, blocksFromHandled } from "@/lib/dante-core/coherence/authority";
import { checkDispositions } from "@/lib/dante-core/coherence/ledger";
import { activeCorrections } from "@/lib/dante-core/coherence/reducer";
import { hasCustomerServiceDrift, hasQuestionNumbering, realizePersona } from "@/lib/dante-core/coherence/realize";
import type { DecisionState } from "@/lib/dante-core/coherence/decision-first";
import { LATERALITY_TOPIC } from "@/lib/dante-core/coherence/corrections";
import type {
  AddressForm,
  CoherenceDisposition,
  ExpressionPlan,
  GateResult,
  ResponseBlock,
  SafetyPhase,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

const L = "(?<![\\p{L}])";
const R = "(?![\\p{L}])";
const pronoun = (alternatives: string): RegExp => new RegExp(`${L}(?:${alternatives})${R}`, "iu");

const FORBIDDEN_FORMS: Record<AddressForm, RegExp | null> = {
  neutral: pronoun("ông|bạn|bro|cậu|mày"),
  unresolved: pronoun("ông|bạn|bro|cậu|mày"),
  ong: pronoun("bạn|bro|cậu|mày"),
  ban: pronoun("ông|bro|cậu|mày"),
  tao_may: pronoun("ông|bạn|bro|cậu"),
  anh_em: pronoun("ông|bạn|bro|cậu|mày"),
  bro: null,
};

const PLACEHOLDER = /\{\{|\}\}|\$\{|\[\[[^\]]*\]\]|<\/?[A-Z][A-Z_]{3,}>|\bundefined\b|\bNaN\b|\[object Object\]|\bDANTE_[A-Z_]+\b|\bINTERNAL_[A-Z_]+\b|\bTODO\b/;

export type SurfaceDrift = { code: "ADDRESS_DRIFT" | "LANGUAGE_DRIFT" | "PLACEHOLDER_LEAK"; message: string };

/** Vietnamese session, but the reply has no Vietnamese signal at all (and is long enough to tell). */
function drifted(text: string, language: "en" | "vi"): boolean {
  if (language !== "vi") return false;
  const words = text.match(/[\p{L}]+/gu) ?? [];
  return words.length >= 14 && !looksVietnamese(text);
}

export function surfaceDrift(
  text: string,
  language: "en" | "vi",
  address: AddressForm,
  /** The language the user wrote THIS message in. An English reply to an English message is not drift. */
  messageLanguage?: "en" | "vi" | "unresolved",
): SurfaceDrift | null {
  if (PLACEHOLDER.test(text)) return { code: "PLACEHOLDER_LEAK", message: "internal placeholder in draft" };
  if (language === "vi") {
    const forbidden = FORBIDDEN_FORMS[address];
    if (forbidden?.test(text)) return { code: "ADDRESS_DRIFT", message: `address form drifted from ${address}` };
  }
  if (messageLanguage !== "en" && drifted(text, language)) {
    return { code: "LANGUAGE_DRIFT", message: "reply is not in the session language" };
  }
  return null;
}

/** The side the user's own explicit (persisted) correction fixed for yesterday's shoulder — the authority. */
export function authoritativeLaterality(snapshot: VersionedState): "LEFT" | "RIGHT" | null {
  const slot = activeCorrections(snapshot).find((c) => c.value.topic === LATERALITY_TOPIC);
  const side = slot?.value.statement;
  return side === "LEFT" || side === "RIGHT" ? side : null;
}

const NEGATED_MENTION = /(?:không phải|chứ không phải|chứ không|not(?: the)?|rather than|instead of)\s*(?:vai\s*)?(?:trái|phải|left|right)/i;

/**
 * LATERALITY_FIDELITY: authoritative LEFT may be said, or omitted — never RIGHT, never "unknown". A negated mention of
 * the superseded side ("không phải vai phải") is the correction itself and is fine.
 */
export function lateralityFidelityViolation(text: string, side: "LEFT" | "RIGHT" | null): string | null {
  if (!side) return null;
  if (LATERALITY_UNCERTAIN_MARKER.test(text)) return "authoritative side rendered as unknown";
  const opposite = side === "LEFT"
    ? /(?:hôm qua|yesterday)[^.!?\n]{0,48}(?:vai phải|right shoulder)|(?:vai phải|right shoulder)[^.!?\n]{0,48}(?:hôm qua|yesterday)/i
    : /(?:hôm qua|yesterday)[^.!?\n]{0,48}(?:vai trái|left shoulder)|(?:vai trái|left shoulder)[^.!?\n]{0,48}(?:hôm qua|yesterday)/i;
  const match = opposite.exec(text);
  if (match && !NEGATED_MENTION.test(match[0])) return "opposite side asserted for yesterday";
  return null;
}

function repairLaterality(text: string, side: "LEFT" | "RIGHT", language: "en" | "vi"): string {
  const words = side === "LEFT"
    ? { vi: "vai trái", en: "left shoulder" }
    : { vi: "vai phải", en: "right shoulder" };
  const restored = text
    .replace(/vai \(chưa chắc bên nào\)/gi, words.vi)
    .replace(/shoulder \(side uncertain\)/gi, words.en);
  return projectAuthoritativeSide(restored, side === "LEFT" ? "RIGHT" : "LEFT", side, language);
}

/**
 * INV-11 DEFENSE ISOLATION: a refusal applies to the obligation that triggered it. refused>0 with siblings that have
 * no disposition means the refusal took over the whole response.
 */
export function evaluateDefenseIsolation(
  obligations: ReadonlyArray<Pick<TurnObligation, "id" | "intent">>,
  handled: ReadonlyArray<Pick<HandledObligation, "id" | "intent" | "disposition">>,
): GateResult {
  if (obligations.length === 0 || handled.length === 0) return { passed: true, code: null, message: null };
  const check = checkDispositions(obligations, handled);
  if (check.refused > 0 && check.siblingsMissing > 0) {
    return {
      passed: false,
      code: "DEFENSE_ISOLATION",
      message: `refusal swallowed ${check.siblingsMissing} sibling obligation(s): ${check.undisposed.join(",")}`,
    };
  }
  return { passed: true, code: null, message: null };
}

export function evaluateGateC(input: {
  draft: string;
  handled: HandledObligation[];
  language: "en" | "vi";
  address: AddressForm;
  snapshot: VersionedState;
  /** The ledger's detected obligations. When given, detected must equal disposed. */
  obligations?: ReadonlyArray<Pick<TurnObligation, "id" | "intent">>;
  messageLanguage?: "en" | "vi" | "unresolved";
}): GateResult {
  if (input.handled.length > 0) {
    const missing = input.handled.filter((h) => !h.disposition);
    if (missing.length > 0) {
      return { passed: false, code: "MISSING_DISPOSITION", message: "handled obligation lacks disposition" };
    }
  }
  if (input.obligations && input.handled.length > 0) {
    const isolation = evaluateDefenseIsolation(input.obligations, input.handled);
    if (!isolation.passed) return isolation;
  }
  if (/decision object|context capsule|DANTE_PRIVATE_CONTEXT_CANARY/i.test(input.draft)) {
    return { passed: false, code: "PRIVACY_LEAK", message: "internal artifact in draft" };
  }
  if (hasCustomerServiceDrift(input.draft)) {
    return { passed: false, code: "CS_DRIFT", message: "customer-service phrasing" };
  }
  const violation = lateralityFidelityViolation(input.draft, authoritativeLaterality(input.snapshot));
  if (violation) return { passed: false, code: "LATERALITY_FIDELITY", message: violation };
  const drift = surfaceDrift(input.draft, input.language, input.address, input.messageLanguage);
  if (drift) return { passed: false, code: drift.code, message: drift.message };
  return { passed: true, code: null, message: null };
}

export function evaluateFinalCoherence(input: {
  draft: string;
  language: "en" | "vi";
  address: AddressForm;
  safetyPhase: SafetyPhase;
  snapshot?: VersionedState;
  messageLanguage?: "en" | "vi" | "unresolved";
}): GateResult {
  if (hasCustomerServiceDrift(input.draft)) {
    return { passed: false, code: "PERSONA", message: "customer-service drift" };
  }
  if (hasQuestionNumbering(input.draft)) {
    return { passed: false, code: "COMPOSITION", message: "question numbering" };
  }
  const safetyActive = input.safetyPhase === "ENTER" || input.safetyPhase === "PERSIST" || input.safetyPhase === "ESCALATE";
  if (safetyActive && /[😂🤣💀😭]/.test(input.draft)) {
    return { passed: false, code: "HUMOR_IN_SAFETY", message: "humor during safety" };
  }
  if (input.snapshot) {
    const violation = lateralityFidelityViolation(input.draft, authoritativeLaterality(input.snapshot));
    if (violation) return { passed: false, code: "LATERALITY_FIDELITY", message: violation };
  }
  const drift = surfaceDrift(input.draft, input.language, input.address, input.messageLanguage);
  if (drift) return { passed: false, code: drift.code, message: drift.message };
  return { passed: true, code: null, message: null };
}

export function surfaceRepair(input: {
  draft: string;
  code: string | null;
  attempt: 1 | 2;
  language: "en" | "vi";
  address: AddressForm;
  safetyPhase: SafetyPhase;
  snapshot: VersionedState;
  handledCount?: number;
  plan?: ExpressionPlan;
  message?: string;
  decisionState?: DecisionState | null;
  allowedFactors?: readonly string[];
}): string {
  let realized = realizePersona({
    draft: input.draft,
    language: input.language,
    address: input.address,
    safetyPhase: input.safetyPhase,
    snapshot: input.snapshot,
    message: input.message,
    decisionState: input.decisionState,
    allowedFactors: input.allowedFactors,
    repetitionAction: "none",
    handledCount: input.handledCount,
    plan: input.plan,
    safetyCategory: input.snapshot.safety.category,
  });
  if (input.code === "COMPOSITION") {
    realized = realized
      .replace(/(?:question|câu hỏi)\s*[123][:.)]?\s*/gi, "")
      .replace(/^\s*[123][.)]\s+/gm, "");
  }
  if (input.code === "PERSONA" || input.code === "CS_DRIFT") {
    realized = realized.replace(/[😂🤣💀😭]/g, "");
  }
  if (input.code === "PLACEHOLDER_LEAK") {
    realized = realized.replace(PLACEHOLDER, "").replace(/[ \t]{2,}/g, " ").trim();
  }
  if (input.code === "LATERALITY_FIDELITY") {
    const side = authoritativeLaterality(input.snapshot);
    if (side) realized = repairLaterality(realized, side, input.language);
  }
  if (input.attempt === 2) {
    return realized
      .replace(/[😂🤣💀😭]/g, "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return realized;
}

/**
 * Last resort when repair cannot make the surface pass. It NEVER collapses the turn to its first obligation
 * (INV-14): every obligation keeps its own text and its own disposition. Pronoun-free — no address is invented.
 */
export function degradedFallback(input: {
  language: "en" | "vi";
  handled: HandledObligation[];
  competingCorrections: boolean;
  pendingIntents?: string[];
  /**
   * The guarded blocks of this reply. Lines are rendered through the same authority contract as the normal path
   * (blockSurfaceText); without them the handled obligations' own origin decides (provider text → acknowledgement).
   */
  blocks?: readonly ResponseBlock[];
}): { text: string; dispositions: Record<string, CoherenceDisposition> } {
  const dispositions: Record<string, CoherenceDisposition> = {};
  const lines: string[] = [];
  if (input.competingCorrections) {
    lines.push(input.language === "vi"
      ? "Hai correction đang xung đột. Cần chốt một bản."
      : "Two corrections conflict. Need you to pick one.");
  }
  if (input.handled.length === 0) {
    lines.push(input.language === "vi"
      ? "Mình giữ đúng dữ kiện hiện có. Nói tiếp ý cần xử lý."
      : "Holding the current facts. Tell me which point to work next.");
  }
  // A free-text draft that could not be repaired is never re-emitted (only obligation-backed and composed blocks are).
  const source = (input.blocks?.length ? [...input.blocks] : blocksFromHandled(input.handled))
    .filter((block) => block.obligationId !== "draft");
  for (const block of source.sort((a, b) => a.order - b.order)) {
    const line = blockSurfaceText(block, input.language).trim();
    if (line) lines.push(line);
  }
  for (const item of input.handled) {
    dispositions[item.intent === "OPEN_REQUEST" ? item.id : item.intent] = item.disposition;
  }
  for (const intent of input.pendingIntents ?? []) {
    if (!dispositions[intent] && !input.handled.some((h) => h.intent === intent)) {
      dispositions[intent] = input.competingCorrections ? "NEEDS_CLARIFICATION" : "DEFERRED";
    }
  }
  return {
    text: lines.join("\n\n").trim(),
    dispositions,
  };
}
