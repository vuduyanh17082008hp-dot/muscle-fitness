import { describe, expect, it } from "vitest"

import { FOOD_LOG_CHANGED_EVENT, foodLogChangeSource } from "@/lib/coach-context-event"

describe("food-log change announcements", () => {
  it("the tracker can tell its own announcements from Dante's (no reload loop, Dante writes re-read Fuel)", () => {
    expect(foodLogChangeSource(new CustomEvent(FOOD_LOG_CHANGED_EVENT, { detail: { source: "tracker" } }))).toBe("tracker")
    expect(foodLogChangeSource(new CustomEvent(FOOD_LOG_CHANGED_EVENT, { detail: { source: "dante" } }))).toBe("dante")
  })

  it("a plain or unknown-source event counts as an external change", () => {
    expect(foodLogChangeSource(new Event(FOOD_LOG_CHANGED_EVENT))).toBeNull()
    expect(foodLogChangeSource(new CustomEvent(FOOD_LOG_CHANGED_EVENT, { detail: { source: "x" } }))).toBeNull()
  })
})
