/**
 * Phase 2D — Lightweight communication adaptation.
 *
 * Not a psychological profile engine. Resolves a communication mode
 * and style knobs from:
 *   - explicit coaching preference (user-controlled long-term)
 *   - gradual working profile (repeated turn signals)
 *   - temporary turn overrides (do not rewrite long-term profile)
 *
 * Modes: COACH / EXPLAIN / CHALLENGE / REFLECT / PRESENCE
 * Mode labels are internal — never show them to users.
 */

import type { CoachingPreference } from "@/lib/dante-core/memory";

export type CommunicationMode = "COACH" | "EXPLAIN" | "CHALLENGE" | "REFLECT" | "PRESENCE";

export type CommunicationStyle = {
  mode: CommunicationMode;
  brevity: number; // 0 expansive … 1 concise
  directness: number; // 0 soft … 1 blunt
  technicalDepth: number; // 0 plain … 1 technical
  motivationLevel: number; // 0 neutral … 1 highly motivating
  reflectionTolerance: number; // 0 action-only … 1 reflective
  quoteTolerance: number; // 0 avoid quotes … 1 allow light quotes
  metaphorTolerance: number; // 0 literal … 1 metaphor-tolerant
};

/** Working (non-permanent) profile — updated gradually from repeated signals. */
export type CommunicationProfile = {
  brevity: number;
  directness: number;
  technicalDepth: number;
  motivationLevel: number;
  reflectionTolerance: number;
  quoteTolerance: number;
  metaphorTolerance: number;
  /** Counts of reinforcing signals — one-off must not max a knob. */
  signalCounts: {
    brevity: number;
    directness: number;
    technicalDepth: number;
    motivation: number;
  };
};

export type TurnCommunicationSignals = {
  wantsBrevity: boolean;
  wantsDetail: boolean;
  wantsDirectness: boolean;
  wantsTechnical: boolean;
  wantsMotivation: boolean;
  wantsPresence: boolean;
  wantsPlanOnly: boolean;
  wantsSimpleLanguage: boolean;
  hideStatistics: boolean;
  metaphorHeavy: boolean;
  noSolution: boolean;
  asksWhy: boolean;
  asksChallenge: boolean;
  asksReflect: boolean;
};

export type CommunicationSignals = {
  coachingPreference: CoachingPreference | null;
  asksWhy?: boolean;
  asksChallenge?: boolean;
  asksReflect?: boolean;
  needsPresence?: boolean;
  /** Optional working profile for gradual adaptation. */
  profile?: CommunicationProfile | null;
  /** Current-turn signal overrides. */
  turn?: TurnCommunicationSignals | null;
};

/** Small nudge per reinforcing signal — never jumps to permanent max from one request. */
export const COMMUNICATION_SIGNAL_DELTA = 0.08;
/** Motivation one-offs never write into the working profile. */
export const MIN_REPEATS_FOR_STRONG_ADAPTATION = 3;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createDefaultCommunicationProfile(
  preference: CoachingPreference | null = null,
): CommunicationProfile {
  const base = baseFromPreference(preference);
  return {
    ...base,
    signalCounts: {
      brevity: 0,
      directness: 0,
      technicalDepth: 0,
      motivation: 0,
    },
  };
}

function baseFromPreference(preference: CoachingPreference | null): Omit<CommunicationProfile, "signalCounts"> {
  switch (preference) {
    case "direct":
      return {
        brevity: 0.75,
        directness: 0.9,
        technicalDepth: 0.45,
        motivationLevel: 0.35,
        reflectionTolerance: 0.25,
        quoteTolerance: 0.35,
        metaphorTolerance: 0.3,
      };
    case "encouraging":
      return {
        brevity: 0.45,
        directness: 0.4,
        technicalDepth: 0.35,
        motivationLevel: 0.85,
        reflectionTolerance: 0.45,
        quoteTolerance: 0.5,
        metaphorTolerance: 0.55,
      };
    case "detailed":
      return {
        brevity: 0.2,
        directness: 0.55,
        technicalDepth: 0.85,
        motivationLevel: 0.4,
        reflectionTolerance: 0.55,
        quoteTolerance: 0.45,
        metaphorTolerance: 0.4,
      };
    case "concise":
      return {
        brevity: 0.9,
        directness: 0.7,
        technicalDepth: 0.35,
        motivationLevel: 0.3,
        reflectionTolerance: 0.2,
        quoteTolerance: 0.25,
        metaphorTolerance: 0.25,
      };
    default:
      return {
        brevity: 0.55,
        directness: 0.6,
        technicalDepth: 0.5,
        motivationLevel: 0.5,
        reflectionTolerance: 0.4,
        quoteTolerance: 0.4,
        metaphorTolerance: 0.4,
      };
  }
}

