import type { ConfidenceLevel } from "@/lib/dante-core/types";

/**
 * Structured Insight contract (spec: "Explainable Recommendation
 * Model"). This is the reusable shape a chat-surfaced Dante
 * suggestion or recommendation is built into — deliberately similar
 * to, but lighter-weight than, TraceableDecision (lib/dante-core/types.ts).
 * TraceableDecision is an ENGINE's own decision record (autoregulation,
 * daily-decision); DanteInsight is the CHAT/UI-facing wrapper around
 * one — a single recommendation with real evidence, an optional next
 * action button, and an optional conversation-starter prompt.
 *
 * Nothing here performs new calculation. Every DanteInsight must be
 * built from data that was already computed deterministically
 * elsewhere (recovery score, training load, food log totals, etc.) —
 * see build-chat-suggestions.ts and build-chat-insight.ts.
 *
 * This shape is intentionally adaptive-engine-ready: `action` /
 * `category` / `severity` / `nextAction` give a future Adaptive
 * Engine output a stable contract to render through, without this
 * task implementing that engine.
 */

export type InsightCategory =
  | "training"
  | "nutrition"
  | "recovery"
  | "checkin"
  | "progress"
  | "general";

export type InsightSeverity = "info" | "notice" | "warning";

export type EvidenceItem = {
  label: string;
  value: string;
  /** Short qualitative note, e.g. "Below recent baseline", "High". Omit rather than guess. */
  note?: string | null;
};

export type InsightAction = {
  label: string;
  /** Always a real, existing route — never a placeholder. */
  href: string;
};

export type DanteInsight = {
  id: string;
  /** Short, human-readable recommendation or observation, e.g. "Reduce today's lower-body volume by around 20%." */
  action: string;
  category: InsightCategory;
  /** Omitted when there's nothing notable enough to flag. */
  severity?: InsightSeverity;
  /** One bullet per real reason behind `action`. Empty when there's nothing beyond the headline. */
  reasons: string[];
  /** The "Why This?" evidence panel — only real, already-computed values. Empty array, not fabricated placeholders, when nothing exists. */
  evidence: EvidenceItem[];
  /** Omitted when there isn't enough basis to state one. */
  confidence?: ConfidenceLevel;
  /** A single real next-step button. Omitted when there's nothing actionable beyond reading the message. */
  nextAction?: InsightAction;
  /** When this insight also doubles as an empty-state conversation starter, the full message to send on click. */
  prompt?: string;
};
