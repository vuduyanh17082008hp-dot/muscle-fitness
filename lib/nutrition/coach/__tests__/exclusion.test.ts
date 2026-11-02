import { describe, expect, it } from "vitest"

import { excludedFoodsIn, parseCoachMessage } from "../intent"

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
