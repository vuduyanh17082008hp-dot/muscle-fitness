import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { applyWorkoutAdjustment, createMemoryMutationStore } from "@/lib/recovery/apply-proposal"
import {
  createSupabaseCanonicalCommit,
  createSupabaseProposalStore,
  createSupabaseSessionWriter,
  persistWorkoutProposal,
} from "@/lib/recovery/supabase-apply"
import {
  getRecoveryProposalSecret,
  signRecoveryProposal,
} from "@/lib/recovery/proposal-issuance"
import { buildPlanVersionRef, type WorkoutAdjustmentProposal } from "@/lib/recovery/proposal"
import { readFileSync } from "node:fs"
import path from "node:path"

const SECRET = "test-recovery-proposal-secret-key"
const noAppliedAdjustment = { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }

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

function fakeClient(options: {
  insertError?: { code: string; message: string } | null
  row?: { snapshot: unknown; user_id: string; issuance_mac: unknown } | null
  inserted?: unknown[]
}) {
  const inserted = options.inserted ?? []
  return {
    inserted,
    from() {
      return {
        insert: async (row: unknown) => {
          inserted.push(row)
          return { error: options.insertError ?? null }
        },
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: options.row ?? null, error: null }),
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe("recovery proposal RLS contract", () => {
  it("uses the ordered workout_session_exercises schema", () => {
    const schema = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260804190000_project_09_workout_system.sql"),
      "utf8",
    )
    const rpc = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261006120000_apply_recovery_workout_proposal.sql"),
      "utf8",
    )
    const runtime = readFileSync(
      path.join(process.cwd(), "lib/recovery/supabase-apply.ts"),
      "utf8",
    )

    expect(schema).toMatch(/create table if not exists public\.workout_session_exercises[\s\S]*display_name text not null/)
    expect(schema).toMatch(/target_rep_min smallint not null/)
    expect(schema).toMatch(/target_rep_max smallint not null/)
    expect(rpc).toMatch(/v_row\.target_rep_min/)
    expect(rpc).toMatch(/v_row\.target_rep_max/)
    expect(rpc).toMatch(/target_rep_min = case/)
    expect(rpc).toMatch(/target_rep_max = case/)
    expect(rpc).not.toMatch(/v_row\.rep_(?:min|max)/)
    expect(runtime).toContain("display_name, target_sets, target_rep_min, target_rep_max")
    expect(runtime).not.toContain("exercise_name, target_sets, rep_min, rep_max")
  })

  it("does not grant table access to anon or authenticated browsers", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261006090000_recovery_workout_proposals.sql"),
      "utf8",
    )
    expect(sql).toMatch(
      /revoke all on table public\.recovery_workout_proposals from public, anon, authenticated/,
    )
    expect(sql).toMatch(/grant select, insert[\s\S]*to service_role/)
    expect(sql).not.toMatch(/to authenticated;/)
    expect(sql).not.toMatch(/for insert/)
    expect(sql).not.toMatch(/for update/)
    expect(sql).not.toMatch(/for delete/)
    expect(sql).toMatch(/issuance_mac text/)
  })

  it("does not grant apply RPC execute to anon or authenticated", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261006120000_apply_recovery_workout_proposal.sql"),
      "utf8",
    )
    expect(sql).toMatch(/p_actor_user_id uuid/)
    expect(sql).toMatch(/revoke all on function public\.apply_recovery_workout_proposal\(text, uuid\)[\s\S]*from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.apply_recovery_workout_proposal\(text, uuid\)[\s\S]*to service_role/)
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/)
  })
})

