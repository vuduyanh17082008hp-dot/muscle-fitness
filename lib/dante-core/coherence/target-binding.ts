/**
 * P-13 / P-14 — current-turn target binding.
 *
 * A verified claim is not enough to surface. Every NORMAL block must bind to a
 * CURRENT_ACTIVE obligation or an EXPLICITLY_OPEN_PRIOR ledger item. Stale and
 * unknown ids are dropped, never coerced into current.
 */

import { decisionBlock } from "@/lib/dante-core/coherence/authority";
import { relevantOpenLoops } from "@/lib/dante-core/coherence/reducer";
import type { ResponseBlock, SafetyPhase, VersionedState } from "@/lib/dante-core/coherence/types";
import type { HandledObligation, TurnObligation } from "@/lib/dante-core/runtime-convergence/multi-intent";

export type BindingStatus = "CURRENT_ACTIVE" | "EXPLICITLY_OPEN_PRIOR" | "STALE" | "UNKNOWN";

const CURRENT_COMPOSED = new Set([
  "composed:correction_ack",
  "composed:laterality",
  "composed:safety_boundary_note",
  "composed:competing_corrections",
  "composed:degraded_notice",
]);

const VOLUME_CANNED =
  /attribute the improvement to lower volume alone|không gán improvement cho riêng giảm volume/i;

const COMPETING_INTENTS: ReadonlySet<TurnObligation["intent"]> = new Set([
  "OPEN_REQUEST",
  "TEMPORAL_SAFETY",
  "TOOL_ACTION_TRUTH",
  "PRIVACY_BOUNDARY",
  "MEMORY_BOUNDARY",
]);

export function isVolumeAttributionCanned(text: string): boolean {
  return VOLUME_CANNED.test(text);
}

export function currentAsksVolumeCause(
  message: string,
  obligations: ReadonlyArray<Pick<TurnObligation, "intent">> = [],
): boolean {
  if (obligations.some((o) => o.intent === "CAUSAL_ATTRIBUTION")) return true;
  return /(?:volume).{0,80}(?:nguyen\s+nhan|nguyên nhân|reason|\bcause[sd]?\b|attribut)|(?:nguyen\s+nhan|nguyên nhân|reason|\bcause[sd]?\b|attribut).{0,80}volume|co\s+phai.{0,40}volume/i.test(
    message,
  );
}

/** Whole-turn confidence canned replies may own the surface only when they answer this turn. */
export function confidenceReplyEligible(input: {
  reply: string | null;
  obligations: ReadonlyArray<Pick<TurnObligation, "intent">>;
  message: string;
}): boolean {
  if (!input.reply) return false;
  if (!isVolumeAttributionCanned(input.reply)) return true;
  return currentAsksVolumeCause(input.message, input.obligations);
}

function safetyLive(phase: SafetyPhase): boolean {
  return phase === "ENTER" || phase === "PERSIST" || phase === "ESCALATE";
}

export function resolveBindingStatus(input: {
  obligationId: string;
  text?: string;
  currentIds: ReadonlySet<string>;
  priorOpen: boolean;
  safetyLive: boolean;
  currentAsksVolumeCause: boolean;
}): BindingStatus {
  const id = input.obligationId;
  if (input.currentIds.has(id) || CURRENT_COMPOSED.has(id)) return "CURRENT_ACTIVE";
  if (id === "composed:return_thread") return input.priorOpen ? "EXPLICITLY_OPEN_PRIOR" : "STALE";
  if (id === "draft") {
    if (input.text && isVolumeAttributionCanned(input.text) && !input.currentAsksVolumeCause) return "STALE";
    return "CURRENT_ACTIVE";
  }
  if (input.safetyLive && (id === "obl_temporal_safety" || id.startsWith("composed:safety"))) return "CURRENT_ACTIVE";
  if (id.startsWith("composed:")) return "UNKNOWN";
  return "STALE";
}

function rank(status: BindingStatus, intent: TurnObligation["intent"] | undefined, safetyPhase: SafetyPhase): number {
  if (status !== "CURRENT_ACTIVE") return status === "EXPLICITLY_OPEN_PRIOR" ? 2 : 9;
  if (intent === "TEMPORAL_SAFETY" || safetyLive(safetyPhase)) return 0;
  return 1;
}

