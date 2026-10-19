import { describe, expect, it } from "vitest"

import { loadTodayAdjustmentStatus, renderAdjustmentStatusReply, WHY_WORKOUT_CHANGED_ASK } from "@/lib/recovery/adjustment-status"
import type { WorkoutAdjustmentProposal } from "@/lib/recovery/proposal"

const NOW = new Date("2026-10-18T12:00:00.000Z")
const proposal: WorkoutAdjustmentProposal = {
  proposalId: "wap_1", subjectRef: "user-a", workoutRef: "session-1", planVersionRef: "v1", recoveryStateRef: "rs", safetyEvaluationRef: "se",
  createdAtRef: NOW.toISOString(), status: "MINOR_ADJUSTMENT", decisionState: "RESOLVED", evidenceRefs: [],
  changes: [{ changeId: "c1", sessionExerciseId: "se-1", exerciseName: "Barbell Bench Press", action: "REDUCE_SETS", before: { targetSets: 3, repMin: 6, repMax: 10, isSkipped: false }, after: { targetSets: 2, repMin: 6, repMax: 10, isSkipped: false }, reasonDisplay: "Recovery is a priority today — trim a set and keep the session.", evidenceRefs: [] }],
}

/** Table-aware fake: every chain method returns the chain; `limit` resolves with that table's rows. */
function client(rows: Record<string, unknown[] | "error">) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq", "gt", "order"]) chain[m] = () => chain
      chain.limit = async () => (rows[table] === "error" ? { data: null, error: { message: "boom" } } : { data: rows[table] ?? [], error: null })
      return chain
    },
  } as never
}
const load = (mutations: unknown[] | "error", proposals: unknown[] | "error", sessionId: string | null = "session-1") =>
  loadTodayAdjustmentStatus({ supabase: client({ workout_mutation_records: mutations }), admin: client({ recovery_workout_proposals: proposals }), userId: "user-a", sessionId, now: NOW })

describe("why-changed answers from rows, not from the premise (hackathon repair F-03)", () => {
  it("only previewed / awaiting confirmation / Apply failed → PENDING: 'hasn't been changed'", async () => {
    const status = await load([], [{ snapshot: proposal }])
    expect(status).toMatchObject({ status: "PENDING" })
    const reply = renderAdjustmentStatusReply(status, "en")
    expect(reply).toMatch(/hasn't been changed/)
    expect(reply).toMatch(/Barbell Bench Press 3 → 2 sets/)
    expect(reply).not.toMatch(/\bwas adjusted\b|\bmodified\b/)
  })

  it("Apply succeeded → APPLIED with the real before/after and the stored reason", async () => {
    const status = await load([{ proposal_id: "wap_1", applied_at: NOW.toISOString() }], [{ snapshot: proposal }])
    const reply = renderAdjustmentStatusReply(status, "en")
    expect(reply).toMatch(/you applied my suggestion/)
    expect(reply).toMatch(/Barbell Bench Press 3 → 2 sets/)
    expect(reply).toMatch(/Recovery is a priority today/)
  })

  it("nothing issued → NONE; no session → says so; failed read → can't check (never guesses)", async () => {
    expect(renderAdjustmentStatusReply(await load([], []), "en")).toMatch(/hasn't been changed — it's still as planned/)
    expect(renderAdjustmentStatusReply(await load([], [], null), "en")).toMatch(/no workout scheduled/)
    expect(await load("error", [])).toBeNull()
    expect(renderAdjustmentStatusReply(null, "en")).toMatch(/couldn't check/)
    expect(renderAdjustmentStatusReply(await load([], [{ snapshot: proposal }]), "vi")).toMatch(/chưa bị thay đổi/)
  })

  it.each([
    ["Why did you change today's workout?", true],
    ["why did you cut my sets today", true],
    ["How come you adjusted my training plan?", true],
    ["tai sao ban lai doi buoi tap hom nay", true],
    ["Can you change today's workout?", false],
    ["Why is my recovery score low?", false],
  ])("%s → %s", (message, expected) => {
    expect(WHY_WORKOUT_CHANGED_ASK.test(message.toLowerCase())).toBe(expected)
  })
})