/**
 * Detect turn-level communication intents from user text.
 * Vietnamese + English coverage for Phase 2D live scenarios.
 */
export function detectTurnCommunicationSignals(message: string): TurnCommunicationSignals {
  const lower = message.toLowerCase();

  const wantsBrevity =
    /ngắn thôi|ngắn|gọn|brief|short|concise|đừng giải thích dài|dung giai thich dai|càng gọn|cang gon|plan thôi|plan thoi|keep it short|be brief|short answer/i.test(
      message,
    );

  const wantsDetail =
    /giải thích thật kỹ|giai thich that ky|chi tiết|chi tiet|in depth|really detailed|thật kỹ|that ky/i.test(
      message,
    ) || /riêng câu này.{0,40}(kỹ|ky|chi tiết|detailed)/i.test(message);

  const wantsDirectness =
    /đừng vòng vo|dung vong vo|nói thẳng|noi thang|be direct|no fluff|don't beat around/i.test(message);

  const wantsTechnical =
    /\b(physiology|mechanism|motor-?unit|fatigue|rir|recruitment|technical)\b|sinh lý|sinh ly/i.test(
      message,
    );

  const wantsMotivation =
    /\b(motivational|encourage me|pump me up)\b|động viên|dong vien|(?:^|[^a-z])hype(?:[^a-z]|$)/i.test(
      message,
    );

  const wantsPresence =
    /không muốn advice|khong muon advice|i just want to (talk|say)|no advice|don't (give|offer) advice/i.test(
      message,
    ) ||
    (/chỉ muốn nói|chi muon noi/i.test(message) &&
      !/\b(plan|workout|recovery|sets?|reps?)\b/i.test(message)) ||
    (/hơi xa|hoi xa|not (really )?sad|không buồn hẳn|khong buon han/i.test(message) &&
      /nói ra|noi ra|just (want to )?say|feel/i.test(message));

  const wantsPlanOnly =
    /chỉ cần plan|chi can plan|just (the )?plan|plan only|lên plan|len plan/i.test(message);

  const metaphorHeavy =
    /cánh cửa|canh cua|\bdoor\b|như mình|nhu minh|feels like|as if|standing in front/i.test(message) &&
    !/\b(1\s*rm|sets?|reps?|volume|recovery\s*\d)\b/i.test(lower);

  const noSolution =
    /không cần solution|khong can solution|no solution|don't (fix|solve)|not looking for (a )?solution/i.test(
      message,
    );

  const wantsSimpleLanguage =
    /my english isn['’]?t very good|simple english|explain simply|keep it simple|easy english|no complicated words|tieng anh (?:khong gioi|kem)|noi don gian|giai thich don gian/i.test(
      message,
    );
  const hideStatistics =
    /don['’]?t give me statistics|do not give me statistics|no (?:numbers|statistics|stats)|hide (?:the )?(?:metrics|statistics|stats)|move all (?:the )?statistics away/i.test(
      message,
    );
  const asksWhy = /why|explain|how come|what does .+ mean|giải thích|giai thich|tại sao|tai sao/i.test(
    message,
  ) && !wantsSimpleLanguage;
  const asksChallenge = /\b(push me|challenge me|be harder|hold me accountable)\b/i.test(message);
  const asksReflect = /\b(reflect|how do i feel|what am i noticing)\b/i.test(message);

  return {
    wantsBrevity,
    wantsDetail,
    wantsDirectness,
    wantsTechnical,
    wantsMotivation,
    wantsPresence,
    wantsPlanOnly,
    wantsSimpleLanguage,
    hideStatistics,
    metaphorHeavy,
    noSolution,
    asksWhy,
    asksChallenge,
    asksReflect,
  };
}

/**
 * Gradually update working profile from turn signals.
 * One-off motivation / one-off detail do NOT permanently rewrite knobs.
 */
