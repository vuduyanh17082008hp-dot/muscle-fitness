import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { NutritionBlocks } from "@/components/nutrition/coach/coach-chat-ui"
import type { StructuredBlock } from "../followup"

const macros = { calories: 476, protein: 61, carbs: 38, fat: 9 }
const render = (blocks: StructuredBlock[]) => renderToStaticMarkup(createElement(NutritionBlocks, { blocks, disabled: false, onPick: () => undefined }))

describe("compact structured blocks (UI)", () => {
  it("renders ingredients, macros, options, proposal and clarification from typed data", () => {
    const html = render([
      { type: "INGREDIENT_LIST", mealName: "High-Protein Tuna Wrap Bowl", items: [{ name: "Tuna (canned in water)", grams: 150 }, { name: "Flour Wrap", grams: 60 }] },
      { type: "MACRO_SUMMARY", mealName: "x", macros, confidence: "HIGH" },
      { type: "OPTION_LIST", options: [{ id: "a", label: "Tuna Wrap", calories: 476, protein: 61 }, { id: "b", label: "Chicken Bowl", calories: 500, protein: 55 }] },
      { type: "MODIFICATION_PROPOSAL", mealName: "x", changes: ["Remove Rice (180 g)"], before: macros, after: { ...macros, calories: 380 }, expiresAt: "2026-10-07T10:10:00Z" },
      { type: "CLARIFICATION", question: "q", options: ["Tuna Wrap", "Chicken Bowl"] },
    ])
    expect(html).toContain("150 g")
    expect(html).toContain("476 kcal")
    expect(html).toContain("Chicken Bowl")
    expect(html).toContain("not applied yet")
    expect(html).toContain("Apply")
    expect(html).toContain("Keep as is")
  })

  it("renders nothing for no blocks and never injects HTML from block text", () => {
    expect(render([])).toBe("")
    expect(render([{ type: "CLARIFICATION", question: "q", options: ["<img src=x onerror=alert(1)>"] }])).not.toContain("<img")
  })
})
