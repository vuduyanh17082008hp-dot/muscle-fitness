import { describe, expect, it } from "vitest"

import { detectLanguage, parseOptions, parseSelection, resolveConversationContext } from "../context"
import type { RecentMessage } from "../types"

const OFFER = "Wanting donuts is completely fair. Want me to fit the donuts into what you have left today?"
const OPTIONS = "Here are three ideas:\nOption A: Greek yogurt bowl with berries\nOption B: Protein baked donut\nOption C: Cottage cheese toast"

const donutThread: RecentMessage[] = [
  { role: "user", text: "I'm really craving some donuts, but I still want to stay in shape." },
  { role: "coach", text: OFFER },
]

describe("A. 'yes' resolves the prior offer", () => {
  it("binds a bare yes to the immediately preceding coach offer and the food it names", () => {
    const context = resolveConversationContext("yes", [...donutThread, { role: "user", text: "yes" }])
    expect(context.isAffirmation).toBe(true)
    expect(context.isShortFollowUp).toBe(true)
    expect(context.lastAssistantOffer).toContain("fit the donuts")
    expect(context.referencedFoods).toContain("donuts")
  })

  it("does not echo the current message back as history (the panel appends it)", () => {
    const context = resolveConversationContext("yes", [...donutThread, { role: "user", text: "yes" }])
    expect(context.turns.map((t) => t.text)).not.toContain("yes")
    expect(context.turns).toHaveLength(2)
  })

  it("an offer expires after one user turn", () => {
    const later: RecentMessage[] = [...donutThread, { role: "user", text: "how much protein in chicken?" }, { role: "coach", text: "Chicken breast is lean and high in protein." }]
    expect(resolveConversationContext("yes", later).lastAssistantOffer).toBeNull()
  })
})

describe("B/C. options and the current referent", () => {
  const thread: RecentMessage[] = [{ role: "user", text: "give me a sweet high protein idea" }, { role: "coach", text: OPTIONS }]

  it("parses presented options", () => {
    expect(parseOptions(OPTIONS).map((o) => o.label)).toEqual(["A", "B", "C"])
    expect(parseOptions("1. Rice bowl\n2. Noodle soup")).toHaveLength(2)
    expect(parseOptions("Just one idea: oats.")).toHaveLength(0)
  })

  it.each([
    ["the second one", "B"],
    ["option B", "B"],
    ["B", "B"],
    ["the first one", "A"],
    ["the last one", "C"],
    ["cái thứ 2", "B"],
    ["option 3 đi", "C"],
  ])("'%s' selects %s", (text, label) => {
    expect(parseSelection(text, parseOptions(OPTIONS))?.label).toBe(label)
  })

  it("does not treat quantities or long sentences as a selection", () => {
    const options = parseOptions(OPTIONS)
    expect(parseSelection("make it 2 donuts", options)).toBeNull()
    expect(parseSelection("I think the second one might work but I am not sure about it today", options)).toBeNull()
  })

  it("keeps the chosen option as the referent for a later 'make it lower calorie'", () => {
    const recent: RecentMessage[] = [...thread, { role: "user", text: "the second one" }, { role: "coach", text: "Option B it is: a protein baked donut." }]
    const context = resolveConversationContext("make it lower calorie", [...recent, { role: "user", text: "make it lower calorie" }])
    expect(context.selectedOption?.label).toBe("B")
    expect(context.pronounEdit).toBe(true)
    expect(context.referentCandidates).toEqual([])
  })
})

describe("D. explicit correction overrides inference", () => {
  const thread: RecentMessage[] = [{ role: "user", text: "what should I eat for lunch?" }, { role: "coach", text: "A chicken rice bowl works well for lunch." }]

  it("detects the correction and replaces the earlier meal slot", () => {
    const context = resolveConversationContext("No, I meant dinner.", thread)
    expect(context.correction).not.toBeNull()
    expect(context.mealSlot).toBe("dinner")
    expect(context.activeConstraints).toContain("meal:dinner")
    expect(context.activeConstraints).not.toContain("meal:lunch")
  })

  it("a correction without a new slot drops the stale inferred slot instead of keeping it", () => {
    const context = resolveConversationContext("sorry, I meant something else", thread)
    expect(context.correction).not.toBeNull()
    expect(context.mealSlot).toBeNull()
  })

  it("detects Vietnamese corrections", () => {
    expect(resolveConversationContext("không phải bữa trưa, ý mình là bữa tối", thread).mealSlot).toBe("dinner")
  })
})

