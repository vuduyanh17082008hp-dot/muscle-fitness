import { describe, expect, it } from "vitest"

import { regionLoad, stanceOf, type BodyRegion } from "@/lib/training/body-region-load"
import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library"
import { EXERCISE_PROFILES } from "@/lib/workouts/exercise-profiles"

const item = (slug: string) => {
  const found = EXERCISE_CATALOGUE.find((entry) => entry.slug === slug)
  if (!found) throw new Error(`no catalogue item ${slug}`)
  return found
}
const load = (slug: string, region: BodyRegion) => regionLoad(item(slug), region)?.load

describe("body-region load metadata", () => {
  it("every profiled exercise declares a stance, so no profile is silently 'unloaded'", () => {
    const missing = Object.keys(EXERCISE_PROFILES).filter((slug) => stanceOf(slug) === null)
    expect(missing).toEqual([])
  })

  it("every basis has its Vietnamese wording", () => {
    const missing = new Set<string>()
    for (const item of EXERCISE_CATALOGUE) {
      for (const region of ["foot_ankle", "knee", "hip", "lower_back", "shoulder", "elbow", "wrist_hand"] as BodyRegion[]) {
        const verdict = regionLoad(item, region)
        if (verdict && verdict.basisVi === verdict.basis) missing.add(verdict.basis)
      }
    }
    expect([...missing]).toEqual([])
  })

  it("an exercise without a profile is unknown, never clear", () => {
    expect(regionLoad({ ...item("leg-press"), slug: "not-a-profile" }, "foot_ankle")).toBeNull()
  })

  it("foot/ankle: standing, foot-drive and calf work load it; pads and braces are contact; hanging/seated upper body is none", () => {
    for (const slug of ["barbell-back-squat", "romanian-deadlift", "bulgarian-split-squat", "standing-calf-raise", "leg-press", "leg-press-calf-raise", "barbell-hip-thrust", "push-up", "cable-triceps-pushdown"]) {
      expect(load(slug, "foot_ankle"), slug).toBe("loads")
    }
    for (const slug of ["leg-extension", "seated-leg-curl", "lying-leg-curl", "barbell-bench-press", "seated-cable-row"]) {
      expect(load(slug, "foot_ankle"), slug).toBe("contact")
    }
    for (const slug of ["machine-chest-press", "lat-pulldown", "pull-up", "preacher-curl", "reverse-crunch"]) {
      expect(load(slug, "foot_ankle"), slug).toBe("none")
    }
  })

  it("wrist/hand: gripped loads and push-ups load it; leg machines don't; a squat bar on the back is contact", () => {
    expect(load("romanian-deadlift", "wrist_hand")).toBe("loads")
    expect(load("bulgarian-split-squat", "wrist_hand")).toBe("loads")
    expect(load("push-up", "wrist_hand")).toBe("loads")
    expect(load("barbell-back-squat", "wrist_hand")).toBe("contact")
    for (const slug of ["leg-press", "leg-extension", "seated-leg-curl", "hack-squat", "standing-calf-raise"]) {
      expect(load(slug, "wrist_hand"), slug).toBe("none")
    }
  })

  it("knee and shoulder follow the movement pattern, not the exercise name", () => {
    expect(load("leg-extension", "knee")).toBe("loads")
    expect(load("romanian-deadlift", "knee")).toBe("contact")
    expect(load("machine-chest-press", "knee")).toBe("none")
    expect(load("barbell-overhead-press", "shoulder")).toBe("loads")
    expect(load("barbell-back-squat", "shoulder")).toBe("contact")
    expect(load("leg-press", "shoulder")).toBe("none")
  })
})
