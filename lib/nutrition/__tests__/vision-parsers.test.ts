import { describe, expect, it } from "vitest"

import { agreeReadings, parseLeftovers, parseMenu, type MenuDish, type MenuReading } from "@/lib/ai/vision-client"

describe("parseLeftovers (after-photo output is untrusted)", () => {
  it("keeps only requested ids, rounds to 5 %, clamps, and marks missing components as can't-tell", () => {
    const result = parseLeftovers(
      {
        sameMeal: true,
        reason: "",
        components: [
          { id: "c0", remainingPercent: 48, confidence: "medium", note: "" },
          { id: "c0", remainingPercent: 0, confidence: "high", note: "dupe" },
          { id: "c1", remainingPercent: 140, confidence: "certain", note: "" },
          { id: "ghost", remainingPercent: 10, confidence: "high", note: "" },
          { id: "c2", remainingPercent: null, confidence: "low", note: "broth level not visible" },
        ],
      },
      ["c0", "c1", "c2", "c3"],
    )
    expect(result).toEqual({
      sameMeal: true,
      reason: undefined,
      components: [
        { id: "c0", remainingPercent: 50, confidence: "medium", note: undefined },
        { id: "c1", remainingPercent: 100, confidence: "low", note: undefined },
        { id: "c2", remainingPercent: null, confidence: "low", note: "broth level not visible" },
        { id: "c3", remainingPercent: null, confidence: "low", note: "Not judged from the photos." },
      ],
    })
  })

  it("malformed output is a failure, not 'everything eaten'", () => {
    expect(parseLeftovers({ components: [] }, ["c0"])).toBeNull()
    expect(parseLeftovers(null, ["c0"])).toBeNull()
    expect(parseLeftovers({ sameMeal: "yes", components: [] }, ["c0"])).toBeNull()
  })
})

const dish = (name: string, extra: Record<string, unknown> = {}) => ({ name, description: "", price: "", preparation: "boiled", components: [], ...extra })

describe("parseMenu (menu reading is untrusted)", () => {
  it("keeps printed names verbatim, dedupes, bounds components, defaults unknown preparation", () => {
    const reading = parseMenu({
      isMenu: true,
      legibleLines: ["Phở Bò Tái  65.000đ", "Rare beef", "Mystery"],
      illegibleEntries: 0,
      readability: "full",
      dishes: [
        dish("  Phở Bò Tái  ", { description: "Rare beef", price: "65.000đ", components: [{ name: "rice noodles", grams: 200 }, { name: "", grams: 10 }, { name: "beef", grams: 9000 }] }),
        dish("phở bò tái"),
        dish("", { description: "x" }),
        dish("Mystery", { preparation: "sous-vide" }),
      ],
    })
    expect(reading).toEqual({
      isMenu: true,
      readability: "full",
      dishes: [
        { name: "Phở Bò Tái", description: "Rare beef", price: "65.000đ", preparation: "boiled", components: [{ name: "rice noodles", grams: 200 }] },
        { name: "Mystery", description: "", price: "", preparation: "unknown", components: [] },
      ],
    })
  })

  it("drops a dish that isn't in any legible line (live finding: invented dishes on a blurred menu) and calls the reading partial", () => {
    const reading = parseMenu({
      isMenu: true,
      legibleLines: ["Bún Chả Hà Nội 60.000đ"],
      illegibleEntries: 0,
      readability: "full",
      dishes: [dish("Bún Chả Hà Nội"), dish("Gà Nướng Mật Ong"), dish("Classic Italian Lasagna")],
    })
    expect(reading?.dishes.map((d) => d.name)).toEqual(["Bún Chả Hà Nội"])
    expect(reading?.readability).toBe("partial")
  })

  it("illegible entries make it partial even when the model says full; nothing provable is unreadable", () => {
    const partial = parseMenu({ isMenu: true, legibleLines: ["Cháo Gà"], illegibleEntries: 5, readability: "full", dishes: [dish("Cháo Gà")] })
    expect(partial?.readability).toBe("partial")
    const blurred = parseMenu({ isMenu: true, legibleLines: [], illegibleEntries: 9, readability: "full", dishes: [dish("Fish Tacos"), dish("Sashimi")] })
    expect(blurred).toEqual({ isMenu: true, readability: "unreadable", dishes: [] })
  })

  it("two readings must agree: an invented dish (different each run) is dropped, a printed one survives", () => {
    const d = (name: string): MenuDish => ({ name, description: "", price: "", preparation: "unknown", components: [] })
    const r = (names: string[], readability: MenuReading["readability"] = "full"): MenuReading => ({ isMenu: true, readability, dishes: names.map(d) })
    expect(agreeReadings(r(["Phở Bò", "Bún Chả"]), r(["pho bo", "Bún Chả"]))).toEqual(r(["Phở Bò", "Bún Chả"]))
    expect(agreeReadings(r(["Fish Tacos", "Sashimi"]), r(["Lasagna", "Tiramisu"]))).toEqual({ isMenu: true, readability: "unreadable", dishes: [] })
    expect(agreeReadings(r(["Cháo Gà", "Soup"]), r(["Cháo Gà"])).readability).toBe("partial")
    expect(agreeReadings({ isMenu: false, readability: "unreadable", dishes: [] }, r(["Pizza"])).isMenu).toBe(false)
  })

  it("not a menu → no dishes; garbage is a failure", () => {
    expect(parseMenu({ isMenu: false, legibleLines: ["Pizza"], illegibleEntries: 0, readability: "full", dishes: [dish("Pizza")] })).toEqual({ isMenu: false, readability: "unreadable", dishes: [] })
    expect(parseMenu({ isMenu: true, readability: "full", dishes: [] })).toBeNull() // no transcription → can't prove anything
    expect(parseMenu({ dishes: [] })).toBeNull()
  })
})
