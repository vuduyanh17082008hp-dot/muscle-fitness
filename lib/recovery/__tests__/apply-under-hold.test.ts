import { describe, expect, it } from "vitest"

import { computeRecoveryScore } from "@/lib/recovery/score"
import { deriveRecoveryState } from "@/lib/recovery/recovery-state"
import { generateWorkoutAdjustmentProposal, type WorkoutAdjustmentProposal, type WorkoutChange } from "@/lib/recovery/proposal"
import { deriveWorkoutSafetyScope } from "@/lib/recovery/workout-safety-scope"
import {
  applyWorkoutAdjustment,
  createMemoryMutationStore,
  createMemoryProposalStore,
  isReduceOnlyChange,
  type OwnedSession,
  type SessionWriter,
} from "@/lib/recovery/apply-proposal"
import type { RecoveryCheckinRow } from "@/lib/recovery/types"
import type { TodaySession } from "@/lib/training/load-today-session"

/**
 * QA-02 (hackathon demo policy): with a training hold active at apply time, only a change that verifiably reduces or
 * rests today's session may be applied; anything that could add training — REPLACE, un-skipping, more sets/reps, or an
 * unknown baseline — is rejected with HOLD_ACTIVE and nothing is written. Without a hold, apply is unchanged.
 */

const NOW = new Date("2026-09-25T03:00:00.000Z")

const today: TodaySession = {
  id: "session-1",
  name: "Today",
  scheduledFor: "2026-09-25T09:00:00.000Z",
  durationMinutes: 60,
  sessionState: "not_started",
  workoutPlanId: "plan-1",
  updatedAt: "2026-09-25T00:00:00.000Z",
  planUpdatedAt: "2026-09-20T00:00:00.000Z",
  exercises: [
    { sessionExerciseId: "se-bench", exerciseId: "ex-bench", exerciseName: "Bench Press", targetSets: 4, repMin: 6, repMax: 8, restSeconds: 90, primaryMuscle: "chest", isSkipped: false },
  ],
}

const row: RecoveryCheckinRow = {
  id: "checkin-1", user_id: "user-a", checkin_date: "2026-09-25", sleep_hours: 4, sleep_quality: 2, stress: 9, fatigue: 9,
  soreness: 9, mood: 2, readiness: 2, resting_hr: null, steps: null, pain_illness: "no", notes: null, recovery_score: 20,
  score_breakdown: null, created_at: "2026-09-25T00:00:00.000Z", updated_at: "2026-09-25T00:00:00.000Z",
}

function lowReadinessProposal(): WorkoutAdjustmentProposal {
  const score = computeRecoveryScore({ sleepHours: 4, sleepQuality: 2, stress: 9, fatigue: 9, soreness: 9, mood: 2, readiness: 2, restingHr: null, steps: null, painIllness: "no", notes: null })
  const safety = deriveWorkoutSafetyScope({ painIllness: "no", notes: null })
  const recoveryState = deriveRecoveryState({ subjectRef: "user-a", checkin: row, scoreResult: score, bodyAreaRefs: safety.affectedBodyAreaRefs, constraintRefs: safety.constraintRefs })
  return generateWorkoutAdjustmentProposal({ subjectRef: "user-a", recoveryState, safetyScope: safety, session: today, createdAt: "2026-09-25T01:00:00.000Z" })
}

function sessions(): SessionWriter & { current: OwnedSession } {
  const store = { current: { ...structuredClone(today), userId: "user-a" } as OwnedSession }
  return {
    get current() { return store.current },
    async loadOwnedSession(userId, ref) { return store.current.userId === userId && store.current.id === ref ? structuredClone(store.current) : null },
    async replaceOwnedSession(session) { store.current = structuredClone(session) },
    async applyPatches(_userId, _ref, patches) {
      store.current = {
        ...store.current,
        updatedAt: "2026-09-25T02:00:00.000Z",
        exercises: store.current.exercises.map((item) => {
          const patch = patches.find((p) => p.sessionExerciseId === item.sessionExerciseId)
          return patch ? { ...item, targetSets: patch.after.targetSets, repMin: patch.after.repMin, repMax: patch.after.repMax, isSkipped: patch.after.isSkipped } : item
        }),
      }
      return structuredClone(store.current)
    },
  }
}

function withChange(proposal: WorkoutAdjustmentProposal, edit: (change: WorkoutChange) => WorkoutChange): WorkoutAdjustmentProposal {
  return { ...proposal, proposalId: `${proposal.proposalId}-x`, changes: proposal.changes.map((c) => (c.action === "KEEP" ? c : edit(c))) }
}

async function apply(proposal: WorkoutAdjustmentProposal, trainingHold: "recovery" | "unverified" | null) {
  const writer = sessions()
  const mutations = createMemoryMutationStore()
  const result = await applyWorkoutAdjustment({ actorUserId: "user-a", proposalId: proposal.proposalId, now: NOW, sessions: writer, mutations, proposals: createMemoryProposalStore([proposal]), trainingHold })
  return { result, writer, mutations }
}

describe("QA-02 apply re-validates the training hold", () => {
  const base = lowReadinessProposal()
  const reducing = base.changes.find((c) => c.action !== "KEEP")!

  it("the engine's own low-readiness proposal is reduce-only", () => {
    expect(reducing.action).toBe("REDUCE_SETS")
    expect(isReduceOnlyChange(reducing)).toBe(true)
  })

  it.each(["recovery", "unverified"] as const)("hold=%s: a verified reduction may be applied", async (hold) => {
    const { result, writer } = await apply(base, hold)
    expect(result.ok).toBe(true)
    expect(writer.current.exercises[0].targetSets).toBeLessThan(4)
    expect(writer.current.sessionState).toBe("not_started") // apply never activates a session
  })

  const unsafe: Array<[string, (c: WorkoutChange) => WorkoutChange]> = [
    ["more sets than planned", (c) => ({ ...c, after: { ...c.after!, targetSets: 6 } })],
    ["more reps than planned", (c) => ({ ...c, after: { ...c.after!, repMax: 12 } })],
    ["a REPLACE (different exercise)", (c) => ({ ...c, action: "REPLACE" })],
    ["an unknown baseline", (c) => ({ ...c, before: { ...c.before!, targetSets: null } })],
  ]
  it.each(unsafe)("hold: %s is rejected and nothing is written", async (_label, edit) => {
    const { result, writer, mutations } = await apply(withChange(base, edit), "recovery")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("HOLD_ACTIVE")
    expect(writer.current.exercises[0].targetSets).toBe(4)
    expect(await mutations.findByProposalId(`${base.proposalId}-x`)).toBeNull()
  })

  it("un-skipping an exercise is never reduce-only", () => {
    expect(isReduceOnlyChange({ ...reducing, before: { ...reducing.before!, isSkipped: true }, after: { ...reducing.after!, isSkipped: false } })).toBe(false)
  })

  it("without a hold, apply behaves as before", async () => {
    const { result } = await apply(base, null)
    expect(result.ok).toBe(true)
  })
})
