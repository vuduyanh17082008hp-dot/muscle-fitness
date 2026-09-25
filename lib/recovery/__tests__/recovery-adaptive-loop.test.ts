import { describe, expect, it } from "vitest"

import { computeRecoveryScore } from "@/lib/recovery/score"
import { deriveRecoveryState } from "@/lib/recovery/recovery-state"
import { generateWorkoutAdjustmentProposal, proposalMutatesWorkout } from "@/lib/recovery/proposal"
import { deriveWorkoutSafetyScope } from "@/lib/recovery/workout-safety-scope"
import {
  applyWorkoutAdjustment,
  createMemoryMutationStore,
  type OwnedSession,
  type SessionWriter,
} from "@/lib/recovery/apply-proposal"
import type { RecoveryCheckinInput, RecoveryCheckinRow } from "@/lib/recovery/types"
import type { TodaySession, TodaySessionExercise } from "@/lib/training/load-today-session"

function checkinInput(overrides: Partial<RecoveryCheckinInput> = {}): RecoveryCheckinInput {
  return {
    sleepHours: 8,
    sleepQuality: 8,
    stress: 3,
    fatigue: 3,
    soreness: 3,
    mood: 8,
    readiness: 8,
    restingHr: null,
    steps: null,
    painIllness: "no",
    notes: null,
    ...overrides,
  }
}

function checkinRow(overrides: Partial<RecoveryCheckinRow> = {}): RecoveryCheckinRow {
  return {
    id: "checkin-1",
    user_id: "user-a",
    checkin_date: "2026-09-25",
    sleep_hours: 8,
    sleep_quality: 8,
    stress: 3,
    fatigue: 3,
    soreness: 3,
    mood: 8,
    readiness: 8,
    resting_hr: null,
    steps: null,
    pain_illness: "no",
    notes: null,
    recovery_score: 80,
    score_breakdown: null,
    created_at: "2026-09-25T00:00:00.000Z",
    updated_at: "2026-09-25T00:00:00.000Z",
    ...overrides,
  }
}

function exercise(overrides: Partial<TodaySessionExercise> = {}): TodaySessionExercise {
  return {
    sessionExerciseId: "se-bench",
    exerciseId: "ex-bench",
    exerciseName: "Bench Press",
    targetSets: 4,
    repMin: 6,
    repMax: 8,
    restSeconds: 90,
    primaryMuscle: "chest",
    isSkipped: false,
    ...overrides,
  }
}

function session(exercises: TodaySessionExercise[]): TodaySession {
  return {
    id: "session-1",
    name: "Today",
    scheduledFor: "2026-09-25T09:00:00.000Z",
    durationMinutes: 60,
    sessionState: "not_started",
    workoutPlanId: "plan-1",
    updatedAt: "2026-09-25T00:00:00.000Z",
    planUpdatedAt: "2026-09-20T00:00:00.000Z",
    exercises,
  }
}

function proposalFor(input: {
  checkin?: RecoveryCheckinInput
  row?: RecoveryCheckinRow | null
  session: TodaySession | null
}) {
  const score = computeRecoveryScore(input.checkin ?? checkinInput())
  const row = input.row === undefined ? checkinRow() : input.row
  const safety = deriveWorkoutSafetyScope({
    painIllness: input.checkin?.painIllness ?? row?.pain_illness ?? "no",
    notes: input.checkin?.notes ?? row?.notes ?? null,
  })
  const recoveryState = deriveRecoveryState({
    subjectRef: "user-a",
    checkin: row,
    scoreResult: score,
    bodyAreaRefs: safety.affectedBodyAreaRefs,
    constraintRefs: safety.constraintRefs,
  })
  return generateWorkoutAdjustmentProposal({
    subjectRef: "user-a",
    recoveryState,
    safetyScope: safety,
    session: input.session,
    createdAt: "2026-09-25T01:00:00.000Z",
  })
}

