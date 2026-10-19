import { describe, expect, it } from "vitest"

import { buildCravingDraft, UNSAFE_CRAVING_CLAIMS } from "../craving"
import { applyDraftOp, assembleDraft, contextConstraints, isStale, makeSnapshot } from "../draft"
import { mealFingerprint } from "../fingerprint"
import { analyzeGaps, suggestAdditions } from "../gaps"
import { COACH_INGREDIENTS, isIngredientBlocked, requireIngredient } from "../ingredients"
import { assessConfidence, scaleItems, totalsFor, validateMeal } from "../macros"
import { buildFromSelection } from "../optimizer"
import { buildNextMeal, chooseMyFood, resolveConstraints } from "../service"
import type { ActiveMealDraft, DraftItem, MealConstraints } from "../types"
import { makeCtx } from "./fixtures"

const ctx = makeCtx()
const constraints = (patch: Partial<MealConstraints> = {}): MealConstraints => ({
  calorieCeiling: 520,
  calorieCeilingStrict: false,
  calorieCeilingSource: "context",
  proteinTarget: 54,
  proteinTargetSource: "context",
  maxPriceSgd: null,
  maxCookMinutes: null,
  availableIds: null,
  ...patch,
})

function okDraft(result: ReturnType<typeof buildNextMeal>): ActiveMealDraft {
  if (!result.ok) throw new Error(`expected a draft: ${result.message}`)
  return result.draft
}

const bowl = (): DraftItem[] => [
  { ingredientId: "chicken_breast", grams: 150 },
  { ingredientId: "rice", grams: 180 },
  { ingredientId: "broccoli", grams: 120 },
]

describe("ingredient dataset", () => {
  it("is a small canonical set with a distinguishable source on every entry", () => {
    expect(COACH_INGREDIENTS.length).toBeGreaterThanOrEqual(30)
    expect(COACH_INGREDIENTS.length).toBeLessThan(60)
    expect(new Set(COACH_INGREDIENTS.map((i) => i.id)).size).toBe(COACH_INGREDIENTS.length)
    for (const i of COACH_INGREDIENTS) {
      expect(["VERIFIED", "ESTIMATED", "UNKNOWN"]).toContain(i.source)
      expect(["RAW", "COOKED", "AS_SERVED"]).toContain(i.measurementBasis)
      expect(["USDA_REFERENCE", "LABEL_REFERENCE", "CURATED_ESTIMATE"]).toContain(i.provenance)
    }
    expect(requireIngredient("chicken_breast").measurementBasis).toBe("COOKED")
    expect(requireIngredient("rice").measurementBasis).toBe("COOKED")
    expect(requireIngredient("oats").measurementBasis).toBe("RAW")
    expect(requireIngredient("whey_protein")).toMatchObject({ source: "ESTIMATED", provenance: "CURATED_ESTIMATE" })
  })
})

describe("deterministic macros", () => {
  it("computes totals from per-100g values and grams (never from a model)", () => {
    const t = totalsFor([
      { ingredientId: "chicken_breast", grams: 200 },
      { ingredientId: "rice", grams: 100 },
    ])
    expect(t.calories).toBe(460) // 330 + 130
    expect(t.protein).toBe(64.7) // 62 + 2.7
    expect(t.carbs).toBe(28)
  })
})

describe("Build My Next Meal (BALANCED)", () => {
  it("fits the remaining calories and closes the protein gap using the user's context", () => {
    const draft = okDraft(buildNextMeal(ctx))
    expect(draft.mode).toBe("BALANCED")
    expect(draft.nutrition.calories).toBeLessThanOrEqual(520)
    expect(draft.nutrition.protein).toBeGreaterThanOrEqual(52)
    expect(draft.status).toBe("READY")
    expect(draft.sessionContextSnapshot.caloriesRemaining).toBe(520)
  })

  it("excludes allergens and excluded foods from every candidate", () => {
    const allergic = makeCtx({ allergies: ["fish", "dairy"], excludedFoods: ["chicken"] })
    for (const mode of ["BALANCED", "LEANEST", "BUDGET"] as const) {
      const draft = okDraft(buildNextMeal(allergic, mode))
      for (const i of draft.ingredients) {
        expect(isIngredientBlocked(requireIngredient(i.ingredientId), ["fish", "dairy", "chicken"])).toBe(false)
      }
    }
  })

  it("supports LEANEST and BUDGET architecture", () => {
    const lean = okDraft(buildNextMeal(ctx, "LEANEST"))
    const cheap = okDraft(buildNextMeal(ctx, "BUDGET"))
    expect(lean.mode).toBe("LEANEST")
    expect(cheap.estimatedPriceSgd).toBeLessThanOrEqual(lean.estimatedPriceSgd + 0.01)
  })

  it("reports no budget instead of inventing a meal when almost nothing is left", () => {
    const result = buildNextMeal(makeCtx({ caloriesRemaining: 40 }))
    expect(result.ok).toBe(false)
    expect(contextConstraints(makeCtx({ caloriesRemaining: 40 }).snapshot)).toBeNull()
  })

  it("respects a strict user calorie ceiling", () => {
    const draft = okDraft(buildNextMeal(ctx, "BALANCED", { calorieCeiling: 400, strict: true }))
    expect(draft.nutrition.calories).toBeLessThanOrEqual(400)
  })
})

