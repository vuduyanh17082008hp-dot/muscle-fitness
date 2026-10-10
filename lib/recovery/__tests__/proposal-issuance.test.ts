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

  it("rejects a missing or truncated mac", () => {
    const issued = proposal()
    expect(verifyRecoveryProposal(issued, undefined, SECRET)).toBe(false)
    expect(verifyRecoveryProposal(issued, "", SECRET)).toBe(false)
    expect(verifyRecoveryProposal(issued, "abcd", SECRET)).toBe(false)
  })
})