describe("persistWorkoutProposal issuance", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_PROPOSAL_SECRET", SECRET)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("fails closed without a server secret", async () => {
    vi.stubEnv("RECOVERY_PROPOSAL_SECRET", "")
    expect(getRecoveryProposalSecret()).toBeNull()
    const client = fakeClient({})
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(persistWorkoutProposal(client as never, proposal())).resolves.toEqual({ ok: false })
    expect(client.inserted).toHaveLength(0)
    error.mockRestore()
  })

  it("inserts a server-signed snapshot and does not upsert", async () => {
    const client = fakeClient({})
    const result = await persistWorkoutProposal(client as never, proposal())
    expect(result).toEqual({ ok: true })
    expect(client.inserted).toHaveLength(1)
    expect(client.inserted[0]).toMatchObject({
      proposal_id: "wap_canonical",
      user_id: "user-a",
      issuance_mac: signRecoveryProposal(proposal(), SECRET),
    })
  })

  it("treats a signed unique conflict as success without rewriting", async () => {
    const issued = proposal()
    const client = fakeClient({
      insertError: { code: "23505", message: "duplicate" },
      row: {
        snapshot: issued,
        user_id: "user-a",
        issuance_mac: signRecoveryProposal(issued, SECRET),
      },
    })
    await expect(persistWorkoutProposal(client as never, issued)).resolves.toEqual({ ok: true })
  })

  it("does not treat a forged occupying row as a successful persist", async () => {
    const issued = proposal()
    const forged = proposal()
    forged.changes[0]!.after = { ...forged.changes[0]!.after!, targetSets: 99 }
    const client = fakeClient({
      insertError: { code: "23505", message: "duplicate" },
      row: { snapshot: forged, user_id: "user-a", issuance_mac: "deadbeef" },
    })
    await expect(persistWorkoutProposal(client as never, issued)).resolves.toEqual({ ok: false })
  })

  it("fails closed on a real insert error", async () => {
    const client = fakeClient({ insertError: { code: "42501", message: "denied" } })
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(persistWorkoutProposal(client as never, proposal())).resolves.toEqual({ ok: false })
    error.mockRestore()
  })
})

describe("createSupabaseProposalStore trust boundary", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_PROPOSAL_SECRET", SECRET)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("loads a legitimate server-signed proposal", async () => {
    const issued = proposal()
    const store = createSupabaseProposalStore(
      fakeClient({
        row: {
          snapshot: issued,
          user_id: "user-a",
          issuance_mac: signRecoveryProposal(issued, SECRET),
        },
      }) as never,
    )
    await expect(store.load("wap_canonical", "user-a")).resolves.toEqual(issued)
  })

  it("rejects an unsigned PostgREST-inserted snapshot", async () => {
    const forged = proposal()
    forged.changes[0]!.after = { ...forged.changes[0]!.after!, targetSets: 99, isSkipped: true }
    const store = createSupabaseProposalStore(
      fakeClient({
        row: { snapshot: forged, user_id: "user-a", issuance_mac: null },
      }) as never,
    )
    await expect(store.load("wap_canonical", "user-a")).resolves.toBeNull()
  })

  it("rejects a stolen mac on mutated canonical content", async () => {
    const issued = proposal()
    const mac = signRecoveryProposal(issued, SECRET)
    const forged = proposal()
    forged.changes[0]!.after = { ...forged.changes[0]!.after!, targetSets: 99 }
    const store = createSupabaseProposalStore(
      fakeClient({
        row: { snapshot: forged, user_id: "user-a", issuance_mac: mac },
      }) as never,
    )
    await expect(store.load("wap_canonical", "user-a")).resolves.toBeNull()
  })

  it("rejects a proposal attributed to another user", async () => {
    const issued = proposal({ subjectRef: "user-b" })
    const store = createSupabaseProposalStore(
      fakeClient({
        row: {
          snapshot: issued,
          user_id: "user-a",
          issuance_mac: signRecoveryProposal(issued, SECRET),
        },
      }) as never,
    )
    await expect(store.load("wap_canonical", "user-a")).resolves.toBeNull()
  })

  it("does not apply a forged store row", async () => {
    const issued = proposal()
    const store = createSupabaseProposalStore(
      fakeClient({
        row: { snapshot: issued, user_id: "user-a", issuance_mac: "forged" },
      }) as never,
    )
    const result = await applyWorkoutAdjustment({
      actorUserId: "user-a",
      proposalId: issued.proposalId,
      now: new Date("2026-09-25T03:00:00.000Z"),
      sessions: {
        async loadOwnedSession() {
          throw new Error("must not load session for an untrusted proposal")
        },
        async applyPatches() {
          throw new Error("must not mutate")
        },
      },
      mutations: createMemoryMutationStore(),
      proposals: store,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("PROPOSAL_NOT_FOUND")
  })
})

