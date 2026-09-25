import { checkSafety } from "@/lib/dante-core/safety-layer"
import type { PersistedSafetyScope } from "@/lib/dante-core/coherence/safety-persistence"
import type { SafetyPhase } from "@/lib/dante-core/coherence/types"
import type { PainIllness } from "@/lib/recovery/types"

export type WorkoutSafetyBodyArea = "KNEE" | "SHOULDER" | "CHEST" | "SYSTEMIC" | "UNKNOWN"

export type CurrentSafetyScope = {
  safetyEvaluationRef: string
  affectedDomains: string[]
  affectedBodyAreaRefs: WorkoutSafetyBodyArea[]
  affectedActivityRefs: string[]
  constraintRefs: string[]
  lifecycleState: SafetyPhase
  emergency: boolean
  /**
   * Mentions taken from free text stay INFERRED. Structured pain_illness
   * is USER_EXPLICIT. Uncertain notes never become injury/severity facts.
   */
  noteProvenance: "NONE" | "USER_EXPLICIT" | "USER_UNCERTAIN_RECALL" | "INFERRED"
}

const EMERGENCY_CATEGORIES = new Set([
  "chest_pain_cardiac",
  "fainting_dizziness",
  "neurological_symptoms",
  "severe_pain",
  "self_harm_crisis",
  "eating_disorder_indicator",
  "dangerous_substance",
])

const AREA_PATTERNS: Array<{ area: WorkoutSafetyBodyArea; pattern: RegExp; activity: string }> = [
  { area: "KNEE", pattern: /\b(?:knee|knees|goi|gối|đầu gối|dau goi)\b/i, activity: "squat" },
  { area: "SHOULDER", pattern: /\b(?:shoulder|shoulders|vai|overhead)\b/i, activity: "overhead" },
  { area: "CHEST", pattern: /\b(?:chest pain|đau ngực|dau nguc)\b/i, activity: "pressing" },
]

export function mentionsBodyArea(text: string, area: WorkoutSafetyBodyArea): boolean {
  if (area === "SYSTEMIC") return true
  const found = AREA_PATTERNS.find((item) => item.area === area)
  return found ? found.pattern.test(text) : false
}

export function exerciseHitsArea(input: {
  exerciseName: string
  primaryMuscle: string | null
  area: WorkoutSafetyBodyArea
}): boolean {
  const haystack = `${input.exerciseName} ${input.primaryMuscle ?? ""}`.toLowerCase()
  if (input.area === "SYSTEMIC") return true
  if (input.area === "KNEE") {
    return /squat|lunge|leg press|leg extension|hack squat|step.?up|split squat|quad|glute|hamstring|knee/.test(
      haystack,
    )
  }
  if (input.area === "SHOULDER") {
    return /shoulder|overhead|ohp|press|delt|raise/.test(haystack)
  }
  if (input.area === "CHEST") {
    return /bench|chest|press|fly|pec/.test(haystack)
  }
  return false
}

/**
 * Scoped safety for today's workout adjustment. Reuses P-21 area/activity
 * language. PERSIST means the context stays available — not a global lock.
 */
export function deriveWorkoutSafetyScope(input: {
  painIllness: PainIllness
  notes: string | null
  persisted?: PersistedSafetyScope | null
}): CurrentSafetyScope {
  const notes = input.notes?.trim() ?? ""
  const safety = notes ? checkSafety(notes) : null
  const emergency =
    Boolean(safety?.triggered && safety.category && EMERGENCY_CATEGORIES.has(safety.category)) ||
    input.persisted?.affectedBodyArea === "SYSTEMIC" ||
    input.persisted?.affectedBodyArea === "CHEST"

  const areas = new Set<WorkoutSafetyBodyArea>()
  const activities = new Set<string>()
  const constraints = new Set<string>()

  let noteProvenance: CurrentSafetyScope["noteProvenance"] = "NONE"
  if (notes) {
    const confident = /\b(?:sharp|severe|injury|unstable|instability|recurring|torn|broke)\b/i.test(notes)
    noteProvenance = confident ? "USER_EXPLICIT" : "USER_UNCERTAIN_RECALL"
    for (const item of AREA_PATTERNS) {
      if (item.pattern.test(notes)) {
        areas.add(item.area)
        activities.add(item.activity)
        constraints.add(`keep_${item.area.toLowerCase()}_conservative`)
      }
    }
    if (areas.size === 0 && noteProvenance === "USER_UNCERTAIN_RECALL") {
      noteProvenance = "INFERRED"
    }
  }

  if (input.painIllness === "yes" || input.painIllness === "minor") {
    constraints.add("respect_structured_pain_illness")
  }

  if (input.persisted) {
    areas.add(input.persisted.affectedBodyArea)
    if (input.persisted.affectedActivity) activities.add(input.persisted.affectedActivity)
    for (const constraint of input.persisted.relevantConstraints) constraints.add(constraint)
  }

  if (emergency) {
    areas.add(safety?.category === "chest_pain_cardiac" ? "CHEST" : "SYSTEMIC")
    constraints.add("emergency_dominates")
  }

  const lifecycleState: SafetyPhase = emergency
    ? "ESCALATE"
    : areas.size > 0 || constraints.size > 0
      ? input.persisted?.lifecycleState ?? "ENTER"
      : "NONE"

  return {
    safetyEvaluationRef: emergency
      ? `safety:${safety?.category ?? "emergency"}`
      : areas.size > 0
        ? `safety:${[...areas].join("+")}`
        : "safety:none",
    affectedDomains: emergency ? ["GENERAL", "TRAINING"] : areas.size > 0 ? ["TRAINING"] : [],
    affectedBodyAreaRefs: [...areas],
    affectedActivityRefs: [...activities],
    constraintRefs: [...constraints],
    lifecycleState,
    emergency,
    noteProvenance,
  }
}
