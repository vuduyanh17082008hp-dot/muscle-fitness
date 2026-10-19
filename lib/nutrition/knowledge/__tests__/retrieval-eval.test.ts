import { describe, expect, it } from "vitest"

import { decideMealBuildKnowledgeNeed } from "../need"
import { run } from "./helpers"

describe("knowledge need gate — must NOT retrieve", () => {
  it.each([
    ["A. macro lookup", "How much protein is in 150g chicken?"],
    ["B. draft edit (calories)", "Make this bowl under 400 calories."],
    ["B2. draft edit (remove)", "Remove the rice."],
    ["C. log", "Log this meal."],
    ["remaining macros", "How many calories do I have left?"],
    ["D. preference", "I hate Greek yogurt."],
    ["exact lookup with no grams", "How many calories are in fried chicken?"],
  ])("%s", (_name, message) => {
    const { need, context } = run(message)
    expect(need).toMatchObject({ needed: false, reason: "NOT_NEEDED" })
    expect(context).toBeNull()
  })

  it("trusts the N1.5 intent over the wording", () => {
    for (const intent of ["EDIT_ACTIVE_DRAFT", "LOG_MEAL", "MACRO_CALCULATION", "PREFERENCE_UPDATE", "RESET_CONTEXT", "NEW_MEAL_REQUEST"] as const) {
      expect(run("I'm craving fried chicken", { intent }).need.needed).toBe(false)
    }
  })
})

describe("knowledge need gate — should retrieve", () => {
  it.each([
    ["I'm craving fried chicken while cutting.", "CRAVING"],
    ["I want something Vietnamese tonight.", "CUISINE"],
    ["How can I make this cereal bowl taste better?", "FLAVOR_TEXTURE"],
    ["I want fast food but don't want to blow my calories.", "FOOD_MAKEOVER"],
    ["What can I eat that's crunchy and high protein?", "FLAVOR_TEXTURE"],
    ["Is cereal bad for cutting?", "GENERAL_NUTRITION"],
    ["I'm craving Coco Pops.", "CRAVING"],
    ["What should I get at a hawker centre?", "CUISINE"],
    ["How can I make this meal crunchier?", "FLAVOR_TEXTURE"],
  ])("%s -> %s", (message, reason) => {
    const { need, context } = run(message)
    expect(need).toMatchObject({ needed: true, reason })
    expect(context).not.toBeNull()
  })

  it("explicit meal builds retrieve only for a named cuisine or sensory target", () => {
    for (const m of ["I want a Vietnamese high-protein dinner.", "Can you help me decide on a Vietnamese high-protein dinner?", "I want a Vietnamese meal with lots of protein."]) {
      expect(decideMealBuildKnowledgeNeed(m)).toMatchObject({ needed: true, reason: "CUISINE" })
    }
    expect(decideMealBuildKnowledgeNeed("Build me something crunchy for lunch")).toMatchObject({ needed: true, reason: "FLAVOR_TEXTURE" })
    for (const m of ["Build my next meal", "Build dinner under 500 calories and high protein.", "Build a protein-rich dinner"]) {
      expect(decideMealBuildKnowledgeNeed(m).needed).toBe(false)
    }
  })

  it("hawker strategy retrieves as CUISINE or STRATEGY", () => {
    expect(["CUISINE", "STRATEGY"]).toContain(run("How should I approach hawker food while cutting?").need.reason)
  })
})

describe("retrieval matrix", () => {
  it("E. Coco Pops craving ranks cereal craving + makeover knowledge first", () => {
    const { docs, query } = run("I'm craving Coco Pops.")
    expect(query.foodTypes).toEqual(["cereal"])
    expect(docs.slice(0, 2).every((d) => d.endsWith("cereal"))).toBe(true)
    expect(docs).toContain("craving.cereal")
  })

  it("F. fried chicken while cutting: makeover + fat-loss context, ranked on fried chicken", () => {
    const { docs, query } = run("I'm craving fried chicken while cutting.")
    expect(query.goal).toBe("fat_loss")
    expect(docs[0]).toBe("food_makeovers.fried_chicken")
    expect(docs).toContain("goal.fat_loss")
  })

  it("G. Vietnamese dinner: Vietnamese dominates; other cuisines are not retrieved", () => {
    const { docs } = run("I want a Vietnamese high-protein dinner.")
    expect(docs[0]).toBe("cuisine.vietnamese")
    expect(docs.filter((d) => d.startsWith("cuisine.") && d !== "cuisine.vietnamese")).toEqual([])
  })

  it("H. hawker centre: Singapore hawker ranks first", () => {
    expect(run("What should I eat at a hawker centre tonight?").docs[0]).toBe("cuisine.singapore_hawker")
  })

  it("I. 'crispy' normalizes toward 'crunchy'", () => {
    const { query, docs } = run("I'm craving something crispy.")
    expect(query.sensoryTargets).toContain("crunchy")
    expect(docs.length).toBeGreaterThan(0)
  })

  it("J. 'frozen and creamy': frozen -> cold, creamy kept, texture + ice cream knowledge", () => {
    const { query, docs } = run("I want something frozen and creamy.")
    expect(query.sensoryTargets).toEqual(expect.arrayContaining(["cold", "creamy"]))
    expect(docs).toEqual(expect.arrayContaining(["flavor_texture.texture_hacks", "craving.ice_cream"]))
  })
})