describe("E. ambiguity evidence", () => {
  it("flags a bare pronoun edit with several unselected options", () => {
    const recent: RecentMessage[] = [{ role: "coach", text: OPTIONS }]
    const context = resolveConversationContext("make it bigger", recent)
    expect(context.pronounEdit).toBe(true)
    expect(context.referentCandidates).toEqual(["A", "B", "C"])
  })
})

describe("F. current message beats stale context", () => {
  it("never reads beyond the bounded window and supersedes old foods when the user changes subject", () => {
    const old: RecentMessage[] = [
      { role: "user", text: "I'm craving donuts" },
      { role: "coach", text: OFFER },
      { role: "user", text: "ok" },
      { role: "coach", text: "Noted." },
      { role: "user", text: "tell me about meal timing" },
      { role: "coach", text: "Spread protein across the day." },
    ]
    const context = resolveConversationContext("I'm craving pizza now", old)
    expect(context.referencedFoods).toEqual(["pizza"])
    expect(context.isShortFollowUp).toBe(false)
    expect(context.lastAssistantOffer).toBeNull()
  })

  it("old foods outside the fresh window are dropped even for a short follow-up", () => {
    const old: RecentMessage[] = [
      { role: "user", text: "I'm craving pizza" },
      { role: "coach", text: "Pizza is fair." },
      { role: "user", text: "ok" },
      { role: "coach", text: "Sure." },
      { role: "user", text: "ok" },
      { role: "coach", text: "Anything else?" },
    ]
    expect(resolveConversationContext("why?", old).referencedFoods).not.toContain("pizza")
  })
})

describe("L/M. Vietnamese and mixed continuity", () => {
  const viOffer: RecentMessage[] = [
    { role: "user", text: "mình thèm bánh donut quá" },
    { role: "coach", text: "Thèm donut là bình thường. Bạn có muốn mình tính xem donut vừa với lượng macro còn lại hôm nay không?" },
  ]

  it("resolves a Vietnamese 'ừ' to the Vietnamese offer", () => {
    const context = resolveConversationContext("ừ", viOffer)
    expect(context.isAffirmation).toBe(true)
    expect(context.lastAssistantOffer).toContain("muốn mình")
    expect(context.language).toBe("vi")
  })

  it.each(["làm đi", "được", "ok luôn", "đồng ý"])("treats '%s' as an affirmation", (text) => {
    expect(resolveConversationContext(text, viOffer).isAffirmation).toBe(true)
  })

  it("keeps mixed VN/EN as mixed and still resolves the offer", () => {
    const context = resolveConversationContext("ừ fit it in đi", viOffer)
    expect(context.language).toBe("mixed")
    expect(context.isShortFollowUp).toBe(true)
    expect(context.lastAssistantOffer).not.toBeNull()
  })

  it("a bare 'ok' inherits the language of the prior user turn", () => {
    expect(resolveConversationContext("ok", viOffer).language).toBe("vi")
  })

  it("detects languages", () => {
    expect(detectLanguage("I want something sweet")).toBe("en")
    expect(detectLanguage("mình muốn ăn món ngọt")).toBe("vi")
    expect(detectLanguage("mình muốn something sweet high protein")).toBe("mixed")
  })

  it("selects an option with a Vietnamese ordinal", () => {
    const recent: RecentMessage[] = [{ role: "coach", text: OPTIONS }]
    expect(resolveConversationContext("cái thứ 2 đi", recent).selectedOption?.label).toBe("B")
  })
})

describe("constraints and amounts", () => {
  it("extracts bounded constraints and amounts from the current message", () => {
    const context = resolveConversationContext("a dinner under 600 calories without milk, 200g chicken", [])
    expect(context.activeConstraints).toEqual(expect.arrayContaining(["meal:dinner", "max_kcal:600", "without:milk"]))
    expect(context.referencedAmounts).toContain("200g")
  })
})
