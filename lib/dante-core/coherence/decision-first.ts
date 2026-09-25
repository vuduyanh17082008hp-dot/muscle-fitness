/**
 * P-16 / P-16U — decision-first coach realization.
 * Surface only. Certainty/polarity come from upstream DecisionState, never from user or draft prose.
 */

import type { CurrentTurnState } from "@/lib/dante-core/current-turn-state";
import type { ReasoningScope } from "@/lib/dante-core/reasoning-scope";
import type { ExpressionPlan, SafetyPhase } from "@/lib/dante-core/coherence/types";

export type DecisionState =
  | "RESOLVED_POSITIVE"
  | "RESOLVED_NEGATIVE"
  | "CONDITIONAL_RESOLVED"
  | "UNCERTAIN"
  | "INSUFFICIENT_INFORMATION"
  | "NONE";

const SAFETY = /lightning|flood(?:ing)?|unsafe travel|dangerous visibility|giông|giong|sét|set|ngập|ngap/i;
const ALTERNATIVE = /home workout|mobility session|reschedule|alternative cardio|tập ở nhà|tap o nha/i;
const CS_CLOSE = /(?:ultimately,? it(?:['’]s| is) (?:up to you|about)|it(?:['’]s| is) up to you|consider what feels best|listen to your body|you could alternatively|hope that helps)/i;
const EMPTY_HEDGE = /^(?:consider(?: the safety of traveling(?: to the gym)?)?|you might(?: want to)?(?: consider)?|perhaps|it depends\.?|if you feel (?:confident|like)|go for it!?)$/i;
const DIRECT_COMMAND = /^(?:train|go|skip(?: today)?|do it|tập|nghỉ(?: hôm nay)?)\.?$/i;

type Scoped = {
  intent?: string;
  reasoningScope?: ReasoningScope;
  payload?: { ambiguity?: string; normalized?: string };
  disposition?: string;
  decisionState?: DecisionState;
  sourceSpan?: { text?: string };
};

function obligationCarriesAsk(obligation: Scoped): boolean {
  const text = `${obligation.payload?.normalized ?? ""} ${obligation.sourceSpan?.text ?? ""}`;
  return /should i|train anyway|get (?:myself )?to the gym|co nen|có nên/i.test(text);
}

/**
 * Write DecisionState when the obligation is resolved from structured state.
 * Does not read draft prose.
 */
export function decideObligationDecisionState(
  obligation: Scoped,
  current: CurrentTurnState,
): DecisionState {
  if (obligation.intent !== "OPEN_REQUEST") return "NONE";
  if (obligation.payload?.ambiguity === "ambiguous") return "INSUFFICIENT_INFORMATION";
  if (current.bodyStateUnclear && current.trainingDecisionRequested) return "UNCERTAIN";
  if (!obligationCarriesAsk(obligation) && !current.trainingDecisionRequested) return "NONE";
  if (!obligationCarriesAsk(obligation) && current.trainingDecisionRequested) {
    const text = `${obligation.payload?.normalized ?? ""} ${obligation.sourceSpan?.text ?? ""}`;
    if (!/\b(?:train|gym|skip|workout|session|tap|tập|nghi|nghỉ)\b/i.test(text)) return "NONE";
  }
  const scope = obligation.reasoningScope;
  if (
    current.trainingDecisionRequested
    && scope?.mode === "ONLY"
    && (scope.allowedFactors?.length ?? 0) > 0
  ) {
    return "CONDITIONAL_RESOLVED";
  }
  if (current.trainingDecisionRequested && current.sessionKind === "REST" && current.restDayHeld) {
    return "RESOLVED_NEGATIVE";
  }
  if (
    current.trainingDecisionRequested
    && current.sessionKind === "TRAIN"
    && current.recoveryStatus === "GOOD"
    && current.painAbsent
    && current.unusualAbsent !== false
    && !current.shoulderIrritated
    && !current.bodyStateUnclear
  ) {
    return "RESOLVED_POSITIVE";
  }
  return "NONE";
}

export function isBinaryCoachingQuestion(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  const ask = /should i|do i |có nên|co nen|enough reason|sufficient reason|train anyway/i.test(text);
  const topic = /train|training|gym|skip|workout|session|attend|tập|tap |nghỉ|nghi gym/i.test(text);
  return ask && topic;
}

export function hasHesitationSignal(message: string): boolean {
  return /be honest|just skip|=\)\)+|looking for (?:an )?excuse|permission to skip|dont mention anything else|don't mention anything else/i.test(message);
}