describe("constraint relaxation", () => {
  it("never invents an exact fit; states exactly which soft constraints changed", () => {
    const result = buildNextMeal(ctx, "BALANCED", { calorieCeiling: 300, strict: true, proteinTarget: 50, maxPriceSgd: 1, maxCookMinutes: 5 })
    const draft = okDraft(result)
    expect(draft.nutrition.calories).toBeLessThanOrEqual(300)
    expect(draft.violations.length).toBeGreaterThan(0)
    expect(draft.violations.every((v) => v.tier !== "hard")).toBe(true)
    expect(draft.notes[0]).toBe("I couldn't satisfy every constraint simultaneously.")
    const budget = draft.violations.find((v) => v.constraint === "budget")
    expect(budget?.message).toMatch(/^Closest match costs approximately S\$\d+\.\d{2} rather than S\$1\.00\.$/)
    if (result.ok) expect(result.message).toContain("I couldn't satisfy every constraint simultaneously.")
  })

  it("reports an infeasible strict ceiling instead of breaking it", () => {
    const result = buildNextMeal(ctx, "BALANCED", { calorieCeiling: 40, strict: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("INFEASIBLE")
  })

  it("never relaxes allergies", () => {
    const allergic = makeCtx({ allergies: ["fish"] })
    const draft = okDraft(buildNextMeal(allergic, "BALANCED", { calorieCeiling: 300, strict: true, proteinTarget: 50, maxPriceSgd: 0.5 }))
    expect(draft.ingredients.some((i) => requireIngredient(i.ingredientId).allergens.includes("fish"))).toBe(false)
  })
})

describe("portion scaling", () => {
  it("AUTO raises protein first when protein is short", () => {
    const scaled = scaleItems(
      [
        { ingredientId: "chicken_breast", grams: 80 },
        { ingredientId: "rice", grams: 180 },
      ],
      { mode: "AUTO", targetCalories: 600, targetProtein: 50 },
    )
    expect(totalsFor(scaled).protein).toBeGreaterThanOrEqual(48)
    expect(scaled[0].grams).toBeGreaterThan(80)
  })

  it("AUTO cuts calorie-dense components first and preserves protein", () => {
    const before = [
      { ingredientId: "chicken_breast", grams: 150 },
      { ingredientId: "rice", grams: 250 },
      { ingredientId: "cooking_oil", grams: 15 },
    ]
    const scaled = scaleItems(before, { mode: "AUTO", targetCalories: 450, targetProtein: 46 })
    expect(totalsFor(scaled).calories).toBeLessThanOrEqual(470)
    expect(scaled.find((i) => i.ingredientId === "chicken_breast")!.grams).toBe(150)
    expect(scaled.find((i) => i.ingredientId === "cooking_oil")!.grams).toBeLessThan(15)
  })

  it("AUTO spends calorie headroom on carbs when protein is already enough", () => {
    const scaled = scaleItems(bowl(), { mode: "AUTO", targetCalories: 700, targetProtein: 40 })
    expect(scaled.find((i) => i.ingredientId === "rice")!.grams).toBeGreaterThan(180)
    expect(scaled.find((i) => i.ingredientId === "chicken_breast")!.grams).toBe(150)
  })

  it("CARB_ADJUST only moves carbs; PROTEIN_ADJUST only moves protein", () => {
    const carb = scaleItems(bowl(), { mode: "CARB_ADJUST", targetCalories: 700 })
    expect(carb.find((i) => i.ingredientId === "chicken_breast")!.grams).toBe(150)
    expect(carb.find((i) => i.ingredientId === "rice")!.grams).toBeGreaterThan(180)
    const protein = scaleItems(bowl(), { mode: "PROTEIN_ADJUST", targetProtein: 60 })
    expect(protein.find((i) => i.ingredientId === "rice")!.grams).toBe(180)
    expect(totalsFor(protein).protein).toBeGreaterThanOrEqual(58)
  })

  it("'Make this 450 calories' recalculates deterministically", () => {
    const draft = okDraft(buildNextMeal(ctx))
    const next = applyDraftOp(ctx, draft, { type: "scale", mode: "AUTO", targetCalories: 450 })
    expect(Math.abs(next.draft.nutrition.calories - 450)).toBeLessThanOrEqual(25)
    expect(next.draft.nutrition).toEqual(totalsFor(next.draft.ingredients))
  })
})

describe("ingredient substitution", () => {
  it("recalculates macros after a swap", () => {
    const d = assembleDraft({ ctx, family: "savory_bowl", items: bowl(), constraints: constraints({ calorieCeiling: 800, proteinTarget: 20 }) })
    const result = applyDraftOp(ctx, d, { type: "swap", from: "chicken_breast", to: "white_fish" })
    expect(result.applied).toBe(true)
    expect(result.draft.nutrition).toEqual(totalsFor(result.draft.ingredients))
    expect(result.draft.nutrition.calories).toBeLessThan(d.nutrition.calories)
    expect(result.draft.history).toHaveLength(2)
  })

  it("warns (without applying) when a swap pushes the meal over the calorie ceiling", () => {
    const base = assembleDraft({ ctx, family: "savory_bowl", items: bowl(), constraints: constraints({ calorieCeiling: 800, proteinTarget: 20 }) })
    const tight = assembleDraft({ ctx, family: "savory_bowl", items: base.ingredients, constraints: constraints({ calorieCeiling: Math.ceil(base.nutrition.calories) + 5, proteinTarget: 20 }) })
    const result = applyDraftOp(ctx, tight, { type: "swap", from: "chicken_breast", to: "lean_beef" })
    expect(result.applied).toBe(false)
    expect(result.warnings[0].kind).toBe("CALORIE_CEILING")
    expect(result.warnings[0].message).toMatch(/This swap would increase the meal to \d+ kcal, above your \d+ kcal target\./)
    expect(result.warnings[0].actions.map((a) => a.label)).toEqual(["Accept anyway", "Reduce portion", "Find leaner option"])
    expect(result.draft.ingredients.map((i) => i.ingredientId)).toContain("chicken_breast")
    const forced = applyDraftOp(ctx, tight, { type: "swap", from: "chicken_breast", to: "lean_beef", fit: "force" })
    expect(forced.applied).toBe(true)
  })

  it("warns when a swap drops protein below the target", () => {
    const d = assembleDraft({ ctx, family: "savory_bowl", items: bowl(), constraints: constraints({ calorieCeiling: 900, proteinTarget: 45 }) })
    const result = applyDraftOp(ctx, d, { type: "swap", from: "chicken_breast", to: "tofu" })
    expect(result.applied).toBe(false)
    expect(result.warnings[0].kind).toBe("PROTEIN_SHORT")
    expect(result.warnings[0].message).toMatch(/would fall \d+g short of this meal's protein target/)
    expect(result.warnings[0].actions.map((a) => a.label)).toEqual(["Add protein", "Increase portion", "Find another swap"])
  })

  it("refuses to swap in an excluded ingredient", () => {
    const allergic = makeCtx({ allergies: ["fish"] })
    const d = assembleDraft({ ctx: allergic, family: "savory_bowl", items: bowl(), constraints: constraints({ calorieCeiling: 800, proteinTarget: 20 }) })
    expect(applyDraftOp(allergic, d, { type: "swap", from: "chicken_breast", to: "white_fish" }).applied).toBe(false)
  })
})

describe("gap-filling engine", () => {
  it("suggests a REQUIRED protein addition when protein falls short", () => {
    const items = [
      { ingredientId: "rice", grams: 180 },
      { ingredientId: "broccoli", grams: 120 },
      { ingredientId: "chicken_breast", grams: 60 },
    ]
    const c = constraints({ calorieCeiling: 700, proteinTarget: 50 })
    expect(analyzeGaps(items, c)).toContain("PROTEIN_GAP")
    const suggestions = suggestAdditions(ctx, items, c)
    expect(suggestions[0].gap).toBe("PROTEIN_GAP")
    expect(suggestions[0].necessity).toBe("REQUIRED_FOR_TARGET")
    expect(suggestions.length).toBeLessThanOrEqual(3)
  })

  it("suggests low-calorie flavor upgrades marked optional, each with an impact and purpose", () => {
    const suggestions = suggestAdditions(ctx, bowl(), constraints({ calorieCeiling: 700, proteinTarget: 40 }))
    const flavor = suggestions.filter((s) => s.gap === "FLAVOR_GAP")
    expect(flavor.length).toBeGreaterThan(0)
    for (const s of flavor) {
      expect(s.necessity).toBe("OPTIONAL_QUALITY_UPGRADE")
      expect(s.impact.calories).toBeLessThanOrEqual(15)
      expect(s.purpose.length).toBeGreaterThan(0)
    }
  })

  it("adds nothing to an already complete meal", () => {
    const items = [...bowl(), { ingredientId: "garlic", grams: 5 }]
    const c = constraints({ calorieCeiling: 700, proteinTarget: 40 })
    expect(analyzeGaps(items, c)).toEqual([])
    expect(suggestAdditions(ctx, items, c)).toEqual([])
  })

  it("never suggests an excluded ingredient", () => {
    const picky = makeCtx({ excludedFoods: ["lime", "chili", "lemon", "garlic", "soy"] })
    const suggestions = suggestAdditions(picky, bowl(), constraints({ calorieCeiling: 700, proteinTarget: 40 }))
    for (const s of suggestions) expect(["lime", "lemon", "chili", "garlic", "soy_sauce"]).not.toContain(s.ingredientId)
  })
})

describe("Choose My Food", () => {
  it("builds from selected foods without having to use all of them", () => {
    const selected = ["chicken_breast", "rice", "egg_whites", "greek_yogurt", "broccoli"]
    const draft = okDraft(chooseMyFood(ctx, selected, "BALANCED", { calorieCeiling: 500, strict: true }))
    expect(draft.nutrition.calories).toBeLessThanOrEqual(500)
    expect(draft.ingredients.length).toBeLessThanOrEqual(5)
    for (const i of draft.ingredients) expect(selected).toContain(i.ingredientId)
  })

  it("ignores selections that are blocked for the user", () => {
    const blocked = makeCtx({ allergies: ["egg"] })
    const result = buildFromSelection(blocked, resolveConstraints(blocked)!, ["egg_whites", "chicken_breast", "rice"])
    expect(result.status).toBe("OK")
    if (result.status === "OK") expect(result.best.items.map((i) => i.ingredientId)).not.toContain("egg_whites")
  })
})

describe("confidence model", () => {
  it("is HIGH for verified canonical ingredients with known portions", () => {
    const c = assessConfidence(bowl())
    expect(c.confidence).toBe("HIGH")
    expect(c.reasons).toContain("Verified ingredient data")
  })

  it("is MEDIUM with estimated data and LOW for restaurant or unclear portions", () => {
    expect(assessConfidence([{ ingredientId: "whey_protein", grams: 30 }]).confidence).toBe("MEDIUM")
    const low = assessConfidence(bowl(), { preparedBy: "restaurant" })
    expect(low.confidence).toBe("LOW")
    expect(low.reasons[0]).toBe("Restaurant preparation and oil quantity are unknown")
    expect(assessConfidence(bowl(), { portionsKnown: false }).confidence).toBe("LOW")
  })
})

describe("Craving Makeover", () => {
  for (const key of ["chocolate_cereal", "protein_ice_cream"] as const) {
    it(`builds a claim-safe ${key} draft that recalculates deterministically`, () => {
      const roomy = makeCtx({ caloriesRemaining: 700 })
      const result = buildCravingDraft(roomy, key)
      expect(result.status).toBe("OK")
      if (result.status !== "OK") return
      const { draft } = result
      expect(draft.craving?.original.source).toBe("ESTIMATED")
      expect(draft.craving!.sensoryTargets.length).toBeGreaterThan(2)
      expect(draft.craving!.original.caloriesRange[0]).toBeLessThan(draft.craving!.original.caloriesRange[1])
      expect(draft.nutrition).toEqual(totalsFor(draft.ingredients))
      expect(draft.nutrition.protein).toBeGreaterThan(draft.craving!.original.proteinRange[1])
      const text = [...draft.craving!.comparison, ...draft.craving!.swaps.map((s) => s.why)].join(" ")
      expect(text).not.toMatch(UNSAFE_CRAVING_CLAIMS)
      if (key === "protein_ice_cream") {
        expect(draft.ingredients.map((item) => item.ingredientId)).not.toContain("guar_gum")
        expect(draft.suggestions).toEqual(
          expect.arrayContaining([expect.objectContaining({ ingredientId: "guar_gum", necessity: "OPTIONAL_QUALITY_UPGRADE" })]),
        )
      }
      const first = draft.ingredients[0]
      const edited = applyDraftOp(roomy, draft, { type: "set_grams", ingredientId: first.ingredientId, grams: first.grams + 10 })
      expect(edited.draft.craving?.key).toBe(key)
    })
  }

  it("refuses when a needed ingredient conflicts with an allergy", () => {
    expect(buildCravingDraft(makeCtx({ allergies: ["dairy"] }), "protein_ice_cream").status).toBe("BLOCKED")
  })
})

describe("Active Meal Draft undo / redo / restore", () => {
  it("steps through versions deterministically", () => {
    const d0 = okDraft(buildNextMeal(ctx))
    const d1 = applyDraftOp(ctx, d0, { type: "scale", mode: "AUTO", targetCalories: 420 }).draft
    const d2 = applyDraftOp(ctx, d1, { type: "add", ingredientId: "lime" }).draft
    expect(d2.history.map((h) => h.version)).toEqual([1, 2, 3])
    const u = applyDraftOp(ctx, d2, { type: "undo" }).draft
    expect(u.nutrition).toEqual(d1.nutrition)
    const r = applyDraftOp(ctx, u, { type: "redo" }).draft
    expect(r.nutrition).toEqual(d2.nutrition)
    const back = applyDraftOp(ctx, r, { type: "restore", version: 1 }).draft
    expect(back.nutrition).toEqual(d0.nutrition)
    const branched = applyDraftOp(ctx, back, { type: "add", ingredientId: "chili" }).draft
    expect(branched.history.map((h) => h.version)).toEqual([1, 2])
  })
})

describe("context snapshot + stale detection", () => {
  it("captures the state the meal was optimized against", () => {
    const d = okDraft(buildNextMeal(ctx))
    expect(d.sessionContextSnapshot).toMatchObject({ timezone: "Asia/Singapore", localDate: "2026-10-07", goal: "fat_loss", caloriesTarget: 2200, caloriesRemaining: 520, proteinRemaining: 54, proteinTarget: 160 })
    expect(d.sessionContextSnapshot.contextVersion).toContain("2026-10-07")
  })

  it("preserves a performance goal in Nutrition Coach context", () => {
    const d = okDraft(buildNextMeal(makeCtx({ goal: "performance" })))

    expect(d.sessionContextSnapshot.goal).toBe("performance")
  })

  it("flags STALE_CONTEXT when remaining macros change materially, and supports keep/refresh", () => {
    const d = okDraft(buildNextMeal(ctx))
    const later = makeCtx({ caloriesRemaining: 300, proteinRemaining: 30 })
    expect(isStale(d.sessionContextSnapshot, later.snapshot)).toBe(true)
    const stale = assembleDraft({ ctx: later, id: d.id, family: d.family, items: d.ingredients, constraints: d.constraints, snapshot: d.sessionContextSnapshot })
    expect(stale.status).toBe("STALE_CONTEXT")
    expect(stale.notes).toContain("Your nutrition target has changed since this meal was created.")

    expect(applyDraftOp(later, stale, { type: "keep" }).draft.status).not.toBe("STALE_CONTEXT")

    const refreshed = applyDraftOp(later, stale, { type: "refresh" }).draft
    expect(refreshed.status).not.toBe("STALE_CONTEXT")
    expect(refreshed.nutrition.calories).toBeLessThanOrEqual(300)
    expect(refreshed.sessionContextSnapshot.caloriesRemaining).toBe(300)
  })

  it("ignores immaterial changes", () => {
    const a = makeCtx().snapshot
    const b = makeSnapshot({ ...a, caloriesRemaining: 500, proteinRemaining: 50 })
    expect(isStale(a, b)).toBe(false)
  })
})

describe("meal fingerprint", () => {
  it("is stable for the same meal, ignores seasonings, differs for a different meal", () => {
    expect(mealFingerprint(bowl())).toBe(mealFingerprint(bowl().reverse()))
    expect(mealFingerprint([...bowl(), { ingredientId: "lime", grams: 15 }])).toBe(mealFingerprint(bowl()))
    expect(
      mealFingerprint([
        { ingredientId: "white_fish", grams: 150 },
        { ingredientId: "rice", grams: 180 },
      ]),
    ).not.toBe(mealFingerprint(bowl()))
    expect(mealFingerprint(bowl())).toMatch(/^mfmeal:[0-9a-f]{16}$/)
  })
})

describe("validateMeal", () => {
  it("classifies tiers: hard strict ceiling, medium protein, soft budget/time", () => {
    const v = validateMeal(bowl(), constraints({ calorieCeiling: 100, calorieCeilingStrict: true, proteinTarget: 200, maxPriceSgd: 0.1, maxCookMinutes: 1 }))
    expect(Object.fromEntries(v.map((x) => [x.constraint, x.tier]))).toEqual({ calorieCeiling: "hard", protein: "medium", budget: "soft", time: "soft" })
  })
})
