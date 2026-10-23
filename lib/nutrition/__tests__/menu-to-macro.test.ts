import { describe, expect, it } from "vitest"

import type { MenuDish, MenuReading } from "@/lib/ai/vision-client"
import { allergyHit, analyzeMenu, estimateMenuDish, type MenuAthleteContext } from "@/lib/nutrition/menu-to-macro"

const dish = (name: string, extra: Partial<MenuDish> = {}): MenuDish => ({ name, description: "", price: "", preparation: "unknown", components: [], ...extra })
const menu = (dishes: MenuDish[], readability: MenuReading["readability"] = "full"): MenuReading => ({ isMenu: true, readability, dishes })

const VN_MENU = menu([dish("Phở Bò Tái"), dish("Bún Chả Hà Nội"), dish("Gỏi Cuốn Tôm Thịt"), dish("Cơm Tấm Sườn"), dish("Bánh Mì Trứng"), dish("Cháo Gà")])
const CTX: MenuAthleteContext = { goal: "maintenance", remaining: { calories: 900, protein: 60 }, excludedTerms: [], allergiesKnown: true }

describe("estimateMenuDish", () => {
  it("prices a catalog dish from its curated recipe as a labelled range, with an editable prefill", () => {
    const option = estimateMenuDish(dish("Phở Bò Tái"))
    expect(option.menu.name).toBe("Phở Bò Tái")
    expect(option.estimate?.basis).toBe("catalog")
    expect(option.estimate!.calories.low).toBeLessThan(option.estimate!.calories.high)
    expect(option.estimate!.calories.low % 10).toBe(0) // no false precision
    expect(option.prefill.length).toBeGreaterThan(3)
    expect(option.prefill.every((item) => item.fromTemplate)).toBe(true)
  })

  it("prices an unknown dish from guessed parts only when nearly all of it has a reference record", () => {
    const steak = estimateMenuDish(dish("Steak & rice", { preparation: "grilled", components: [{ name: "beef", grams: 200 }, { name: "rice", grams: 200 }] }))
    expect(steak.estimate?.basis).toBe("ingredients")
    // beef 200 g × 166 + rice 200 × 130 + oil (beef only, 3 % of 200 g = 6 g × 8.84) ≈ 645 ± 35 %
    expect(steak.estimate!.calories.low).toBe(420)
    expect(steak.estimate!.calories.high).toBe(870)
    const unknown = estimateMenuDish(dish("Durian curry", { components: [{ name: "durian", grams: 200 }, { name: "rice", grams: 100 }] }))
    expect(unknown.estimate).toBeNull()
    expect(unknown.prefill.find((item) => item.detectedName === "durian")?.groundedFood).toBeNull()
  })
})

