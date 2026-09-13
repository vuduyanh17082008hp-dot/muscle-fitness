import type { DanteInsight } from "@/lib/dante-core/insight";

/**
 * Contextual Suggestions (spec: replace cold generic chat categories
 * with real-state-aware conversation starters).
 *
 * Architecture: real user data -> this compact selector -> deterministic
 * rules -> Dante UI. Nothing here calls an LLM or invents a value —
 * every branch below only reads the signals it's given and picks
 * between a small set of pre-written natural-language prompts.
 *
 * One suggestion per slot (training / nutrition / recovery / progress)
 * keeps the empty state compact. Each slot falls back to a useful
 * generic starter when there's no real signal to sharpen it with —
 * this is what makes a brand-new user's empty state still useful
 * instead of blank.
 */

export type ChatSuggestionSignals = {
  recoveryScore: number | null;
  hasCheckinToday: boolean;
  todayWorkoutName: string | null;
  todayWorkoutSessionId: string | null;
  proteinRemainingG: number | null;
  proteinTargetG: number | null;
};

const LOW_RECOVERY_THRESHOLD = 65;

function buildTrainingSuggestion(signals: ChatSuggestionSignals): DanteInsight {
  if (signals.todayWorkoutName && signals.recoveryScore !== null && signals.recoveryScore < LOW_RECOVERY_THRESHOLD) {
    return {
      id: "suggestion-training-low-recovery",
      action: `⚡ Should I still train ${signals.todayWorkoutName} today?`,
      category: "recovery",
      severity: signals.recoveryScore < 50 ? "warning" : "notice",
      reasons: [`Recovery score is ${signals.recoveryScore}/100 today.`],
      evidence: [{ label: "Recovery score", value: `${signals.recoveryScore}/100` }],
      prompt: `My recovery score is ${signals.recoveryScore} today and I have ${signals.todayWorkoutName} planned. Should I still train hard, modify the session, or take it easier?`,
      nextAction: signals.todayWorkoutSessionId
        ? { label: "View workout", href: `/dashboard/workouts/session/${signals.todayWorkoutSessionId}` }
        : undefined,
    };
  }

  if (signals.todayWorkoutName) {
    return {
      id: "suggestion-training-today",
      action: `🏋️ What should I focus on for ${signals.todayWorkoutName} today?`,
      category: "training",
      reasons: [],
      evidence: [],
      prompt: `What should I focus on for my ${signals.todayWorkoutName} session today?`,
      nextAction: signals.todayWorkoutSessionId
        ? { label: "Open workout", href: `/dashboard/workouts/session/${signals.todayWorkoutSessionId}` }
        : undefined,
    };
  }

  return {
    id: "suggestion-training-generic",
    action: "🏋️ What should I train today?",
    category: "training",
    reasons: [],
    evidence: [],
    prompt: "What should I train today based on my current plan and recovery?",
  };
}

function buildNutritionSuggestion(signals: ChatSuggestionSignals): DanteInsight {
  if (signals.proteinRemainingG !== null && signals.proteinRemainingG > 0) {
    return {
      id: "suggestion-nutrition-protein",
      action: `🍗 What can I eat to hit my remaining ${signals.proteinRemainingG} g protein target?`,
      category: "nutrition",
      reasons: [],
      evidence:
        signals.proteinTargetG !== null
          ? [{ label: "Protein target", value: `${signals.proteinTargetG} g` }]
          : [],
      prompt: `I have ${signals.proteinRemainingG} g of protein remaining today${
        signals.proteinTargetG !== null ? ` out of a ${signals.proteinTargetG} g target` : ""
      }. What should I eat?`,
      nextAction: { label: "Find a meal", href: "/dashboard/nutrition" },
    };
  }

  return {
    id: "suggestion-nutrition-generic",
    action: "🥗 Help me plan meals for my remaining macros.",
    category: "nutrition",
    reasons: [],
    evidence: [],
    prompt: "Help me plan meals for my remaining macros today.",
    nextAction: { label: "Open nutrition", href: "/dashboard/nutrition" },
  };
}

function buildRecoverySuggestion(signals: ChatSuggestionSignals): DanteInsight {
  if (!signals.hasCheckinToday) {
    return {
      id: "suggestion-recovery-checkin",
      action: "🛌 You have not checked in today.",
      category: "checkin",
      reasons: [],
      evidence: [],
      prompt: "I haven't checked in today. What should I log before training?",
      nextAction: { label: "Check in", href: "/dashboard/recovery" },
    };
  }

  if (signals.recoveryScore !== null && signals.recoveryScore < LOW_RECOVERY_THRESHOLD) {
    return {
      id: "suggestion-recovery-low",
      action: `🧠 Why is my recovery only ${signals.recoveryScore} today?`,
      category: "recovery",
      severity: signals.recoveryScore < 50 ? "warning" : "notice",
      reasons: [],
      evidence: [{ label: "Recovery score", value: `${signals.recoveryScore}/100` }],
      prompt: `Why is my recovery score only ${signals.recoveryScore} today?`,
      nextAction: { label: "View recovery", href: "/dashboard/recovery" },
    };
  }

  return {
    id: "suggestion-recovery-generic",
    action: "⚡ Am I recovered enough to train hard?",
    category: "recovery",
    reasons: [],
    evidence: [],
    prompt: "Am I recovered enough to train hard today?",
    nextAction: { label: "View recovery", href: "/dashboard/recovery" },
  };
}

function buildProgressSuggestion(): DanteInsight {
  // No stored progress-trend source exists yet in the Athlete Digital
  // Twin (see lib/athlete-state/types.ts — progress.status is
  // "not_yet_implemented"), so this slot never sharpens with real
  // numbers — it stays a generic, honest starter rather than
  // fabricating a trend.
  return {
    id: "suggestion-progress-generic",
    action: "📈 How am I progressing this month?",
    category: "progress",
    reasons: [],
    evidence: [],
    prompt: "Summarize my recent progress and what to focus on next.",
  };
}

export function buildChatSuggestions(signals: ChatSuggestionSignals): DanteInsight[] {
  return [
    buildTrainingSuggestion(signals),
    buildNutritionSuggestion(signals),
    buildRecoverySuggestion(signals),
    buildProgressSuggestion(),
  ];
}