function memorySessions(initial: OwnedSession): SessionWriter & { current: OwnedSession } {
  const store = { current: structuredClone(initial) }
  return {
    get current() {
      return store.current
    },
    async loadOwnedSession(userId, workoutRef) {
      if (store.current.userId !== userId || store.current.id !== workoutRef) return null
      return structuredClone(store.current)
    },
    async applyPatches(userId, workoutRef, patches) {
      if (store.current.userId !== userId || store.current.id !== workoutRef) {
        throw new Error("missing")
      }
      store.current = {
        ...store.current,
        updatedAt: "2026-09-25T02:00:00.000Z",
        exercises: store.current.exercises.map((item) => {
          const patch = patches.find((entry) => entry.sessionExerciseId === item.sessionExerciseId)
          if (!patch) return item
          return {
            ...item,
            targetSets: patch.after.targetSets,
            repMin: patch.after.repMin,
            repMax: patch.after.repMax,
            isSkipped: patch.after.isSkipped,
          }
        }),
      }
      return structuredClone(store.current)
    },
  }
}

describe("R-A normal recovery", () => {
  it("keeps a normal upper-body session", () => {
    const proposal = proposalFor({ session: session([exercise()]) })
    expect(proposal.status).toBe("NO_CHANGE")
    expect(proposalMutatesWorkout(proposal)).toBe(false)
  })
})

describe("R-B low recovery", () => {
  it("generates a structured reduction from score evidence", () => {
    const proposal = proposalFor({
      checkin: checkinInput({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 9,
        mood: 2,
        readiness: 2,
      }),
      session: session([exercise({ targetSets: 4 })]),
    })
    expect(["MINOR_ADJUSTMENT", "MODERATE_ADJUSTMENT"]).toContain(proposal.status)
    expect(proposal.changes[0]?.action).toBe("REDUCE_SETS")
    expect(proposal.changes[0]?.after?.targetSets).toBe(3)
    expect(proposal.evidenceRefs.some((ref) => ref.includes("computeRecoveryScore"))).toBe(true)
  })
})

describe("R-C missing recovery", () => {
  it("does not fabricate a mutation", () => {
    const proposal = proposalFor({
      checkin: {
        sleepHours: null,
        sleepQuality: null,
        stress: null,
        fatigue: null,
        soreness: null,
        mood: null,
        readiness: null,
        restingHr: null,
        steps: null,
        painIllness: "no",
        notes: null,
      },
      row: null,
      session: session([exercise()]),
    })
    expect(proposal.decisionState).toBe("INSUFFICIENT_INFORMATION")
    expect(proposalMutatesWorkout(proposal)).toBe(false)
  })
})

describe("R-D knee + upper body", () => {
  it("does not lock the unrelated lift", () => {
    const proposal = proposalFor({
      checkin: checkinInput({
        painIllness: "minor",
        notes: "My knees feel a bit weird today",
      }),
      row: checkinRow({ pain_illness: "minor", notes: "My knees feel a bit weird today" }),
      session: session([exercise()]),
    })
    expect(proposal.changes[0]?.action).toBe("KEEP")
    expect(proposalMutatesWorkout(proposal)).toBe(false)
  })
})

describe("R-E knee + max squat", () => {
  it("constrains the squat only", () => {
    const proposal = proposalFor({
      checkin: checkinInput({
        painIllness: "minor",
        notes: "My knees feel a bit weird today",
      }),
      row: checkinRow({ pain_illness: "minor", notes: "My knees feel a bit weird today" }),
      session: session([
        exercise({
          sessionExerciseId: "se-squat",
          exerciseId: "ex-squat",
          exerciseName: "Back Squat",
          primaryMuscle: "quads",
          targetSets: 4,
        }),
        exercise(),
      ]),
    })
    const squat = proposal.changes.find((change) => change.exerciseName === "Back Squat")
    const bench = proposal.changes.find((change) => change.exerciseName === "Bench Press")
    expect(squat?.action).toBe("REDUCE_SETS")
    expect(bench?.action).toBe("KEEP")
  })
})

