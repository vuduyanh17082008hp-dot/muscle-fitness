import { describe, expect, it } from "vitest"
import { computeFoodIdentity } from "@/lib/nutrition/food-identity"

describe("computeFoodIdentity", () => {
  it("prioritizes barcode over source+sourceId when both are present", () => {
    const identity = computeFoodIdentity({ barcode: "5000159407236", source: "open-food-facts", sourceId: "abc" })
    expect(identity).toBe("barcode:5000159407236")
  })

  it("falls back to source+sourceId when there is no barcode", () => {
    const identity = computeFoodIdentity({ source: "usda", sourceId: "171077" })
    expect(identity).toBe("usda:171077")
  })

  it("returns null when there is no stable identifier (e.g. a free-text manual entry)", () => {
    const identity = computeFoodIdentity({ source: "user_provided" })
    expect(identity).toBeNull()
  })

  it("never matches by name alone — two foods with the same source but different ids get different identities", () => {
    const a = computeFoodIdentity({ source: "usda", sourceId: "111" })
    const b = computeFoodIdentity({ source: "usda", sourceId: "222" })
    expect(a).not.toBe(b)
  })
})