describe("createSupabaseCanonicalCommit", () => {
  it("sends only proposal_id to the apply RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        alreadyApplied: false,
        mutationId: "mut-1",
        subjectRef: "user-a",
        proposalRef: "wap_canonical",
        workoutBeforeRef: "session-1",
        workoutAfterRef: "session-1",
        previousPlanVersionRef: "plan-v1",
        newPlanVersionRef: "plan-v1",
        appliedAt: "2026-09-25T03:00:00.000Z",
        appliedBy: "USER_CONFIRMED_DANTE_PROPOSAL",
        changeRefs: ["chg_1"],
      },
      error: null,
    })
    const commit = createSupabaseCanonicalCommit({
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), limit: async () => ({ data: [], error: null }) }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as never)
    const issued = proposal()
    const result = await commit.commit({
      userId: "user-a",
      proposal: issued,
      session: {
        id: "session-1",
        userId: "user-a",
        name: "Today",
        scheduledFor: null,
        durationMinutes: null,
        sessionState: "not_started",
        workoutPlanId: "plan-1",
        updatedAt: "2026-09-25T00:00:00.000Z",
        planUpdatedAt: null,
        exercises: [],
      },
      changes: issued.changes,
      now: new Date("2026-09-25T03:00:00.000Z"),
    })
    expect(rpc).toHaveBeenCalledWith("apply_recovery_workout_proposal", {
      p_proposal_id: "wap_canonical",
      p_actor_user_id: "user-a",
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.mutation.appliedBy).toBe("USER_CONFIRMED_DANTE_PROPOSAL")
  })

  it("maps a transactional STALE_PLAN without treating it as applied", async () => {
    const commit = createSupabaseCanonicalCommit({
      rpc: async () => ({ data: null, error: { message: "STALE_PLAN" } }),
      from: () => noAppliedAdjustment,
    } as never)
    const issued = proposal()
    const result = await commit.commit({
      userId: "user-a",
      proposal: issued,
      session: {
        id: "session-1",
        userId: "user-a",
        name: "Today",
        scheduledFor: null,
        durationMinutes: null,
        sessionState: "not_started",
        workoutPlanId: "plan-1",
        updatedAt: "2026-09-25T00:00:00.000Z",
        planUpdatedAt: null,
        exercises: [],
      },
      changes: issued.changes,
      now: new Date("2026-09-25T03:00:00.000Z"),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("STALE_PLAN")
  })

  it("rejects a wrong actor without invoking the RPC as that actor's victim", async () => {
    const rpc = vi.fn()
    const commit = createSupabaseCanonicalCommit({ rpc } as never)
    const issued = proposal()
    const result = await commit.commit({
      userId: "user-b",
      proposal: issued,
      session: {
        id: "session-1",
        userId: "user-a",
        name: "Today",
        scheduledFor: null,
        durationMinutes: null,
        sessionState: "not_started",
        workoutPlanId: "plan-1",
        updatedAt: "2026-09-25T00:00:00.000Z",
        planUpdatedAt: null,
        exercises: [],
      },
      changes: issued.changes,
      now: new Date("2026-09-25T03:00:00.000Z"),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("FORBIDDEN")
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe("one adjustment per session (hackathon repair F-02)", () => {
  it("refuses a second, different proposal for an already-adjusted session without calling the RPC", async () => {
    const rpc = vi.fn()
    const applied = { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [{ proposal_id: "wap_first" }], error: null }) }) }) }) }
    const commit = createSupabaseCanonicalCommit({ rpc, from: () => applied } as never)
    const issued = proposal({ proposalId: "wap_second" })
    const result = await commit.commit({
      userId: "user-a",
      proposal: issued,
      session: { id: "session-1", userId: "user-a", name: "Today", scheduledFor: null, durationMinutes: null, sessionState: "not_started", workoutPlanId: "plan-1", updatedAt: null, planUpdatedAt: null, exercises: [] },
      changes: issued.changes,
      now: new Date("2026-09-25T03:00:00.000Z"),
    })
    expect(result).toMatchObject({ ok: false, error: "ALREADY_APPLIED" })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe("apply-side session version (hackathon repair F-02)", () => {
  it("loads the plan's updated_at, so the version ref matches the one the proposal was issued against", async () => {
    const rows: Record<string, unknown> = {
      workout_sessions: { id: "session-1", user_id: "user-a", name: "Upper", scheduled_for: null, duration_minutes: 70, session_state: "not_started", updated_at: "2026-10-18T12:23:32.498907+00:00", workout_plan_id: "plan-1" },
      workout_plans: { updated_at: "2026-10-18T12:23:29.838485+00:00" },
      workout_session_exercises: [{ id: "se-bench", exercise_id: "ex", display_name: "Bench", target_sets: 3, target_rep_min: 6, target_rep_max: 10, rest_seconds: 120, is_skipped: false }],
    }
    const client = {
      from(table: string) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: async () => ({ data: rows[table], error: null }),
          maybeSingle: async () => ({ data: rows[table], error: null }),
        }
        return chain
      },
    }
    const session = await createSupabaseSessionWriter(client as never).loadOwnedSession("user-a", "session-1")
    expect(session?.planUpdatedAt).toBe("2026-10-18T12:23:29.838485+00:00")
    expect(buildPlanVersionRef(session!)).toContain("::2026-10-18T12:23:29.838485+00:00::")
  })
})
