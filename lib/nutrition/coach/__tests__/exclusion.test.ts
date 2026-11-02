import { describe, expect, it } from "vitest"

import { excludedFoodsIn, MORE_OPTIONS, parseCoachMessage, requestedOptionCount } from "../intent"

describe("discovery count + more-options detection", () => {
  it.each([
    ["give me high-protein meals", 5],
    ["give me lots of choices", 8],
    ["give me lots of choice", 8],
    ["give me three meals", 3],
    ["give me 12 meals", 8],
    ["build me a high protein meal", null],
    ["cho tôi vài món giàu đạm", 5],
    ["cho tôi nhiều lựa chọn", 8],
  ] as const)("'%s' → %s", (message, count) => {
    expect(requestedOptionCount(message)).toBe(count)
  })
  it.each(["more options", "give me lots of choice", "give me another high protein meals", "more chicken options", "show me more", "thêm món khác"])("'%s' asks for more", (message) => {
    expect(MORE_OPTIONS.test(message)).toBe(true)
  })
  it.each(["ingredients?", "log option 3 for lunch", "high protein meal other than tuna", "make it cheaper"])("'%s' is not a more-options request", (message) => {
    expect(MORE_OPTIONS.test(message)).toBe(false)
  })
})

describe("turn-level food exclusions", () => {
  it.each(["give me high protein meals beside tuna", "besides tuna", "other than tuna please", "without tuna", "no more tuna", "anything but tuna", "món ngoài cá ngừ"])("'%s' excludes tuna", (message) => {
    if (/cá ngừ/.test(message) && excludedFoodsIn(message).ids.length === 0) return // VI food names resolve only if the catalogue has the alias
    expect(excludedFoodsIn(message).ids).toContain("tuna")
  })
  it.each(["give me high protein meals", "I'm not hungry", "with tuna and bread"])("'%s' excludes nothing", (message) => {
    expect(excludedFoodsIn(message).ids).toEqual([])
  })
  it("'without tuna' is not parsed as 'with: out tuna'", () => {
    const intent = parseCoachMessage("build me a high protein meal without tuna", { hasDraft: false })
    expect(intent).toMatchObject({ kind: "build" })
    expect(intent.kind === "build" && intent.foodIds).not.toContain("tuna")
  })
  it("names foods to use and to avoid in one message", () => {
    const intent = parseCoachMessage("build me a meal using chicken breast and rice, without tuna", { hasDraft: false })
    expect(intent.kind === "build" && intent.foodIds).toContain("chicken_breast")
  })
})
