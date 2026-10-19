import { describe, expect, it } from "vitest"

import { buildCravingDraft } from "../craving"
import { acceptedOffer, classifyConversation, detectDraftEditOffer, extractCravingFood, hasUngroundedMacros, resolveDraftReference, sensoryTargetsFor } from "../conversation"
import { makeCtx } from "./fixtures"

const built = buildCravingDraft(makeCtx(), "chocolate_cereal")
if (built.status !== "OK") throw new Error("fixture")
const draft = built.draft
const resolve = (message: string, handoff: Parameters<typeof resolveDraftReference>[2] = null) => resolveDraftReference(message, draft, handoff)

describe("reference resolution", () => {
  it("binds the draft only on meal-reference + edit evidence", () => {
    expect(resolve("Make this bowl under 400 calories.").bound).toBe(true)
    expect(resolve("Add more protein to this.").bound).toBe(true)
    expect(resolve("Make this meal sweeter").bound).toBe(true)
    expect(resolve("Reduce the whey.").via).toBe("ingredient")
    expect(resolve("Swap the whey in this bowl.").bound).toBe(true)
  })

  it("does not bind on a bare 'this' or on a new topic", () => {
    for (const message of ["This sounds good, but I'm craving pizza.", "This isn't what I want. Give me something sweet.", "What should I eat for dinner?", "I want something salty.", "Is Greek yogurt good for cutting?"]) {
      expect(resolve(message).bound).toBe(false)
    }
    expect(resolve("The whey is boring today.").bound).toBe(false)
  })

  it("binds via handoff only for an affirmation or edit, and never without a handoff", () => {
    expect(resolve("Yes.", { offer: null }).bound).toBe(true)
    expect(resolve("Maybe later.", { offer: null }).bound).toBe(false)
    expect(resolve("Yes.").bound).toBe(false)
    expect(acceptedOffer("yes", { offer: "cheaper" })).toEqual({ type: "cheaper" })
    expect(acceptedOffer("yes", null)).toBeNull()
  })
})

describe("handoff offers come only from the assistant's own question", () => {
  it("detects specific and generic draft-edit questions", () => {
    expect(detectDraftEditOffer("Looks good. Want me to make this meal cheaper?", true)).toEqual({ offer: "cheaper" })
    expect(detectDraftEditOffer("What would you like to change?", true)).toEqual({ offer: null })
  })
  it("expires on statements, unrelated questions, and when no draft exists", () => {
    expect(detectDraftEditOffer("Greek yogurt is fine when cutting.", true)).toBeNull()
    expect(detectDraftEditOffer("Do you like crunchy foods?", true)).toBeNull()
    expect(detectDraftEditOffer("Want me to make this meal cheaper?", false)).toBeNull()
  })
})

describe("topic + classification", () => {
  it("extracts the craving food and sensory targets", () => {
    expect(extractCravingFood("I'm craving some Coco Pops, what should I eat to stay on track?")).toBe("Coco Pops")
    expect(sensoryTargetsFor("I'm craving coco pops and a sweet tooth", "Coco Pops")).toEqual(["chocolate", "sweet", "crunchy"])
  })

  it("keeps preference signals explicit and session-scoped; ignores references to the draft", () => {
    const state = { currentTopic: null, pendingMealBuild: null }
    const reference = resolve("I love crunchy food")
    expect(classifyConversation("I love crunchy food", { reference, state })).toMatchObject({ intent: "PREFERENCE_UPDATE", signals: [{ kind: "PREFERRED_TEXTURE", strength: "EXPLICIT", scope: "SESSION" }] })
    expect(classifyConversation("I always crave cereal at night", { reference, state })).toMatchObject({ signals: [{ kind: "CRAVING_PATTERN", context: "night" }] })
    expect(classifyConversation("I hate this", { reference, state })).toBeNull()
  })
})

describe("macro provenance", () => {
  it("flags macro numbers that did not come from structured data", () => {
    expect(hasUngroundedMacros("About 290 calories and 9g protein.", [368, 35])).toBe(true)
    expect(hasUngroundedMacros("It has 368 kcal and 35g protein.", [368, 35])).toBe(false)
    expect(hasUngroundedMacros("Keep a measured portion of the real cereal.", [])).toBe(false)
  })
})
