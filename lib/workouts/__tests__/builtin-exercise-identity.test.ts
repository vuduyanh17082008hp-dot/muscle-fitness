import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { LEGACY_SEEDED_EXERCISES } from "@/lib/workouts/exercise-catalogue-additions"
import { LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library"

/**
 * VER3-02: every built-in exercise id the app can persist must be seeded by a
 * migration (workout_exercises.exercise_id FKs exercise_library.id).
 * 20261011130000 reconciles the original 24; 20261101120000 inserts the
 * Muscle Intelligence 2.0 additions (insert-only, never re-keys).
 */
const read = (file: string) => readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8")
const SEED_MIGRATIONS = ["20261011130000_builtin_exercise_identity.sql", "20261101120000_hypertrophy_catalogue.sql"]
const seeded = SEED_MIGRATIONS.flatMap((file) =>
  [...read(file).matchAll(/\('([0-9a-f-]{36})'::uuid, '([a-z0-9-]+)', '((?:[^']|'')*)'/g)].map((m) => ({
    id: m[1],
    slug: m[2],
    name: m[3].replace(/''/g, "'"),
  })),
)

describe("built-in exercise identity", () => {
  it("every built-in has a deterministic uuid, a slug and a unique identity", () => {
    const ids = LOCAL_EXERCISE_LIBRARY.map((e) => e.id)
    expect(ids.every((id) => /^10000000-0000-4000-8000-\d{12}$/.test(id ?? ""))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(LOCAL_EXERCISE_LIBRARY.map((e) => e.slug)).size).toBe(ids.length)
  })

  it("the migrations seed exactly the app's built-ins (no drift in id, slug or name)", () => {
    expect(seeded).toEqual(LOCAL_EXERCISE_LIBRARY.map((e) => ({ id: e.id, slug: e.slug, name: e.name })))
  })

  it("the catalogue migration is insert-only — it never re-keys or deletes an existing row", () => {
    const sql = read("20261101120000_hypertrophy_catalogue.sql").toLowerCase()
    expect(sql).not.toMatch(/\bdelete\s+from\b|\bupdate\s+public\.|\bupdate\s+%s/)
  })

  it("legacy catalogue entries have no fixed id and point at a slug an earlier seed created", () => {
    const workoutSystemSeed = read("20260804190000_project_09_workout_system.sql")
    for (const item of LEGACY_SEEDED_EXERCISES) {
      expect(item.id).toBeNull()
      expect(workoutSystemSeed).toContain(`'${item.slug}'`)
      expect(LOCAL_EXERCISE_LIBRARY.some((e) => e.slug === item.slug)).toBe(false)
    }
  })
})