describe("analyzeMenu", () => {
  it("returns three distinct, labelled picks that all exist on the menu", () => {
    const analysis = analyzeMenu(VN_MENU, CTX)
    expect(analysis.recommendations.map((r) => r.label)).toEqual(["Best protein fit", "Best balanced option", "Best calorie-controlled option"])
    const names = analysis.recommendations.map((r) => r.option.menu.name)
    expect(new Set(names).size).toBe(3)
    for (const name of names) expect(VN_MENU.dishes.map((d) => d.name)).toContain(name)
    for (const rec of analysis.recommendations) {
      expect(rec.why).toMatch(/kcal/)
      expect(rec.uncertainty).toMatch(/typical recipe/)
    }
  })

  it("is personalised: a fat-loss goal leads with the calorie pick, and a tight budget changes the picks", () => {
    expect(analyzeMenu(VN_MENU, { ...CTX, goal: "fat_loss" }).recommendations[0].slot).toBe("calorie")
    const roomy = analyzeMenu(VN_MENU, { ...CTX, remaining: { calories: 1500, protein: 100 } }).recommendations[0].option.menu.name
    const tight = analyzeMenu(VN_MENU, { ...CTX, remaining: { calories: 400, protein: 100 } })
    expect(tight.recommendations[0].option.menu.name).not.toBe(roomy)
    for (const rec of tight.recommendations) expect((rec.option.estimate!.calories.low + rec.option.estimate!.calories.high) / 2).toBeLessThanOrEqual(440)
  })

  it("still fills all three slots when the only mid-sized dish is already the protein pick (live finding)", () => {
    // budget 2407 → mid band 722–1685 kcal; only bún chả (~770) is in it, and it is also the top protein dish
    const analysis = analyzeMenu(VN_MENU, { ...CTX, remaining: { calories: 2407, protein: 132 } })
    expect(analysis.recommendations).toHaveLength(3)
    expect(new Set(analysis.recommendations.map((r) => r.option.menu.name)).size).toBe(3)
  })

  it("prices a guessed part by its food word when the full name has no record, but never a bare generic word", () => {
    const beef = estimateMenuDish(dish("Bò Lúc Lắc", { preparation: "stir_fried", components: [{ name: "beef cubes", grams: 150 }, { name: "jasmine rice", grams: 200 }, { name: "water spinach", grams: 50 }] }))
    expect(beef.prefill.map((item) => item.groundedFood?.id)).toEqual(["local-beef-lean-cooked", "local-white-rice-cooked", "local-spinach-raw"])
    expect(beef.estimate?.basis).toBe("ingredients")
    const sauce = estimateMenuDish(dish("X", { components: [{ name: "chili sauce", grams: 20 }, { name: "rice", grams: 200 }] }))
    expect(sauce.prefill[0].groundedFood).toBeNull()
    // live finding: "braised fish" was priced as braised beef brisket via the word "braised"
    const fish = estimateMenuDish(dish("Cá Kho Tộ", { components: [{ name: "braised fish", grams: 150 }, { name: "rice", grams: 150 }] }))
    expect(fish.prefill[0].groundedFood).toBeNull()
    expect(fish.estimate).toBeNull()
  })

  it("a partly readable menu says so; fewer than three estimable dishes says so", () => {
    const analysis = analyzeMenu(menu([dish("Phở Gà"), dish("Chef's special")], "partial"), CTX)
    expect(analysis.recommendations).toHaveLength(1)
    expect(analysis.notEstimated).toEqual(["Chef's special"])
    expect(analysis.limitations.join(" ")).toMatch(/Only part of the menu was readable/)
    expect(analysis.limitations.join(" ")).toMatch(/Only 1 dish on this menu/)
  })

  it("missing goal, remaining macros and allergy data degrade with a stated limitation, never invented values", () => {
    const analysis = analyzeMenu(VN_MENU, { goal: null, remaining: null, excludedTerms: [], allergiesKnown: false })
    expect(analysis.recommendations).toHaveLength(3)
    expect(analysis.recommendations.every((r) => !/still need today|left today/.test(r.why))).toBe(true)
    const text = analysis.limitations.join(" ")
    expect(text).toMatch(/remaining calories and protein couldn't be loaded/)
    expect(text).toMatch(/No nutrition goal/)
    expect(text).toMatch(/NOT checked for allergens/)
  })

  it("allergies exclude dishes by menu text and typical recipe, in Vietnamese too", () => {
    const shellfish = analyzeMenu(VN_MENU, { ...CTX, excludedTerms: ["shellfish"] })
    expect(shellfish.excluded.map((e) => e.name)).toContain("Gỏi Cuốn Tôm Thịt")
    expect(shellfish.recommendations.map((r) => r.option.menu.name)).not.toContain("Gỏi Cuốn Tôm Thịt")
    const fish = analyzeMenu(VN_MENU, { ...CTX, excludedTerms: ["fish"] })
    expect(fish.excluded.map((e) => e.name)).toEqual(expect.arrayContaining(["Bún Chả Hà Nội", "Cơm Tấm Sườn"])) // fish sauce in the recipe
    expect(fish.limitations.join(" ")).toMatch(/ask the staff/)
    expect(allergyHit("Bánh mì trứng ốp la", ["eggs"])).toBe("eggs")
    expect(allergyHit("Cà chua", ["peanut"])).toBeNull()
    expect(allergyHit("Crushed peanuts", ["peanut"])).toBe("peanut")
  })

  it("an empty reading recommends nothing", () => {
    expect(analyzeMenu(menu([], "unreadable"), CTX).recommendations).toEqual([])
  })
})
