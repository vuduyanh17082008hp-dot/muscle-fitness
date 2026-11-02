import { describe, expect, it } from "vitest"

import { danteTurnContinuesNutrition, isVietnameseMealDiscovery, nutritionStateIsLive, nutritionTurnForMainPipeline } from "../chat"
import { applyDraftOp, assembleDraft, makeSnapshot } from "../draft"
import { classifyFollowUp } from "../followup"
import { parseCoachMessage } from "../intent"
import type { CoachContext } from "../types"

const ctx: CoachContext = {
  snapshot: makeSnapshot({ capturedAt: "2026-11-03T10:00:00.000Z", timezone: "Asia/Singapore", localDate: "2026-11-03", goal: "muscle_gain", caloriesTarget: 1990, caloriesConsumed: 390, caloriesRemaining: 1600, proteinTarget: 122, proteinConsumed: 16, proteinRemaining: 106 }),
  guards: { allergies: [], excludedFoods: [], preferredFoods: [], recentFoodNames: [] },
  cookingAbility: null,
} as CoachContext

describe("Dante unified — nutrition capability routing", () => {
  it("a train/rest question on the Nutrition page goes to Dante's main pipeline; a meal or supplement ask stays", () => {
    expect(nutritionTurnForMainPipeline({ message: "I'm really sleepy but want to train. Should I go?", coachMode: "nutrition" })).toBe(true)
    expect(nutritionTurnForMainPipeline({ message: "Change my squat program", coachMode: "nutrition" })).toBe(true)
    expect(nutritionTurnForMainPipeline({ message: "give me 3 high-protein lunch ideas", coachMode: "nutrition" })).toBe(false)
    expect(nutritionTurnForMainPipeline({ message: "do I need BCAA if I already eat enough protein?", coachMode: "nutrition" })).toBe(false)
  })

  it("live nutrition state keeps follow-ups with the nutrition capability, except a training/recovery turn or a safety signal", () => {
    const now = new Date("2026-11-03T10:00:00.000Z")
    const state = { conversation: { presented: { responseId: "r", owner: "ENGINE" as const, options: [], createdAtServer: now.toISOString(), expiresAt: "2026-11-03T10:15:00.000Z" } } }
    expect(nutritionStateIsLive(null, now)).toBe(false)
    expect(nutritionStateIsLive(state, now)).toBe(true)
    expect(danteTurnContinuesNutrition(state, { primaryDomain: "NUTRITION", safetySignal: false }, now)).toBe(true)
    expect(danteTurnContinuesNutrition(state, { primaryDomain: "UNKNOWN", safetySignal: false }, now)).toBe(true)
    expect(danteTurnContinuesNutrition(state, { primaryDomain: "TRAINING", safetySignal: false }, now)).toBe(false)
    expect(danteTurnContinuesNutrition(state, { primaryDomain: "RECOVERY", safetySignal: false }, now)).toBe(false)
    expect(danteTurnContinuesNutrition(state, { primaryDomain: "NUTRITION", safetySignal: true }, now)).toBe(false)
    expect(nutritionStateIsLive(state, new Date("2026-11-03T11:00:00.000Z"))).toBe(false)
  })

  it("a Vietnamese meal-discovery request is recognised for the router; a Vietnamese training ask is not", () => {
    expect(isVietnameseMealDiscovery("gợi ý cho mình 3 món trưa nhiều đạm")).toBe(true)
    expect(isVietnameseMealDiscovery("cho mình 3 món tối nhiều đạm")).toBe(true)
    expect(isVietnameseMealDiscovery("cho mình 3 bài tập chân")).toBe(false)
    expect(isVietnameseMealDiscovery("give me 3 dinner ideas")).toBe(false)
  })

  it("'recommend a high-protein dinner' is a meal request (it fell to the open model before)", () => {
    expect(parseCoachMessage("Recommend a high-protein dinner", { hasDraft: false }).kind).toBe("build")
  })
})

describe("lower_fat — a real engine modifier", () => {
  it("'make the second one lower in fat' targets option 2 deterministically", () => {
    expect(classifyFollowUp("make the second one lower in fat")).toEqual({ intent: "MODIFY_PREVIOUS_RESULT", args: { modifier: "lower_fat", optionIndex: 2 } })
    expect(classifyFollowUp("make option 3 lower in calories")).toEqual({ intent: "MODIFY_PREVIOUS_RESULT", args: { modifier: "lower_calories", optionIndex: 3 } })
    expect(classifyFollowUp("less fat")?.args.modifier).toBe("lower_fat")
  })

  it("swaps the fattiest ingredient for a leaner one (numbers recomputed), or says there is nothing to cut", () => {
    const draft = assembleDraft({ ctx, family: "savory_bowl", items: [{ ingredientId: "tofu", grams: 200 }, { ingredientId: "rice", grams: 180 }, { ingredientId: "broccoli", grams: 120 }], constraints: { calorieCeiling: 700, calorieCeilingStrict: false, calorieCeilingSource: "context", proteinTarget: 40, proteinTargetSource: "context", maxPriceSgd: null, maxCookMinutes: null, availableIds: null } })
    const result = applyDraftOp(ctx, draft, { type: "lower_fat" })
    expect(result.applied).toBe(true)
    expect(result.draft.nutrition.fat).toBeLessThan(draft.nutrition.fat)
    expect(result.draft.ingredients.some((item) => item.ingredientId === "tofu")).toBe(false)
    const lean = assembleDraft({ ctx, family: "savory_bowl", items: [{ ingredientId: "white_fish", grams: 150 }, { ingredientId: "broccoli", grams: 120 }], constraints: draft.constraints })
    expect(applyDraftOp(ctx, lean, { type: "lower_fat" }).applied).toBe(false)
  })
})