function fallbackText(message: string, obligations: readonly TurnObligation[], language: "en" | "vi"): string {
  const topic = [message, ...obligations.map((o) => `${o.payload.normalized ?? ""} ${o.sourceSpan?.text ?? ""}`)].join(" ");
  if (/(?:rain|mưa).{0,80}(?:skip|gym|train|tập)|(?:skip|bỏ).{0,40}(?:gym|train|tập)/i.test(topic)) {
    return language === "vi"
      ? "Mình chưa đủ cơ sở để kết luận chỉ vì mưa thì nên bỏ buổi tập."
      : "I can't confidently answer whether rain alone should make you skip training.";
  }
  if (/(?:train|tập|workout)/i.test(topic)) {
    return language === "vi"
      ? "Mình chưa đủ cơ sở để trả lời hôm nay nên tập gì."
      : "I can't confidently answer what you should train today.";
  }
  return language === "vi"
    ? "Mình chưa đủ cơ sở để trả lời câu hỏi hiện tại."
    : "I can't confidently answer the current question from the available coaching path.";
}

export function applyTargetBinding(input: {
  blocks: ResponseBlock[];
  currentObligations: readonly TurnObligation[];
  handled: readonly HandledObligation[];
  snapshot: VersionedState;
  language: "en" | "vi";
  safetyPhase: SafetyPhase;
  message?: string;
}): ResponseBlock[] {
  const currentIds = new Set([
    ...input.currentObligations.map((o) => o.id),
    ...input.handled.map((h) => h.id),
  ]);
  const priorOpen = relevantOpenLoops(input.snapshot).some((l) => l.status === "ACTIVE" || l.status === "AGING");
  const volumeAsk = currentAsksVolumeCause(input.message ?? "", input.currentObligations);
  const competing = input.currentObligations.some((o) => COMPETING_INTENTS.has(o.intent));
  const live = safetyLive(input.safetyPhase);
  const intentOf = new Map(input.currentObligations.map((o) => [o.id, o.intent]));

  const tagged = input.blocks.map((block) => ({
    block,
    status: resolveBindingStatus({
      obligationId: block.obligationId,
      text: block.text,
      currentIds,
      priorOpen,
      safetyLive: live,
      currentAsksVolumeCause: volumeAsk,
    }),
  }));

  let eligible = tagged.filter((row) => row.status === "CURRENT_ACTIVE" || row.status === "EXPLICITLY_OPEN_PRIOR");
  const currentBound = eligible.filter((row) => row.status === "CURRENT_ACTIVE");
  // Open prior must not become the answer when no current-bound block remains. Authority-degraded
  // current blocks still count — P-10 already disposed them; do not replace that ack.
  const unresolvedCurrent = competing && currentBound.length === 0 && !live;
  if (unresolvedCurrent) {
    eligible = eligible.filter((row) => row.status !== "EXPLICITLY_OPEN_PRIOR");
  }

  eligible.sort(
    (a, b) =>
      rank(a.status, intentOf.get(a.block.obligationId), input.safetyPhase)
      - rank(b.status, intentOf.get(b.block.obligationId), input.safetyPhase)
      || a.block.order - b.block.order,
  );

  let out = eligible.map((row, order) => ({ ...row.block, order }));
  const hasCurrentBound = out.some((b) => currentIds.has(b.obligationId) || b.obligationId === "draft" || CURRENT_COMPOSED.has(b.obligationId));
  if (input.currentObligations.length > 0 && competing && !hasCurrentBound && !live) {
    const primary = input.currentObligations.find((o) => o.intent === "TEMPORAL_SAFETY")
      ?? input.currentObligations.find((o) => o.intent === "OPEN_REQUEST")
      ?? input.currentObligations[0];
    out = [
      decisionBlock(
        primary.id,
        "NEEDS_CLARIFICATION",
        fallbackText(input.message ?? "", input.currentObligations, input.language),
      ),
    ].map((block, order) => ({ ...block, order }));
  }
  return out;
}