export function updateCommunicationProfile(
  profile: CommunicationProfile,
  signals: TurnCommunicationSignals,
): { profile: CommunicationProfile; changed: boolean; reasons: string[] } {
  const next: CommunicationProfile = {
    ...profile,
    signalCounts: { ...profile.signalCounts },
  };
  const reasons: string[] = [];

  if (signals.wantsBrevity || signals.wantsPlanOnly) {
    next.signalCounts.brevity += 1;
    const delta =
      next.signalCounts.brevity >= MIN_REPEATS_FOR_STRONG_ADAPTATION
        ? COMMUNICATION_SIGNAL_DELTA
        : COMMUNICATION_SIGNAL_DELTA * 0.5;
    next.brevity = clamp01(next.brevity + delta);
    reasons.push(`Brevity nudged (+${delta}); count=${next.signalCounts.brevity}.`);
  }

  if (signals.wantsDirectness) {
    next.signalCounts.directness += 1;
    const delta =
      next.signalCounts.directness >= MIN_REPEATS_FOR_STRONG_ADAPTATION
        ? COMMUNICATION_SIGNAL_DELTA
        : COMMUNICATION_SIGNAL_DELTA * 0.5;
    next.directness = clamp01(next.directness + delta);
    reasons.push(`Directness nudged (+${delta}).`);
  }

  if (signals.wantsTechnical && !signals.wantsDetail) {
    // Repeated technical asks gradually raise depth; a single "thật kỹ" is temporary only.
    next.signalCounts.technicalDepth += 1;
    if (next.signalCounts.technicalDepth >= 2) {
      next.technicalDepth = clamp01(next.technicalDepth + COMMUNICATION_SIGNAL_DELTA * 0.75);
      reasons.push("Technical depth nudged from repeated technical asks.");
    }
  }

  // Explicit temporary detail / one-off motivation: do NOT write into profile.
  if (signals.wantsDetail) {
    reasons.push("Detail request treated as temporary override only.");
  }
  if (signals.wantsMotivation) {
    reasons.push("Motivation request is one-off; profile motivation unchanged.");
  }
  if (signals.wantsPresence) {
    reasons.push("Presence turn does not alter long-term coaching profile.");
  }

  const changed =
    next.brevity !== profile.brevity ||
    next.directness !== profile.directness ||
    next.technicalDepth !== profile.technicalDepth ||
    next.signalCounts.brevity !== profile.signalCounts.brevity ||
    next.signalCounts.directness !== profile.signalCounts.directness ||
    next.signalCounts.technicalDepth !== profile.signalCounts.technicalDepth;

  return { profile: next, changed, reasons };
}

/** Build working profile from an ordered list of recent user messages. */
export function buildProfileFromRecentMessages(
  messages: string[],
  preference: CoachingPreference | null = null,
): CommunicationProfile {
  let profile = createDefaultCommunicationProfile(preference);
  for (const message of messages) {
    const signals = detectTurnCommunicationSignals(message);
    profile = updateCommunicationProfile(profile, signals).profile;
  }
  return profile;
}

export function resolveCommunicationMode(signals: CommunicationSignals): CommunicationMode {
  const turn = signals.turn ?? null;
  if (signals.needsPresence || turn?.wantsPresence) return "PRESENCE";
  if (turn?.metaphorHeavy && turn.noSolution) return "REFLECT";
  if (signals.asksReflect || turn?.asksReflect) return "REFLECT";
  if (signals.asksChallenge || turn?.asksChallenge) return "CHALLENGE";
  if (signals.asksWhy || turn?.asksWhy || turn?.wantsDetail || turn?.wantsTechnical) return "EXPLAIN";

  switch (signals.coachingPreference) {
    case "detailed":
      return "EXPLAIN";
    case "encouraging":
    case "direct":
    case "concise":
    default:
      return "COACH";
  }
}