/** Structured obligation/scope/disposition only — never user or draft wording. */
export function resolveDecisionState(input: {
  obligations?: readonly Scoped[];
  handled?: readonly Scoped[];
}): DecisionState {
  const opens = (input.obligations ?? []).filter((o) => o.intent === "OPEN_REQUEST");
  const handledOpen = (input.handled ?? []).filter((h) => !h.intent || h.intent === "OPEN_REQUEST");
  if (handledOpen.some((h) => h.disposition === "NEEDS_CLARIFICATION")) return "INSUFFICIENT_INFORMATION";
  const written = [...opens, ...handledOpen]
    .map((o) => o.decisionState)
    .filter((state): state is DecisionState => Boolean(state) && state !== "NONE");
  const unique = new Set(written);
  if (unique.size === 1) return written[0]!;
  if (opens.length > 1) return "NONE";
  if (opens[0]?.payload?.ambiguity === "ambiguous") return "INSUFFICIENT_INFORMATION";
  return "NONE";
}

export function allowedFactorsOf(obligations?: readonly Scoped[]): string[] {
  const opens = (obligations ?? []).filter((o) => o.intent === "OPEN_REQUEST");
  if (opens.length !== 1) return [];
  return opens[0]?.reasoningScope?.allowedFactors ?? [];
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}

function userAskedAlternatives(message: string): boolean {
  return /home workout|instead|alternative|reschedule|tập ở nhà/i.test(message);
}

function obstacleFromFactors(factors: readonly string[], language: "en" | "vi"): string | null {
  if (factors.includes("rain") || factors.includes("weather")) return language === "vi" ? "mưa" : "rain";
  if (factors.includes("recovery")) return "recovery";
  if (factors.includes("sleep")) return language === "vi" ? "giấc ngủ" : "sleep";
  return null;
}

function isDirectCommand(text: string): boolean {
  const parts = sentences(text);
  return parts.length > 0 && parts.every((s) => DIRECT_COMMAND.test(s.replace(/[.!]$/, "").trim() + "."));
}

