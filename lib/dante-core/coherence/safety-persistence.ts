/**
 * P-21 — scoped safety persistence.
 * PERSIST keeps the episode available. It does not lock the whole conversation.
 */

import { classifyRequestScope } from "@/lib/dante-core/coherence/safety-scope";
import { isActivePhase } from "@/lib/dante-core/coherence/safety-evidence";
import type { SafetyFollowUp, SafetyPhase, VersionedState } from "@/lib/dante-core/coherence/types";

export type AffectedDomain = "TRAINING" | "NUTRITION" | "GENERAL";
export type AffectedBodyArea = "KNEE" | "SHOULDER" | "CHEST" | "SYSTEMIC" | "UNKNOWN";
export type PersistedSafetyMode = "DOMINATE" | "CONSTRAIN" | "IGNORE";

export type PersistedSafetyScope = {
  safetyIssueId: string;
  affectedDomain: AffectedDomain;
  affectedBodyArea: AffectedBodyArea;
  affectedActivity: string | null;
  relevantConstraints: string[];
  lifecycleState: SafetyPhase;
};

const EMERGENCY = new Set([
  "chest_pain_cardiac",
  "fainting_dizziness",
  "neurological_symptoms",
  "severe_pain",
  "self_harm_crisis",
  "eating_disorder_indicator",
  "dangerous_substance",
  "ambiguous_safety",
]);

const NUTRITION = /\b(?:eat|eating|food|meal|nutrition|calories|protein|macro|an uong|bua an|ăn uống)\b/i;
const MAX_ATTEMPT = /\b(?:max(?: out)?|1\s*rm|pr|pb|personal record)\b/i;

function bodyAreaOf(category: string | null, topics: readonly string[]): AffectedBodyArea {
  if (category === "chest_pain_cardiac") return "CHEST";
  if (category && EMERGENCY.has(category)) return "SYSTEMIC";
  if (topics.some((t) => /knee/.test(t))) return "KNEE";
  if (topics.some((t) => /shoulder|vai/.test(t))) return "SHOULDER";
  return "UNKNOWN";
}

function activityOf(area: AffectedBodyArea): string | null {
  if (area === "KNEE") return "squat";
  if (area === "SHOULDER") return "overhead";
  if (area === "CHEST") return "pressing";
  return null;
}

function hitsArea(message: string, area: AffectedBodyArea): boolean {
  if (area === "KNEE") return /\b(?:knee|squat|goi|đầu gối)\b/i.test(message);
  if (area === "SHOULDER") return /\b(?:shoulder|overhead|ohp|vai)\b/i.test(message);
  if (area === "CHEST") return /\b(?:chest pain|đau ngực|dau nguc)\b/i.test(message);
  return false;
}

export function derivePersistedSafetyScope(snapshot: VersionedState): PersistedSafetyScope | null {
  const { phase, category, turnRef } = snapshot.safety;
  if (!category && !isActivePhase(phase)) return null;
  const area = bodyAreaOf(category, snapshot.topicStack);
  const emergency = category != null && EMERGENCY.has(category);
  return {
    safetyIssueId: `${category ?? "unknown"}:${turnRef ?? "open"}`,
    affectedDomain: emergency ? "GENERAL" : "TRAINING",
    affectedBodyArea: area,
    affectedActivity: activityOf(area),
    relevantConstraints: area === "KNEE"
      ? ["avoid_pain_reproducing_knee_load"]
      : area === "SHOULDER"
        ? ["avoid_pain_reproducing_shoulder_load"]
        : ["keep_affected_area_conservative"],
    lifecycleState: phase,
  };
}

export function resolvePersistedSafetyApplication(input: {
  message: string;
  snapshot: VersionedState;
  followUp?: SafetyFollowUp | null;
  safetyPhase?: SafetyPhase;
}): { mode: PersistedSafetyMode; scope: PersistedSafetyScope | null } {
  const scope = derivePersistedSafetyScope(input.snapshot);
  const phase = input.safetyPhase ?? input.snapshot.safety.phase;
  if (!scope || !isActivePhase(phase)) return { mode: "IGNORE", scope };

  const category = input.snapshot.safety.category;
  const emergency = category != null && EMERGENCY.has(category);
  const aboutSymptom = input.followUp === "unchanged" || input.followUp === "worse";
  const nutrition = NUTRITION.test(input.message);
  const training = classifyRequestScope({
    sourceSpan: { start: 0, end: input.message.length, text: input.message },
    payload: { reason: "p21", normalized: input.message },
  }) === "TRAINING";
  const areaHit = hitsArea(input.message, scope.affectedBodyArea);

  if (emergency && (aboutSymptom || phase === "ESCALATE" || (training && !nutrition))) {
    return { mode: "DOMINATE", scope };
  }
  if (nutrition && !areaHit && !aboutSymptom) return { mode: "IGNORE", scope };
  if (training || aboutSymptom || areaHit) return { mode: "CONSTRAIN", scope };
  return { mode: "IGNORE", scope };
}

export function applyPersistedSafetyConstraint(input: {
  draft: string;
  message: string;
  language: "en" | "vi";
  scope: PersistedSafetyScope;
}): string {
  const draft = input.draft.trim();
  const already = /knee|gối|goi|shoulder|vai|train around|reproduce the pain|stresses the knee|irritated area/i.test(draft);
  if (already) return input.draft;
  const strong = MAX_ATTEMPT.test(input.message) && Boolean(input.scope.affectedActivity);
  const area = input.scope.affectedBodyArea === "KNEE"
    ? (input.language === "vi" ? "gối" : "knee")
    : input.scope.affectedBodyArea === "SHOULDER"
      ? (input.language === "vi" ? "vai" : "shoulder")
      : (input.language === "vi" ? "vùng đang đau" : "affected area");
  const note = input.language === "vi"
    ? (strong
      ? `Đừng max ${input.scope.affectedActivity ?? "động tác đó"} hôm nay khi ${area} vẫn chưa ổn.`
      : `Giữ phần nào nhấn ${area} ở mức thận trọng đến khi đỡ; bỏ hoặc đổi động tác nào làm đau lại, còn lại tập bình thường.`)
    : (strong
      ? `Don't max ${input.scope.affectedActivity ?? "that lift"} today while the ${area} is still an issue.`
      : `Keep anything that stresses the ${area} conservative until it settles. Skip or modify movements that reproduce the pain; otherwise continue with the rest of the session.`);
  return draft ? `${draft} ${note}` : note;
}
