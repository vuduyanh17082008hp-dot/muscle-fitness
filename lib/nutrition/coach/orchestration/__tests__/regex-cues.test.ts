import { describe, expect, it } from "vitest"
import { detectCravingKey } from "../../craving"
import { fieldOfQuestion } from "../continuation"

/** These patterns were byte-corrupted (backspace for \b, eaten \s / \w) and could never match. */
describe("repaired nutrition regex cues", () => {
  const ask = (question: string) => fieldOfQuestion({ question, affects: "calculation" })

  it.each([
    ["What is your daily calorie target?", "calorieTarget"],
    ["Which meal is this for?", "slot"],
    ["Which one do you want?", "referent"],
    ["How many grams did you eat?", "quantity"],
  ] as const)("%s → %s", (question, field) => {
    expect(ask(question)).toBe(field)
  })

  it("does not read a word that merely contains a cue", () => {
    expect(ask("Which mealtime suits you?")).not.toBe("slot")
  })

  it("real cereal is distinct from the chocolate cereal makeover", () => {
    expect(detectCravingKey("I want real coco pops")).toBe("real_cereal")
    expect(detectCravingKey("coco pops craving")).toBe("chocolate_cereal")
    expect(detectCravingKey("unreal cereal")).toBe("chocolate_cereal")
  })
})
