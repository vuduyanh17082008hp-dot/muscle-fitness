import { describe, expect, it } from "vitest"

import { checkSafety } from "@/lib/dante-core/safety-layer"
import { buildContextWorkingSet, activeFacts } from "@/lib/intelligence/performance-core/context-working-set"
import { renderTrainingChangeEnergy, trainingChangeEnergy } from "@/lib/nutrition/training-change-energy"
import { isReduceOnlyChange } from "@/lib/recovery/apply-proposal"
import {
  detectLimitationChoice,
  isLimitationTurn,
  renderLimitationReply,
  reviewLimitation,
  type ReviewInput,
} from "@/lib/recovery/limitation-review"
import { buildLimitationProposal } from "@/lib/recovery/proposal"
import type { TodaySession } from "@/lib/training/load-today-session"

const LOWER = [
  ["se-squat", "Barbell Back Squat", "barbell-back-squat"],
  ["se-rdl", "Romanian Deadlift", "romanian-deadlift"],
  ["se-bss", "Bulgarian Split Squat", "bulgarian-split-squat"],
  ["se-calf", "Standing Calf Raise", "standing-calf-raise"],
  ["se-curl", "Seated Leg Curl", "seated-leg-curl"],
  ["se-ext", "Leg Extension", "leg-extension"],
] as const
const UPPER = [
  ["su-bench", "Barbell Bench Press", "barbell-bench-press"],
  ["su-pulldown", "Lat Pulldown", "lat-pulldown"],
  ["su-pushdown", "Cable Triceps Pushdown", "cable-triceps-pushdown"],
] as const

const rows = (list: ReadonlyArray<readonly [string, string, string]>) => list.map(([id, name, slug]) => ({ sessionExerciseId: id, name, slug, isSkipped: false }))
const SESSION = { kind: "SESSION" as const, sessionId: "s-1", name: "Lower Body", started: false }

function review(overrides: Partial<ReviewInput> = {}) {
  return reviewLimitation({
    limitations: [{ site: "foot", quote: "my foot hurts" }],
    workout: SESSION,
    exercises: rows(LOWER),
    experience: "intermediate",
    constraints: [],
    hold: null,
    userMessages: ["My readiness is 94, but my foot hurts. What should I do about today's workout?"],
    ...overrides,
  })
}

const status = (r: ReturnType<typeof review>, name: string) => r.exercises.find((row) => row.name === name)?.status
const READY = { verified: 95, stated: 94, status: "CURRENT" as const, painFlag: false }

