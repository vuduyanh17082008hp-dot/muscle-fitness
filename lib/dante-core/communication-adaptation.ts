/**
 * Phase 2D — Lightweight communication adaptation.
 *
 * Not a psychological profile engine. Resolves a communication mode
 * and five style knobs from explicit coaching preference + optional
 * turn signals. Modes: COACH / EXPLAIN / CHALLENGE / REFLECT / PRESENCE.
 */

import type { CoachingPreference } from "@/lib/dante-core/memory";

export type CommunicationMode = "COACH" | "EXPLAIN" | "CHALLENGE" | "REFLECT" | "PRESENCE";

export type CommunicationStyle = {
  mode: CommunicationMode;
  brevity: number; // 0 concise … 1 expansive
  directness: number; // 0 soft … 1 blunt
  technicalDepth: number; // 0 plain … 1 technical
  motivationLevel: number; // 0 neutral … 1 highly motivating
  reflectionTolerance: number; // 0 action-only … 1 reflective
};

export type CommunicationSignals = {
  coachingPreference: CoachingPreference | null;
  /** User explicitly asked "why" / for explanation. */
  asksWhy?: boolean;
  /** User asked for a harder push / challenge. */
  asksChallenge?: boolean;
  /** User seems uncertain / reflective. */
  asksReflect?: boolean;
  /** Safety or high-emotion turn — prefer presence over challenge. */
  needsPresence?: boolean;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function baseFromPreference(preference: CoachingPreference | null): Omit<CommunicationStyle, "mode"> {
  switch (preference) {
    case "direct":
      return {
        brevity: 0.75,
        directness: 0.9,
        technicalDepth: 0.45,
        motivationLevel: 0.35,
        reflectionTolerance: 0.25,
      };
    case "encouraging":
      return {
        brevity: 0.45,
        directness: 0.4,
        technicalDepth: 0.35,
        motivationLevel: 0.85,
        reflectionTolerance: 0.45,
      };
    case "detailed":
      return {
        brevity: 0.2,
        directness: 0.55,
        technicalDepth: 0.85,
        motivationLevel: 0.4,
        reflectionTolerance: 0.55,
      };
    case "concise":
      return {
        brevity: 0.9,
        directness: 0.7,
        technicalDepth: 0.35,
        motivationLevel: 0.3,
        reflectionTolerance: 0.2,
      };
    default:
      return {
        brevity: 0.55,
        directness: 0.6,
        technicalDepth: 0.5,
        motivationLevel: 0.5,
        reflectionTolerance: 0.4,
      };
  }
}

export function resolveCommunicationMode(signals: CommunicationSignals): CommunicationMode {
  if (signals.needsPresence) return "PRESENCE";
  if (signals.asksReflect) return "REFLECT";
  if (signals.asksChallenge) return "CHALLENGE";
  if (signals.asksWhy) return "EXPLAIN";

  switch (signals.coachingPreference) {
    case "detailed":
      return "EXPLAIN";
    case "encouraging":
      return "COACH";
    case "direct":
    case "concise":
      return "COACH";
    default:
      return "COACH";
  }
}

export function resolveCommunicationStyle(signals: CommunicationSignals): CommunicationStyle {
  const mode = resolveCommunicationMode(signals);
  const base = baseFromPreference(signals.coachingPreference);

  let { brevity, directness, technicalDepth, motivationLevel, reflectionTolerance } = base;

  if (mode === "EXPLAIN") {
    technicalDepth = clamp01(technicalDepth + 0.2);
    reflectionTolerance = clamp01(reflectionTolerance + 0.15);
    brevity = clamp01(brevity - 0.15);
  } else if (mode === "CHALLENGE") {
    directness = clamp01(directness + 0.2);
    motivationLevel = clamp01(motivationLevel + 0.2);
    reflectionTolerance = clamp01(reflectionTolerance - 0.1);
  } else if (mode === "REFLECT") {
    reflectionTolerance = clamp01(reflectionTolerance + 0.35);
    directness = clamp01(directness - 0.15);
    brevity = clamp01(brevity - 0.1);
  } else if (mode === "PRESENCE") {
    motivationLevel = clamp01(motivationLevel - 0.2);
    directness = clamp01(directness - 0.25);
    technicalDepth = clamp01(technicalDepth - 0.25);
    reflectionTolerance = clamp01(reflectionTolerance + 0.2);
    brevity = clamp01(brevity + 0.1);
  }

  return {
    mode,
    brevity,
    directness,
    technicalDepth,
    motivationLevel,
    reflectionTolerance,
  };
}

/** Deterministic prompt hints — no LLM, no psych profiling. */
export function buildCommunicationPromptHints(style: CommunicationStyle): string {
  const brevityHint =
    style.brevity >= 0.7 ? "Keep the reply short." : style.brevity <= 0.35 ? "Allow a fuller explanation." : "Keep length moderate.";
  const directHint =
    style.directness >= 0.7 ? "Be direct." : style.directness <= 0.4 ? "Be gentle." : "Be clear and balanced.";
  const techHint =
    style.technicalDepth >= 0.7
      ? "Use precise training terminology where helpful."
      : style.technicalDepth <= 0.4
        ? "Prefer plain language."
        : "Mix plain language with light technical detail.";
  const motivationHint =
    style.motivationLevel >= 0.7
      ? "Include brief encouragement."
      : style.motivationLevel <= 0.35
        ? "Stay matter-of-fact."
        : "Encourage lightly when relevant.";
  const reflectHint =
    style.reflectionTolerance >= 0.6
      ? "Invite a short reflection if useful."
      : "Prefer actionable next steps over open-ended reflection.";

  return [
    `Communication mode: ${style.mode}.`,
    brevityHint,
    directHint,
    techHint,
    motivationHint,
    reflectHint,
  ].join(" ");
}
