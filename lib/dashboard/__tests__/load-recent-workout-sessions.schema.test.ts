import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { loadRecentWorkoutSessions } from "@/lib/dashboard/load-recent-workout-sessions"

/** Columns of public.workout_sessions as declared by the migration chain. */
function canonicalColumns(): Set<string> {
  const dir = join(process.cwd(), "supabase", "migrations")
  const columns = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, file), "utf8")
    const create = sql.match(/create table if not exists public\.workout_sessions \(([\s\S]*?)\n\);/)
    for (const line of create?.[1].split("\n") ?? []) {
      const m = line.match(/^\s{2}([a-z_]+)\s+(?!check\b)[a-z]/)
      if (m && !["constraint", "primary", "references", "on"].includes(m[1])) columns.add(m[1])
    }
    for (const stmt of sql.match(/alter table public\.workout_sessions[\s\S]*?;/g) ?? []) {
      for (const m of stmt.matchAll(/add column if not exists (\w+)/g)) columns.add(m[1])
    }
  }
  return columns
}

describe("loadRecentWorkoutSessions schema contract", () => {
  it("only selects/filters workout_sessions columns that exist in migrations", async () => {
    const used: string[] = []
    const builder: Record<string, unknown> = {}
    builder.select = (cols: string) => {
      used.push(...cols.split(",").map((c) => c.trim()))
      return builder
    }
    for (const op of ["eq", "not", "in"]) {
      builder[op] = (col: string) => {
        used.push(col)
        return builder
      }
    }
    builder.order = (col: string) => {
      used.push(col)
      return builder
    }
    builder.limit = async () => ({ data: [], error: null })

    await loadRecentWorkoutSessions({ from: () => builder } as never, "user-1")

    const known = canonicalColumns()
    expect(known.has("name")).toBe(true)
    expect(used.filter((c) => !known.has(c))).toEqual([])
  })
})
