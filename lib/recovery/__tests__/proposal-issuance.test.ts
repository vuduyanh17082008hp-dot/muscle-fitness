import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  canonicalProposalPayload,
  getRecoveryProposalSecret,
  signRecoveryProposal,
  verifyRecoveryProposal,
} from "@/lib/recovery/proposal-issuance"
import type { WorkoutAdjustmentProposal } from "@/lib/recovery/proposal"

const SECRET = "test-recovery-proposal-secret-key"

function proposal(overrides: Partial<WorkoutAdjustmentProposal> = {}): WorkoutAdjustmentProposal {
  return {
    proposalId: "wap_canonical",
    subjectRef: "user-a",
    workoutRef: "session-1",
    planVersionRef: "plan-v1",
    recoveryStateRef: "rs-1",
    safetyEvaluationRef: "se-1",
    createdAtRef: "2026-09-25T01:00:00.000Z",
    expiresAtRef: "2026-09-25T13:00:00.000Z",
    status: "MINOR_ADJUSTMENT",
    decisionState: "RESOLVED",
    evidenceRefs: [],
    changes: [
      {
        changeId: "chg_1",
        sessionExerciseId: "se-bench",
        exerciseName: "Bench Press",
        action: "REDUCE_SETS",
        before: { targetSets: 4, repMin: 6, repMax: 8, isSkipped: false },
        after: { targetSets: 3, repMin: 6, repMax: 8, isSkipped: false },
        evidenceRefs: [],
      },
    ],
    ...overrides,
  }
}

describe("recovery proposal issuance", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_PROPOSAL_SECRET", SECRET)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("requires a server-only secret", () => {
    expect(getRecoveryProposalSecret()).toBe(SECRET)
    vi.stubEnv("RECOVERY_PROPOSAL_SECRET", "short")
    expect(getRecoveryProposalSecret()).toBeNull()
  })

  it("accepts a server-signed snapshot and rejects forged changes", () => {
    const issued = proposal()
    const mac = signRecoveryProposal(issued, SECRET)
    expect(verifyRecoveryProposal(issued, mac, SECRET)).toBe(true)
    const forged = proposal()
    forged.changes[0]!.after = { ...forged.changes[0]!.after!, targetSets: 99 }
    expect(verifyRecoveryProposal(forged, mac, SECRET)).toBe(false)
    expect(canonicalProposalPayload(issued)).not.toBe(canonicalProposalPayload(forged))
  })

  it("verifies a snapshot whose nested keys were reordered by jsonb storage", () => {
    const issued = proposal()
    const mac = signRecoveryProposal(issued, SECRET)
    // jsonb returns keys ordered by length then bytes: repMax, repMin, isSkipped, targetSets.
    const reordered = JSON.parse(JSON.stringify(issued)) as WorkoutAdjustmentProposal
    const change = reordered.changes[0]!
    change.before = { repMax: 8, repMin: 6, isSkipped: false, targetSets: 4 } as typeof change.before
    change.after = { repMax: 8, repMin: 6, isSkipped: false, targetSets: 3 } as typeof change.after
    const shuffled = Object.fromEntries(Object.entries(reordered).reverse()) as unknown as WorkoutAdjustmentProposal
    expect(canonicalProposalPayload(shuffled)).toBe(canonicalProposalPayload(issued))
    expect(verifyRecoveryProposal(shuffled, mac, SECRET)).toBe(true)
    change.after = { repMax: 8, repMin: 6, isSkipped: false, targetSets: 1 } as typeof change.after
    expect(verifyRecoveryProposal(reordered, mac, SECRET)).toBe(false)
  })

  it("binds the mac to user, workout, plan version and expiry", () => {
    const mac = signRecoveryProposal(proposal(), SECRET)
    expect(verifyRecoveryProposal(proposal({ subjectRef: "user-b" }), mac, SECRET)).toBe(false)
    expect(verifyRecoveryProposal(proposal({ workoutRef: "session-2" }), mac, SECRET)).toBe(false)
    expect(verifyRecoveryProposal(proposal({ planVersionRef: "plan-v2" }), mac, SECRET)).toBe(false)
    expect(verifyRecoveryProposal(proposal({ expiresAtRef: "2027-01-01T00:00:00.000Z" }), mac, SECRET)).toBe(false)
  })

  it("rejects a missing or truncated mac", () => {
    const issued = proposal()
    expect(verifyRecoveryProposal(issued, undefined, SECRET)).toBe(false)
    expect(verifyRecoveryProposal(issued, "", SECRET)).toBe(false)
    expect(verifyRecoveryProposal(issued, "abcd", SECRET)).toBe(false)
  })
})