describe("R-F emergency", () => {
  it("dominates the session when chest-pain language is current", () => {
    const proposal = proposalFor({
      checkin: checkinInput({ notes: "I've had chest pain since my last set of bench press." }),
      row: checkinRow({ notes: "I've had chest pain since my last set of bench press." }),
      session: session([exercise()]),
    })
    expect(proposal.status).toBe("REST_RECOMMENDED")
    expect(proposal.changes[0]?.action).toBe("REST")
  })
})

describe("R-G/H apply idempotency", () => {
  it("applies once and ignores the second confirm", async () => {
    const today = session([
      exercise({
        sessionExerciseId: "se-squat",
        exerciseName: "Back Squat",
        primaryMuscle: "quads",
        targetSets: 4,
      }),
    ])
    const proposal = proposalFor({
      checkin: checkinInput({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 9,
        mood: 2,
        readiness: 2,
      }),
      session: today,
    })
    const sessions = memorySessions({ ...today, userId: "user-a" })
    const mutations = createMemoryMutationStore()

    const first = await applyWorkoutAdjustment({
      actorUserId: "user-a",
      proposal,
      now: new Date("2026-09-25T03:00:00.000Z"),
      sessions,
      mutations,
    })
    const second = await applyWorkoutAdjustment({
      actorUserId: "user-a",
      proposal,
      now: new Date("2026-09-25T03:01:00.000Z"),
      sessions,
      mutations,
    })

    expect(first.ok).toBe(true)
    if (first.ok) expect(first.alreadyApplied).toBe(false)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.alreadyApplied).toBe(true)
    expect(sessions.current.exercises[0]?.targetSets).toBe(3)
    expect(mutations.records).toHaveLength(1)
  })
})

describe("R-I stale plan", () => {
  it("rejects apply after an external plan change", async () => {
    const today = session([exercise({ targetSets: 4 })])
    const proposal = proposalFor({
      checkin: checkinInput({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 9,
        mood: 2,
        readiness: 2,
      }),
      session: today,
    })
    const sessions = memorySessions({
      ...today,
      userId: "user-a",
      updatedAt: "2026-09-25T04:00:00.000Z",
      exercises: [{ ...today.exercises[0], targetSets: 5 }],
    })
    const result = await applyWorkoutAdjustment({
      actorUserId: "user-a",
      proposal,
      sessions,
      mutations: createMemoryMutationStore(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("STALE_PLAN")
  })
})

describe("R-J ownership", () => {
  it("denies user B applying user A proposal", async () => {
    const today = session([exercise({ targetSets: 4 })])
    const proposal = proposalFor({
      checkin: checkinInput({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 9,
        mood: 2,
        readiness: 2,
      }),
      session: today,
    })
    const result = await applyWorkoutAdjustment({
      actorUserId: "user-b",
      proposal,
      sessions: memorySessions({ ...today, userId: "user-a" }),
      mutations: createMemoryMutationStore(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("FORBIDDEN")
  })
})

describe("R-K/L preview and keep original", () => {
  it("generation does not mutate the session", () => {
    const today = session([exercise({ targetSets: 4 })])
    const before = structuredClone(today)
    proposalFor({
      checkin: checkinInput({
        sleepHours: 4,
        sleepQuality: 2,
        stress: 9,
        fatigue: 9,
        soreness: 9,
        mood: 2,
        readiness: 2,
      }),
      session: today,
    })
    expect(today).toEqual(before)
  })
})

describe("free-text notes", () => {
  it("does not upgrade uncertain knee language into an injury fact", () => {
    const scope = deriveWorkoutSafetyScope({
      painIllness: "no",
      notes: "My knees feel a bit weird today",
    })
    expect(scope.emergency).toBe(false)
    expect(scope.noteProvenance).toBe("USER_UNCERTAIN_RECALL")
    expect(scope.affectedBodyAreaRefs).toContain("KNEE")
  })
})
