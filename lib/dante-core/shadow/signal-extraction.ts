import type { AthleteState } from "@/lib/athlete-state/types";
import type { SafetyCheckResult } from "@/lib/dante-core/safety-layer";
import { classifyContext } from "@/lib/dante-core/response-learning";
import type {
  AthleteDriftSnapshot,
  ExtractedSignals,
  StructuredSignal,
} from "@/lib/dante-core/shadow/types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function signal(
  userId: string,
  timestamp: string,
  kind: string,
  value: StructuredSignal["value"],
  source: StructuredSignal["source"],
  confidence: number,
): StructuredSignal {
  return { userId, timestamp, kind, value, source, confidence: clamp01(confidence) };
}

function extractMessageKeyphrases(message: string): string[] {
  const normalized = message.toLocaleLowerCase("en-US");
  const phrases = [
    "poor sleep",
    "high stress",
    "low recovery",
    "reduce volume",
    "increase load",
    "meal timing",
    "đau ngực",
    "khó thở",
    "mất ngủ",
    "căng thẳng",
  ];
  return phrases.filter((phrase) => normalized.includes(phrase));
}

function inferIntent(message: string): string {
  const normalized = message.toLocaleLowerCase("en-US");
  if (/\b(why|explain|tại sao|tai sao)\b/.test(normalized)) return "explanation";
  if (/\b(log|record|save|ghi lại|ghi lai)\b/.test(normalized)) return "record_data";
  if (/\b(should|recommend|what should|nên|nen)\b/.test(normalized)) return "recommendation";
  if (/\b(prefer|i like|tôi thích|toi thich)\b/.test(normalized)) return "preference";
  return message.trim() ? "general_coaching" : "state_observation";
}

function freshnessConfidence(status: AthleteState["dataFreshness"]["recovery"]["status"]): number {
  if (status === "current") return 1;
  if (status === "stale") return 0.45;
  return 0;
}

export function extractStructuredSignals(input: {
  userId: string;
  athleteState: AthleteState;
  message?: string;
  safetyCheck?: SafetyCheckResult;
  timestamp?: string;
}): ExtractedSignals {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const message = input.message?.trim() ?? "";
  const state = input.athleteState;
  const contextSignature = classifyContext({
    sleepHours: state.recovery.sleepHours,
    stress: state.recovery.stress,
    soreness: state.recovery.soreness,
    recoveryScore: state.recovery.score,
    trainingLoadState: state.recovery.trainingLoadState,
  });

  const keyphrases = extractMessageKeyphrases(message).map((phrase) =>
    signal(input.userId, timestamp, "keyphrase", phrase, "user_message", 0.75),
  );
  const metrics: StructuredSignal[] = [
    signal(input.userId, timestamp, "recovery_score", state.recovery.score, "athlete_state", state.derived.overallConfidence),
    signal(input.userId, timestamp, "sleep_hours", state.recovery.sleepHours, "athlete_state", freshnessConfidence(state.dataFreshness.recovery.status)),
    signal(input.userId, timestamp, "stress", state.recovery.stress, "athlete_state", freshnessConfidence(state.dataFreshness.recovery.status)),
    signal(input.userId, timestamp, "soreness", state.recovery.soreness, "athlete_state", freshnessConfidence(state.dataFreshness.recovery.status)),
  ];

  return {
    userId: input.userId,
    timestamp,
    contextSignature,
    keyphrases,
    metrics,
    intents: [signal(input.userId, timestamp, "intent", inferIntent(message), "user_message", message ? 0.72 : 0.9)],
    training: [
      signal(input.userId, timestamp, "training_data_available", state.training.hasAnyLoggedData, "athlete_state", 1),
      signal(input.userId, timestamp, "training_load_state", state.recovery.trainingLoadState, "athlete_state", state.derived.overallConfidence),
    ],
    recovery: [
      signal(input.userId, timestamp, "recovery_available", state.recovery.available, "athlete_state", 1),
      signal(input.userId, timestamp, "pain_flag", state.recovery.painFlag, "athlete_state", 1),
    ],
    nutrition: [
      signal(input.userId, timestamp, "nutrition_available", state.nutrition.available, "athlete_state", 1),
      signal(input.userId, timestamp, "calorie_target", state.nutrition.calorieTarget, "athlete_state", freshnessConfidence(state.dataFreshness.nutrition.status)),
    ],
    preferences: state.profile.goal
      ? [signal(input.userId, timestamp, "goal", state.profile.goal, "athlete_state", 0.95)]
      : [],
    temporal: [
      signal(input.userId, timestamp, "generated_at", state.generatedAt, "temporal_context", 1),
      signal(input.userId, timestamp, "recovery_freshness", state.dataFreshness.recovery.status, "temporal_context", freshnessConfidence(state.dataFreshness.recovery.status)),
    ],
    safety: input.safetyCheck?.triggered
      ? [
          signal(
            input.userId,
            timestamp,
            "phase1_safety_trigger",
            input.safetyCheck.category,
            "phase1_safety",
            1,
          ),
        ]
      : [],
  };
}

export function athleteStateToDriftSnapshot(
  userId: string,
  athleteState: AthleteState,
): AthleteDriftSnapshot {
  const trainingLoads = athleteState.training.muscles
    .map((entry) => entry.analytics.currentWeek.totalEffectiveSets)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const trainingLoad = trainingLoads.length > 0
    ? trainingLoads.reduce((sum, value) => sum + value, 0)
    : null;

  return {
    userId,
    capturedAt: athleteState.generatedAt,
    goal: athleteState.profile.goal,
    sleepHours: athleteState.recovery.sleepHours,
    scheduleDays: athleteState.profile.trainingFrequency,
    stress: athleteState.recovery.stress,
    trainingLoad,
    recoveryScore: athleteState.recovery.score,
    calorieAdherence: null,
    adherence: null,
    communicationPreference: null,
  };
}
