import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library"

/**
 * VER3-02: every built-in exercise id the app can persist must be seeded by the
 * reconcile migration (workout_exercises.exercise_id FKs exercise_library.id).
 */
const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261011130000_builtin_exercise_identity.sql"),
  "utf8",
)
const seeded = [...MIGRATION.matchAll(/\('([0-9a-f-]{36})'::uuid, '([a-z0-9-]+)', '((?:[^']|'')*)'/g)].map(
  (m) => ({ id: m[1], slug: m[2], name: m[3].replace(/''/g, "'") }),
)

describe("built-in exercise identity", () => {
  it("every built-in has a deterministic uuid, a slug and a unique identity", () => {
    const ids = LOCAL_EXERCISE_LIBRARY.map((e) => e.id)
    expect(ids.every((id) => /^10000000-0000-4000-8000-\d{12}$/.test(id ?? ""))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(LOCAL_EXERCISE_LIBRARY.map((e) => e.slug)).size).toBe(ids.length)
  })

  it("the migration seeds exactly the app's built-ins (no drift in id, slug or name)", () => {
    expect(seeded).toEqual(
      LOCAL_EXERCISE_LIBRARY.map((e) => ({ id: e.id, slug: e.slug, name: e.name })),
    )
  })
})
