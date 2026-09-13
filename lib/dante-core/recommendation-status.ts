import type { ProgramAdaptation } from "@/lib/dante-core/adaptive-program-engine";
import type { DailyDecisionCode } from "@/lib/dante-core/daily-decision-engine";

/**
 * ONE canonical adaptive-recommendation status vocabulary, shared by
 * Training, Today's Plan, Dashboard and Dante — so the same
 * underlying deterministic decision never reads as a different status
 * on different screens. Nothing here computes a decision; both
 * mapping functions below only classify an ALREADY-COMPUTED result
 * from the existing engines (adaptive-program-engine.ts /
 * daily-decision-engine.ts).
 */

export type RecommendationStatus = "progress" | "build" | "hold" | "adjust" | "recover" | "caution";

export const RECOMMENDATION_STATUS_LABEL: Record<RecommendationStatus, string> = {
  progress: "Increase load",
  build: "Add reps",
  hold: "Maintain",
  adjust: "Reduce volume",
  recover: "Recovery priority",
  caution: "Pain constraint",
};

/**
 * Restrained domain accents — never the ONLY signal for a state (each
 * status also has a distinct label and, for caution/recover, an icon)
 * so color is never load-bearing on its own for safety-relevant
 * information (mission Part 2: "Do not communicate safety only
 * through color").
 */
export const RECOMMENDATION_STATUS_ACCENT: Record<
  RecommendationStatus,
  { text: string; border: string; bg: string }
> = {
  progress: { text: "text-emerald-300", border: "border-emerald-400/20", bg: "bg-emerald-400/10" },
  build: { text: "text-mf-sunset", border: "border-orange-400/20", bg: "bg-orange-400/10" },
  hold: { text: "text-zinc-400", border: "border-white/10", bg: "bg-white/[0.04]" },
  adjust: { text: "text-amber-300", border: "border-amber-400/20", bg: "bg-amber-400/10" },
  recover: { text: "text-[var(--mf-violet)]", border: "border-[var(--mf-violet)]/20", bg: "bg-[var(--mf-violet)]/10" },
  caution: { text: "text-rose-300", border: "border-rose-400/20", bg: "bg-rose-400/10" },
};

/** Exercise-level (cross-session) status, from the Adaptive Program Engine's output — used on Training/session pages. */
export function statusFromProgramAdaptation(adaptation: ProgramAdaptation): RecommendationStatus {
  if (adaptation.gated) {
    return adaptation.gateReason === "pain" ? "caution" : "recover";
  }

  switch (adaptation.action) {
    case "INCREASE_LOAD":
      return "progress";
    case "DECREASE_LOAD":
      return "adjust";
    case "HOLD":
      return adaptation.subAction === "add_reps" ? "build" : "hold";
    case "INSUFFICIENT_DATA":
      return "hold";
  }
}

/**
 * Session-level (today's plan) status, from the Daily Decision
 * Engine's decisionCode — used on Today's Plan/Dashboard. Returns
 * null for codes with nothing adaptive to report (no session
 * scheduled, or genuinely insufficient data) — callers should fall
 * back to a plain, non-adaptive description in that case rather than
 * force one of the six statuses.
 */
export function statusFromDailyDecisionCode(code: DailyDecisionCode): RecommendationStatus | null {
  switch (code) {
    case "proceed_as_planned":
      return "hold";
    case "modify_session":
      return "adjust";
    // daily-decision-engine.ts only ever sets "prioritize_recovery" when a pain/illness flag triggered it — see the safety-gate branch at the top of buildDailyDecision().
    case "prioritize_recovery":
      return "caution";
    case "no_session_scheduled":
    case "insufficient_data":
      return null;
  }
}
