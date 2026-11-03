import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/dante-core/server/training-hold-guard", () => ({ currentTrainingHold: vi.fn(async () => null), TRAINING_HOLD_MESSAGE: { recovery: "On hold — x", unverified: "Unverified — x" } }))

import { updateTrainingScheduleTool } from "@/lib/dante-core/tools/write/update-training-schedule"

const PLAN = "00000000-0000-4000-8000-0000000000aa"
const D = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

/** A tiny in-memory PostgREST stand-in: rows per table, eq/is/in filters, update(...).select() returns matched rows. */
function fakeDb(options: { failUpdateOf?: string } = {}) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    workout_plans: [{ id: PLAN, client_id: "u1", days_per_week: 3, status: "active" }],
    workout_days: [1, 2, 3].map((n) => ({ id: D(n), workout_plan_id: PLAN, scheduled_weekday: [1, 3, 5][n - 1] })),
    fitness_profiles: [{ user_id: "u1", training_days: 3 }],
  }
  const from = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> | null = null
    const q = {
      select: () => q,
      update: (value: Record<string, unknown>) => ((patch = value), q),
      eq: (key: string, value: unknown) => (filters.push((row) => row[key] === value), q),
      is: (key: string, value: unknown) => (filters.push((row) => row[key] === value), q),
      in: (key: string, values: unknown[]) => (filters.push((row) => values.includes(row[key])), q),
      run() {
        const rows = tables[table]!.filter((row) => filters.every((f) => f(row)))
        if (patch) {
          if (options.failUpdateOf && rows.some((row) => row.id === options.failUpdateOf) && patch.scheduled_weekday !== undefined && patch.scheduled_weekday === null) {
            return { data: null, error: { message: "injected" } }
          }
          for (const row of rows) Object.assign(row, patch)
        }
        return { data: rows.map((row) => ({ ...row })), error: null }
      },
      maybeSingle: async () => {
        const { data, error } = q.run()
        return { data: data?.[0] ?? null, error }
      },
      then: (resolve: (value: unknown) => unknown) => resolve(q.run()),
    }
    return q
  }
  return { tables, client: { from } as never }
}

const input = {
  planId: PLAN,
  planName: "PPL",
  beforeDaysPerWeek: 3,
  daysPerWeek: 2,
  temporary: false,
  days: [1, 2, 3].map((n) => ({ dayId: D(n), name: `Day ${n}`, before: [1, 3, 5][n - 1]!, after: null })),
  language: "en" as const,
}

describe("update_training_schedule execute", () => {
  it("applies every day, the plan and the profile, and reads the week back", async () => {
    const db = fakeDb()
    const result = await updateTrainingScheduleTool.execute({ supabase: db.client, userId: "u1", now: new Date() }, input)
    expect(result).toMatchObject({ ok: true, data: { daysPerWeek: 2, week: "rotation: Day 1 → Day 2 → Day 3" } })
    expect(db.tables.workout_days!.map((row) => row.scheduled_weekday)).toEqual([null, null, null])
    expect(db.tables.workout_plans![0]!.days_per_week).toBe(2)
    expect(db.tables.fitness_profiles![0]!.training_days).toBe(2)
  })

  it("a failure part-way restores the days already changed and changes nothing else", async () => {
    const db = fakeDb({ failUpdateOf: D(2) })
    const result = await updateTrainingScheduleTool.execute({ supabase: db.client, userId: "u1", now: new Date() }, input)
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? "" : result.error).toMatch(/undone/)
    expect(db.tables.workout_days!.map((row) => row.scheduled_weekday)).toEqual([1, 3, 5])
    expect(db.tables.workout_plans![0]!.days_per_week).toBe(3)
  })

  it("someone else's plan is not found; a changed weekday is stale", async () => {
    expect(await updateTrainingScheduleTool.execute({ supabase: fakeDb().client, userId: "u2", now: new Date() }, input)).toMatchObject({ ok: false, code: "ACTION_NOT_FOUND" })
    const db = fakeDb()
    db.tables.workout_days![0]!.scheduled_weekday = 6
    expect(await updateTrainingScheduleTool.execute({ supabase: db.client, userId: "u1", now: new Date() }, input)).toMatchObject({ ok: false, code: "ACTION_STALE" })
    expect(db.tables.workout_days!.map((row) => row.scheduled_weekday)).toEqual([6, 3, 5])
  })
})
