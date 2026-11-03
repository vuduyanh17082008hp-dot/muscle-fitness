import { beforeEach, describe, expect, it, vi } from "vitest"

const readMenuImage = vi.fn()
const loadFoodLogForDate = vi.fn()
const loadNutritionContext = vi.fn()
const from = vi.fn()
let user: { id: string } | null = { id: "user-1" }

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from }),
}))
vi.mock("@/lib/ai/vision-client", () => ({
  readMenuImage: (...args: unknown[]) => readMenuImage(...args),
  isVisionConfigured: () => true,
}))
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: (...args: unknown[]) => loadFoodLogForDate(...args) }))
vi.mock("@/lib/nutrition/load-nutrition-context", () => ({ loadNutritionContext: (...args: unknown[]) => loadNutritionContext(...args) }))

import { POST } from "@/app/api/nutrition/menu/route"

const IMG = "data:image/jpeg;base64,AAAA"
const post = () => POST(new Request("http://x/api/nutrition/menu", { method: "POST", body: JSON.stringify({ image: IMG }) }))
const dish = (name: string) => ({ name, description: "", price: "", preparation: "unknown", components: [] })

beforeEach(() => {
  readMenuImage.mockReset()
  from.mockReset()
  user = { id: "user-1" }
  loadFoodLogForDate.mockResolvedValue({ unavailable: false, totals: { calories: 1200, protein: 80, carbs: 100, fat: 40 } })
  loadNutritionContext.mockResolvedValue({
    plan: { input: { goal: "fat_loss", allergies: ["peanut"], excludedFoods: [] } },
    targets: { complete: { calories: 2000, protein: 150, carbs: 200, fat: 60 } },
  })
})

describe("POST /api/nutrition/menu", () => {
  it("needs a signed-in user", async () => {
    user = null
    expect((await post()).status).toBe(401)
  })

  it("ranks against the athlete's real remaining day and allergies, and never writes anything", async () => {
    readMenuImage.mockResolvedValue({ isMenu: true, readability: "full", dishes: [dish("Phở Gà"), dish("Bún Thịt Nướng"), dish("Cháo Gà"), dish("Bánh Mì Trứng")] })
    const { result } = await (await post()).json()
    expect(result.status).toBe("ok")
    expect(result.analysis.recommendations[0].slot).toBe("calorie") // fat-loss goal leads with calories
    expect(result.analysis.recommendations[0].why).toMatch(/800 kcal left today/)
    expect(result.analysis.excluded).toEqual([{ name: "Bún Thịt Nướng", term: "peanut" }]) // crushed peanuts in the recipe
    expect(from).not.toHaveBeenCalled()
  })

  it("an unreadable menu, a non-menu photo, and a model failure are distinct results", async () => {
    readMenuImage.mockResolvedValue({ isMenu: true, readability: "unreadable", dishes: [] })
    expect((await (await post()).json()).result.status).toBe("unreadable")
    readMenuImage.mockResolvedValue({ isMenu: false, readability: "unreadable", dishes: [] })
    expect((await (await post()).json()).result.status).toBe("not_menu")
    readMenuImage.mockResolvedValue(null)
    expect((await (await post()).json()).result.status).toBe("error")
  })

  it("a failing context read degrades to 'unknown' with stated limitations instead of failing or inventing", async () => {
    loadNutritionContext.mockRejectedValue(new Error("db down"))
    readMenuImage.mockResolvedValue({ isMenu: true, readability: "full", dishes: [dish("Phở Gà")] })
    const { result } = await (await post()).json()
    expect(result.analysis.recommendations).toHaveLength(1)
    expect(result.analysis.limitations.join(" ")).toMatch(/NOT checked for allergens/)
    expect(result.analysis.limitations.join(" ")).toMatch(/couldn't be loaded/)
  })
})