export function resolveCommunicationStyle(signals: CommunicationSignals): CommunicationStyle {
  const mode = resolveCommunicationMode(signals);
  const turn = signals.turn;
  const profile = signals.profile ?? createDefaultCommunicationProfile(signals.coachingPreference);

  let brevity = profile.brevity;
  let directness = profile.directness;
  let technicalDepth = profile.technicalDepth;
  let motivationLevel = profile.motivationLevel;
  let reflectionTolerance = profile.reflectionTolerance;
  const quoteTolerance = profile.quoteTolerance;
  let metaphorTolerance = profile.metaphorTolerance;

  // Temporary overrides — do not mutate the stored profile object.
  if (turn?.wantsDetail) {
    brevity = clamp01(Math.min(brevity, 0.35));
    technicalDepth = clamp01(Math.max(technicalDepth, 0.75));
  }
  if (turn?.wantsBrevity || turn?.wantsPlanOnly || turn?.wantsSimpleLanguage) {
    brevity = clamp01(Math.max(brevity, 0.8));
  }
  if (turn?.wantsSimpleLanguage) {
    technicalDepth = clamp01(Math.min(technicalDepth, 0.3));
  }
  if (turn?.wantsDirectness) {
    directness = clamp01(Math.max(directness, 0.85));
  }
  if (turn?.wantsTechnical) {
    technicalDepth = clamp01(Math.max(technicalDepth, 0.7));
  }
  if (turn?.wantsMotivation) {
    motivationLevel = clamp01(Math.max(motivationLevel, 0.75));
  }
  if (turn?.metaphorHeavy) {
    metaphorTolerance = clamp01(Math.max(metaphorTolerance, 0.7));
    reflectionTolerance = clamp01(Math.max(reflectionTolerance, 0.65));
  }

  if (mode === "EXPLAIN") {
    technicalDepth = clamp01(technicalDepth + 0.15);
    reflectionTolerance = clamp01(reflectionTolerance + 0.1);
    if (!turn?.wantsBrevity && !turn?.wantsPlanOnly) {
      brevity = clamp01(brevity - 0.12);
    }
  } else if (mode === "CHALLENGE") {
    directness = clamp01(directness + 0.15);
    motivationLevel = clamp01(motivationLevel + 0.15);
  } else if (mode === "REFLECT") {
    reflectionTolerance = clamp01(reflectionTolerance + 0.3);
    directness = clamp01(directness - 0.15);
  } else if (mode === "PRESENCE") {
    motivationLevel = clamp01(motivationLevel - 0.25);
    directness = clamp01(directness - 0.25);
    technicalDepth = clamp01(technicalDepth - 0.3);
    reflectionTolerance = clamp01(reflectionTolerance + 0.15);
    brevity = clamp01(Math.max(brevity, 0.7));
  }

  return {
    mode,
    brevity,
    directness,
    technicalDepth,
    motivationLevel,
    reflectionTolerance,
    quoteTolerance,
    metaphorTolerance,
  };
}

/**
 * Provenance for communication-preference claims ("you know I like short answers").
 * Stored coachingPreference / working profile brevity is evidence; user assertion alone is not.
 */
export function checkCommunicationPreferenceProvenance(input: {
  message: string;
  coachingPreference: CoachingPreference | null;
  profile: CommunicationProfile | null;
}): { mayClaimKnownPreference: boolean; reason: string } {
  const assertsKnown =
    (/bạn biết|ban biet|you know|as you know|you remember/i.test(input.message) &&
      /ngắn|gon|gọn|short|concise|brief/i.test(input.message)) ||
    (/tôi thích|toi thich|i (like|prefer)/i.test(input.message) &&
      /cực ngắn|cuc ngan|extremely short|very short|ngắn|short|concise/i.test(input.message));

  if (!assertsKnown) {
    return { mayClaimKnownPreference: false, reason: "No remembered-preference claim in message." };
  }

  const hasStored =
    input.coachingPreference === "concise" ||
    input.coachingPreference === "direct" ||
    (input.profile !== null && input.profile.brevity >= 0.7 && input.profile.signalCounts.brevity >= 2);

  if (hasStored) {
    return { mayClaimKnownPreference: true, reason: "Stored concise/direct preference or reinforced working profile exists." };
  }

  return {
    mayClaimKnownPreference: false,
    reason: "User asserted a known short-answer preference without verified stored communication preference.",
  };
}

/** Deterministic prompt hints — no LLM, no psych profiling. Never expose mode as a user-facing label. */
export function buildCommunicationPromptHints(style: CommunicationStyle): string {
  const brevityHint =
    style.brevity >= 0.7
      ? "Keep the reply short."
      : style.brevity <= 0.35
        ? "Allow a fuller explanation."
        : "Keep length moderate.";
  const directHint =
    style.directness >= 0.7 ? "Be direct." : style.directness <= 0.4 ? "Be gentle." : "Be clear and balanced.";
  const techHint =
    style.technicalDepth >= 0.7
      ? "Use precise training terminology where helpful."
      : style.technicalDepth <= 0.4
        ? "Prefer plain language. Short sentences. One action per sentence. No statistics unless asked."
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

  const presenceHint =
    style.mode === "PRESENCE"
      ? "Presence turn: no workout optimization, no numbered framework, no diagnosis, no fake intimacy. Reflect briefly and stop early."
      : style.mode === "REFLECT" && style.metaphorTolerance >= 0.6
        ? "Metaphor-tolerant: acknowledge imagery tentatively; do not diagnose or invent traits."
        : null;

  return [
    // Internal only — models use this; UI must not surface the mode token as a product label.
    `Communication mode: ${style.mode}.`,
    brevityHint,
    directHint,
    techHint,
    motivationHint,
    reflectHint,
    presenceHint,
  ]
    .filter(Boolean)
    .join(" ");
}