describe("A/F. high readiness + foot pain + lower-body session", () => {
  const r = review()

  it("classifies each planned exercise from its setup", () => {
    expect(status(r, "Barbell Back Squat")).toBe("AFFECTED")
    expect(status(r, "Romanian Deadlift")).toBe("AFFECTED")
    expect(status(r, "Bulgarian Split Squat")).toBe("AFFECTED")
    expect(status(r, "Standing Calf Raise")).toBe("AFFECTED")
    expect(status(r, "Seated Leg Curl")).toBe("REVIEW")
    expect(status(r, "Leg Extension")).toBe("REVIEW")
  })

  it("never offers an alternative that loads the foot, nor one already in the session", () => {
    const offered = r.alternatives.flatMap((entry) => entry.options.map((option) => option.slug))
    expect(offered).not.toContain("leg-press")
    expect(offered).not.toContain("hack-squat")
    expect(offered).not.toContain("single-leg-calf-raise")
    expect(offered).not.toContain("leg-extension")
    expect(offered).not.toContain("seated-leg-curl")
    expect(r.alternatives.find((entry) => entry.forName === "Romanian Deadlift")?.options.map((option) => option.slug)).toContain("lying-leg-curl")
  })

  it("I. says plainly when no suitable substitution exists instead of filling a quota", () => {
    expect(r.alternatives.find((entry) => entry.forName === "Standing Calf Raise")).toMatchObject({ options: [], none: "ALL_LOAD_AREA" })
    expect(r.alternatives.find((entry) => entry.forName === "Barbell Back Squat")).toMatchObject({ options: [], none: "ONLY_ALREADY_PLANNED" })
  })

  it("recommends deferring the foot-loading exercises, offers rest and keep, and asks the safety question", () => {
    expect(r.options).toEqual(["SKIP_AFFECTED", "REST", "KEEP"])
    expect(r.recommended).toBe("SKIP_AFFECTED")
    expect(r.needsClarification).toBe(true)
  })

  it("the reply: readiness doesn't clear the foot, no diagnosis, names today's session, escalation criteria, no 'safe' claim", () => {
    const text = renderLimitationReply({ review: r, readiness: READY, language: "en", proposed: { kind: "SKIP_AFFECTED", summary: "Postpone 4" }, choice: null, energyLine: null })
    expect(text).toMatch(/readiness today is 95/)
    expect(text).toMatch(/you said 94/)
    expect(text).toMatch(/doesn't measure a local problem like foot pain/)
    expect(text).toMatch(/Loads your foot: Barbell Back Squat, Romanian Deadlift, Bulgarian Split Squat and Standing Calf Raise/)
    expect(text).toMatch(/can't tell what's causing/)
    expect(text).toMatch(/^Today's Lower Body: 4 of 6 exercises load your foot/)
    expect(text).toMatch(/can't bear weight/)
    expect(text).toMatch(/Tap Confirm below/)
    expect(text).toMatch(/nothing has changed yet/)
    expect(text).not.toMatch(/\bsafe\b|go hard|push it|high[- ]intensity/i)
    expect(text).not.toMatch(/plantar fasciitis|sprain|fracture|tendin/i)
  })
})

describe("B. red flags escalate before any training advice", () => {
  it.each([
    "My readiness is 94 but I twisted my ankle and I can't put weight on my foot. Should I do legs?",
    "Foot is swollen and I can't put weight on it",
    "I heard a pop in my ankle during my run",
    "Mình không đặt chân xuống được, có nên tập chân không?",
  ])("%s", (message) => {
    const result = checkSafety(message)
    expect(result.triggered).toBe(true)
    expect(result.category).toBe("severe_pain")
    expect(result.responseMode).toBe("HARD_BLOCK")
  })

  it("an ordinary foot ache is not a hard block (it goes to the limitation review)", () => {
    expect(checkSafety("My readiness is 94, but my foot hurts. What should I do about today's workout?").triggered).toBe(false)
    expect(checkSafety("app không dùng được").triggered).toBe(false)
  })
})

describe("C/D. no reported limitation → this flow stays out", () => {
  it("no injury fact for a readiness-only or symptom-free turn", () => {
    for (const message of ["My readiness is 40, should I train today?", "Readiness 94 and I feel great, what should I do today?"]) {
      expect(activeFacts(buildContextWorkingSet({ message })).filter((fact) => fact.kind === "INJURY")).toEqual([])
    }
  })

  it("the context set picks up foot pain in English and Vietnamese, and ends it when resolved", () => {
    expect(activeFacts(buildContextWorkingSet({ message: "my foot hurts, what about my workout?" })).map((fact) => fact.key)).toContain("INJURY:foot")
    expect(activeFacts(buildContextWorkingSet({ message: "Điểm hồi phục 94 nhưng bàn chân bị đau. Hôm nay tập gì?" })).map((fact) => fact.key)).toContain("INJURY:foot")
    const ended = buildContextWorkingSet({ priorUserMessages: ["my foot hurts"], message: "my foot is better now, no longer hurts" })
    expect(activeFacts(ended).filter((fact) => fact.kind === "INJURY")).toEqual([])
  })

  it("only training-today asks and choices enter the flow", () => {
    expect(isLimitationTurn("What should I do about today's workout?")).toBe(true)
    expect(isLimitationTurn("rest today")).toBe(true)
    expect(isLimitationTurn("Hôm nay mình nên tập thế nào?")).toBe(true)
    expect(isLimitationTurn("What should I eat for dinner?")).toBe(false)
    expect(isLimitationTurn("change my calories to 2500")).toBe(false)
  })
})

describe("E. upper-body limitation with lower-body training", () => {
  const r = review({ limitations: [{ site: "wrist", quote: "my wrist hurts" }] })
  it("flags the gripped lifts, clears the leg machines, and swaps toward options without a grip", () => {
    expect(status(r, "Romanian Deadlift")).toBe("AFFECTED")
    expect(status(r, "Bulgarian Split Squat")).toBe("AFFECTED")
    expect(status(r, "Barbell Back Squat")).toBe("REVIEW")
    expect(status(r, "Leg Extension")).toBe("CLEAR")
    expect(status(r, "Standing Calf Raise")).toBe("CLEAR")
    const bss = r.alternatives.find((entry) => entry.forName === "Bulgarian Split Squat")?.options.map((option) => option.slug) ?? []
    expect(bss.length).toBeGreaterThan(0)
    expect(bss).not.toContain("dumbbell-step-up")
  })
})

describe("G. no workout scheduled", () => {
  it("does not fabricate a session or a proposal", () => {
    const r = review({ workout: { kind: "NONE" }, exercises: [] })
    expect(r.options).toEqual([])
    expect(r.recommended).toBeNull()
    const text = renderLimitationReply({ review: r, readiness: READY, language: "en", proposed: null, choice: null, energyLine: null })
    expect(text).toMatch(/no workout scheduled today/)
    expect(text).not.toMatch(/Confirm/)
  })

  it("with no session, 'what can I train?' gets metadata-backed examples that keep load off the area", () => {
    const r = review({ workout: { kind: "NONE" }, exercises: [] })
    expect(r.trainAnyway.length).toBeGreaterThan(0)
    expect(r.trainAnyway).not.toContain("Barbell Back Squat")
    expect(renderLimitationReply({ review: r, readiness: READY, language: "en", proposed: null, choice: null, energyLine: null })).toMatch(/If you want to train anyway, work whose setup keeps load off your foot — for example .* — is an option only if it stays completely pain-free/)
    expect(review({ workout: { kind: "NONE" }, exercises: [], hold: "unverified" }).trainAnyway).toEqual([])
  })

  it("a planned day that isn't started is reviewed read-only (nothing to write)", () => {
    const r = review({ workout: { kind: "PLANNED_DAY", name: "Lower Body" }, exercises: rows(LOWER).map((row) => ({ ...row, sessionExerciseId: null })) })
    expect(r.options).toEqual(["KEEP"])
    expect(r.recommended).toBeNull()
  })
})

describe("H. equipment-limited substitutions", () => {
  it("home equipment removes machine alternatives and says so", () => {
    const gym = review().alternatives.find((entry) => entry.forName === "Romanian Deadlift")
    const home = review({ constraints: ["home_gym"] }).alternatives.find((entry) => entry.forName === "Romanian Deadlift")
    expect(gym?.options.map((option) => option.slug)).toContain("lying-leg-curl")
    expect(home?.options.map((option) => option.slug) ?? []).not.toContain("lying-leg-curl")
  })
})

describe("J/K/L. choices are explicit and resolve against the shown list", () => {
  const r = review()
  it.each([
    ["rest today", "REST"],
    ["ok let's take today off", "REST"],
    ["leave those out", "SKIP_AFFECTED"],
    ["keep my plan as it is", "KEEP"],
    ["option 2", "REST"],
    ["giữ nguyên kế hoạch", "KEEP"],
    ["nghỉ hôm nay", "REST"],
  ])("%s → %s", (message, kind) => {
    expect(detectLimitationChoice(message, r)?.kind).toBe(kind)
  })

  it("a swap is matched only to an alternative the review offered", () => {
    expect(detectLimitationChoice("swap the Romanian Deadlift for Lying Leg Curl", r)).toMatchObject({ kind: "REPLACE", fromSessionExerciseId: "se-rdl", toSlug: "lying-leg-curl" })
    expect(detectLimitationChoice("swap the squat for leg press", r)?.kind).toBe("REPLACE_UNMATCHED")
  })

  it("KEEP writes nothing and says so", () => {
    const text = renderLimitationReply({ review: r, readiness: READY, language: "en", proposed: null, choice: { kind: "KEEP" }, energyLine: null })
    expect(text).toMatch(/nothing was changed/)
  })
})

describe("M. proposals are reduce-only, so they stay applicable under a hold; swaps are not offered under a hold", () => {
  const session: TodaySession = {
    id: "s-1",
    name: "Lower Body",
    scheduledFor: null,
    durationMinutes: null,
    sessionState: "not_started",
    exercises: LOWER.map(([id, name]) => ({ sessionExerciseId: id, exerciseId: `ex-${id}`, exerciseName: name, targetSets: 3, repMin: 8, repMax: 10, restSeconds: 120, primaryMuscle: null, isSkipped: false })),
  }
  it("SKIP_AFFECTED postpones only the named rows; REST postpones all; both are reduce-only", () => {
    const base = { subjectRef: "u-1", session, recoveryStateRef: "rs", safetyEvaluationRef: "limitation:foot_ankle", evidenceRefs: [], createdAt: "2026-11-02T10:00:00.000Z" }
    const skip = buildLimitationProposal({ ...base, mode: "SKIP_AFFECTED", affectedSessionExerciseIds: ["se-squat", "se-calf"] })
    expect(skip.changes.filter((change) => change.action !== "KEEP").map((change) => change.sessionExerciseId)).toEqual(["se-squat", "se-calf"])
    const rest = buildLimitationProposal({ ...base, mode: "REST", affectedSessionExerciseIds: [] })
    expect(rest.changes.every((change) => change.action === "REST" && change.after?.isSkipped)).toBe(true)
    expect([...skip.changes, ...rest.changes].filter((change) => change.action !== "KEEP").every(isReduceOnlyChange)).toBe(true)
    // P. the same state gives the same id (idempotent issuance); a different choice is a different proposal.
    expect(buildLimitationProposal({ ...base, mode: "REST", affectedSessionExerciseIds: [] }).proposalId).toBe(rest.proposalId)
    expect(skip.proposalId).not.toBe(rest.proposalId)
  })

  it("under a hold the recommendation is rest and swaps are reference only", () => {
    const held = review({ hold: "recovery" })
    expect(held.recommended).toBe("REST")
    const text = renderLimitationReply({ review: held, readiness: { ...READY, painFlag: true }, language: "en", proposed: null, choice: null, energyLine: null })
    expect(text).toMatch(/training is on hold/)
    expect(text).toMatch(/reference only/)
    expect(text).not.toMatch(/swap <exercise>/)
  })
})

describe("N/O. nutrition: no automatic cut; only the weight-trend calibration may change the target", () => {
  const plan = { target: { calories: 2650, protein: 144, carbs: 330, fat: 80 }, maintenanceCalories: 2465, input: { activityLevel: "moderate" } } as never
  it("a rest day keeps the target and explains why", () => {
    const energy = trainingChangeEnergy({ plan, calibration: null })
    expect(energy.decision).toBe("KEEP")
    const text = renderTrainingChangeEnergy(energy, "REST", "en")
    expect(text).toMatch(/doesn't call for eating less/)
    expect(text).toMatch(/2650 kcal/)
    expect(text).not.toMatch(/-\s?(?:250|500)|deficit/)
  })

  it("insufficient data never yields a number of its own", () => {
    const energy = trainingChangeEnergy({ plan, calibration: { status: "insufficient_data", message: "Not enough weigh-ins yet", trend: null, intake: { loggedDays: 0, windowDays: 14, averageCalories: null } } })
    expect(energy).toMatchObject({ decision: "KEEP", calibration: null })
  })

  it("an existing calibration proposal is shown old → new and left to the user's Accept", () => {
    const energy = trainingChangeEnergy({
      plan,
      calibration: { status: "propose", message: "m", trend: {} as never, intake: {} as never, currentTargetCalories: 2650, proposedTargetCalories: 2400, deltaKcal: -250, uncertainty: null },
    })
    expect(energy.decision).toBe("CALIBRATION_AVAILABLE")
    expect(renderTrainingChangeEnergy(energy, "REST", "en")).toMatch(/2650 → 2400 kcal \(-250 kcal\/day\).*tap Accept there/)
  })

  it("an unreadable plan is said to be unknown", () => {
    expect(renderTrainingChangeEnergy(trainingChangeEnergy({ plan: null, calibration: null, readFailed: true }), "REST", "en")).toMatch(/couldn't read your nutrition plan/)
  })
})

describe("R. corrections and Vietnamese", () => {
  it("'not my foot, it's my wrist' moves the limitation", () => {
    const set = buildContextWorkingSet({ priorUserMessages: ["my foot hurts"], message: "sorry, not my foot, it's my wrist" })
    const keys = activeFacts(set).filter((fact) => fact.kind === "INJURY").map((fact) => fact.key)
    expect(keys).toContain("INJURY:wrist")
    expect(keys).not.toContain("INJURY:foot")
  })

  it("renders in Vietnamese", () => {
    const text = renderLimitationReply({ review: review(), readiness: READY, language: "vi", proposed: { kind: "SKIP_AFFECTED", summary: "Hoãn 4 bài" }, choice: null, energyLine: null })
    expect(text).toMatch(/Điểm hồi phục hôm nay của bạn là 95/)
    expect(text).toMatch(/^Buổi Lower Body hôm nay: 4\/6 bài dồn lực lên bàn chân/)
    expect(text).toMatch(/Bấm Xác nhận/)
  })

  it("an unmapped site is not guessed onto exercises", () => {
    const r = review({ limitations: [{ site: "groin", quote: "groin hurts" }] })
    expect(r.mappedRegions).toEqual([])
    expect(r.exercises.every((row) => row.status === "UNKNOWN")).toBe(true)
    expect(r.recommended).toBe("REST")
  })
})

describe("P. an already-adjusted session gets no stacked proposal", () => {
  it("offers only KEEP and says what is already postponed", () => {
    const r = review({ alreadyAdjusted: true, exercises: rows(LOWER).map((row, index) => ({ ...row, isSkipped: index < 4 })) })
    expect(r.options).toEqual(["KEEP"])
    expect(r.recommended).toBeNull()
    const text = renderLimitationReply({ review: r, readiness: READY, language: "en", proposed: null, choice: null, energyLine: null })
    expect(text).toMatch(/^Today's Lower Body has already been adjusted: Barbell Back Squat, Romanian Deadlift, Bulgarian Split Squat and Standing Calf Raise are postponed\. I won't stack another change on it\./)
    expect(text).not.toMatch(/Confirm/)
  })
})

describe("upper session with a foot limitation keeps most of the session", () => {
  it("only the standing exercise is affected", () => {
    const r = review({ exercises: rows(UPPER), workout: { ...SESSION, name: "Upper Body" } })
    expect(status(r, "Cable Triceps Pushdown")).toBe("AFFECTED")
    expect(status(r, "Barbell Bench Press")).toBe("REVIEW")
    expect(status(r, "Lat Pulldown")).toBe("CLEAR")
    expect(r.recommended).toBe("SKIP_AFFECTED")
  })
})