function dehedge(sentence: string): string {
  let out = sentence
    .replace(/\bif you feel (?:confident|like)[^.]*?(?:getting there |travel(?:ing)? )?safely[^.]*?(?:then )?go(?: for it)?/gi, "If the trip is safe, go")
    .replace(/\bit might be better to\s+/gi, "")
    .replace(/\byou might consider training\b/gi, "Train")
    .replace(/\byou might want to train\b/gi, "Train")
    .replace(/\byou might still\s+/gi, "")
    .replace(/\byou might consider\s+/gi, "")
    .replace(/\bconsider (?:going|training)\b/gi, "go")
    .replace(/\bconsider the safety of traveling(?: to the gym)?\b/gi, "")
    .replace(/\bthen go for it\b/gi, "go")
    .replace(/\bit depends\b(?!\s+on)/gi, "")
    .replace(/if it['’]?s raining(?: \w+)?,?\s*\.?$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;:\s]+/, "")
    .trim();
  if (out && !/[.!?…]$/.test(out)) out = `${out}.`;
  return out;
}

function isDecisionSentence(text: string): boolean {
  return /not enough reason|isn['’]?t enough|train\b|go\b|skip\b|stay home|rest day|don['’]?t skip|do not skip|tập\b|nghỉ\b/i.test(text);
}

function styleOnly(draft: string, message: string): string {
  let parts = sentences(draft).filter((s) => !CS_CLOSE.test(s));
  if (!userAskedAlternatives(message)) parts = parts.filter((s) => !ALTERNATIVE.test(s));
  return parts.join(" ") || draft;
}

function uncertainCopy(language: "en" | "vi"): string {
  return language === "vi" ? "Chưa chốt được yes/no rõ." : "I can't give you a clean yes yet.";
}

function missingCopy(language: "en" | "vi"): string {
  return language === "vi" ? "Thiếu thông tin — chưa ra lệnh tập hay nghỉ." : "I need more information before I can call that.";
}

function leadFor(
  kind: DecisionState,
  language: "en" | "vi",
  factors: readonly string[],
  existing: string[],
): string | null {
  if (existing.some((s) => /not enough reason|isn['’]?t enough|train\.?$|^go\.?$|^skip/i.test(s))) return null;
  const vi = language === "vi";
  const obstacle = obstacleFromFactors(factors, language);
  if (kind === "RESOLVED_POSITIVE") return vi ? "Tập." : "Train.";
  if (kind === "RESOLVED_NEGATIVE") return vi ? "Nghỉ hôm nay." : "Skip today.";
  if (kind === "CONDITIONAL_RESOLVED" && obstacle) {
    return vi
      ? `Chỉ ${obstacle} thì chưa đủ lý do để skip.`
      : `${obstacle[0]?.toUpperCase()}${obstacle.slice(1)} alone isn't enough reason to skip.`;
  }
  if (kind === "CONDITIONAL_RESOLVED") return vi ? "Chưa đủ lý do để skip." : "That's not enough reason to skip.";
  return null;
}

function compactSafety(parts: string[], language: "en" | "vi"): string | null {
  const hit = parts.find((s) => SAFETY.test(s));
  if (!hit) return null;
  if (/lightning|flood/i.test(hit)) {
    return language === "vi"
      ? "Nếu di chuyển không an toàn vì ngập hoặc sét, ở nhà."
      : "If the trip is unsafe because of flooding or lightning, stay home.";
  }
  return dehedge(hit);
}

function observation(message: string, plan: ExpressionPlan | undefined, language: "en" | "vi"): string | null {
  if (!plan || plan.humor === "OFF" || plan.contextMode === "SAFETY_SERIOUS") return null;
  if (plan.familiarity === "NEUTRAL") return null;
  if (!hasHesitationSignal(message)) return null;
  const mark = plan.allowHumorMarkers && /=\)\)+/.test(message) ? " =))" : "";
  return language === "vi"
    ? `Đang hỏi vì thực sự không an toàn, hay đang tìm lý do để skip?${mark}`
    : `Are you asking because the trip is actually unsafe, or looking for a reason to skip?${mark}`;
}

export function applyDecisionFirst(input: {
  draft: string;
  decisionState?: DecisionState | null;
  allowedFactors?: readonly string[];
  message?: string;
  language: "en" | "vi";
  plan?: ExpressionPlan;
  handledCount?: number;
  safetyPhase?: SafetyPhase;
}): string {
  const draft = input.draft.trim();
  if (!draft) return input.draft;
  if ((input.handledCount ?? 0) > 1) return input.draft;
  const safetyActive = input.safetyPhase === "ENTER" || input.safetyPhase === "PERSIST" || input.safetyPhase === "ESCALATE";
  if (safetyActive) return input.draft;

  const kind = input.decisionState ?? "NONE";
  const message = input.message ?? "";
  const factors = input.allowedFactors ?? [];

  if (kind === "NONE") return input.draft;

  if (kind === "UNCERTAIN") {
    const kept = styleOnly(draft, message);
    return isDirectCommand(kept) ? uncertainCopy(input.language) : kept;
  }
  if (kind === "INSUFFICIENT_INFORMATION") {
    const kept = styleOnly(draft, message);
    return isDirectCommand(kept) ? missingCopy(input.language) : kept;
  }

  let parts = sentences(draft).filter((s) => !CS_CLOSE.test(s));
  if (!userAskedAlternatives(message)) parts = parts.filter((s) => !ALTERNATIVE.test(s));
  parts = parts.map(dehedge).filter((s) => s.length > 0 && !EMPTY_HEDGE.test(s.replace(/[.!?]$/, "")));
  const lead = leadFor(kind, input.language, factors, parts);
  const safety = kind === "CONDITIONAL_RESOLVED"
    ? compactSafety(parts, input.language) ?? (
      factors.includes("rain") || factors.includes("weather")
        ? (input.language === "vi"
          ? "Nếu di chuyển không an toàn vì ngập hoặc sét, ở nhà."
          : "If the trip is unsafe because of flooding or lightning, stay home.")
        : (input.language === "vi" ? "Nếu không an toàn thì ở nhà." : "If the trip is unsafe, stay home.")
    )
    : null;
  const kept = parts.filter((s) => {
    if (safety && SAFETY.test(s)) return false;
    if (lead && /not enough reason|isn['’]?t enough/i.test(lead) && /not enough reason|isn['’]?t enough/i.test(s)) return false;
    if (kind === "RESOLVED_NEGATIVE" && /\b(?:go|train)\b/i.test(s) && !/not train|don['’]?t train|do not train|skip|rest day/i.test(s)) return false;
    if (kind === "RESOLVED_POSITIVE" && /skip\b|stay home/i.test(s) && !/don['’]?t skip|do not skip|no reason not to/i.test(s)) return false;
    return isDecisionSentence(s) || (!EMPTY_HEDGE.test(s) && !CS_CLOSE.test(s) && !ALTERNATIVE.test(s));
  });
  const goTail = kind === "CONDITIONAL_RESOLVED" && !kept.some((s) => /\bgo\b|if the trip is safe/i.test(s))
    ? (input.language === "vi" ? "Không thì đi tập." : "Otherwise get to the gym.")
    : null;
  const beat = observation(message, input.plan, input.language);

  const out = [lead, safety, ...kept, goTail, beat]
    .filter((s): s is string => Boolean(s))
    .filter((s, i, all) => all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);
  let text = (out.length > 0 ? out.join(" ") : draft).replace(/\s{2,}/g, " ").trim();
  if (kind === "CONDITIONAL_RESOLVED" && DIRECT_COMMAND.test(text)) {
    text = [
      leadFor(kind, input.language, factors, []),
      safety ?? (input.language === "vi"
        ? "Nếu không an toàn thì ở nhà."
        : "If the trip is unsafe, stay home."),
      goTail ?? (input.language === "vi" ? "Không thì đi tập." : "Otherwise get to the gym."),
    ].filter(Boolean).join(" ");
  }
  return text;
}
