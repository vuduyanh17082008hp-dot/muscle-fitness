import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import type { WorkoutAdjustmentProposal } from "@/lib/recovery/proposal"

const SECRET_ENV = "RECOVERY_PROPOSAL_SECRET"
const MIN_SECRET_LENGTH = 16

export function getRecoveryProposalSecret(): string | null {
  const secret = process.env[SECRET_ENV]?.trim()
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  return secret
}

export function canonicalProposalPayload(proposal: WorkoutAdjustmentProposal): string {
  return JSON.stringify({
    proposalId: proposal.proposalId,
    subjectRef: proposal.subjectRef,
    workoutRef: proposal.workoutRef,
    planVersionRef: proposal.planVersionRef,
    expiresAtRef: proposal.expiresAtRef ?? "",
    changes: proposal.changes.map((change) => ({
      changeId: change.changeId,
      sessionExerciseId: change.sessionExerciseId ?? "",
      action: change.action,
      before: change.before ?? null,
      after: change.after ?? null,
    })),
  })
}

export function signRecoveryProposal(proposal: WorkoutAdjustmentProposal, secret: string): string {
  return createHmac("sha256", secret).update(canonicalProposalPayload(proposal)).digest("hex")
}

export function verifyRecoveryProposal(
  proposal: WorkoutAdjustmentProposal,
  mac: unknown,
  secret: string,
): boolean {
  if (typeof mac !== "string" || mac.length === 0) return false
  const expected = signRecoveryProposal(proposal, secret)
  const left = Buffer.from(mac)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
