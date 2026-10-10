import { describe, expect, it, vi } from "vitest"

import { decideNutritionKnowledgeNeed, inUncertainBand } from "../need"
import { buildKnowledgeQuery } from "../query"
import { buildSemanticGatePrompt, parseSemanticGate, resolveUncertainNeed, semanticOutputToDecision } from "../semantic-gate"

const layer1 = (message: string) => decideNutritionKnowledgeNeed({ message })
const reply = (r: string | null) => vi.fn(async () => (r === null ? null : { reply: r }))
const YES = (extra = "") => `{"needsKnowledge":true,"category":"flavor_texture"${extra}}`
const silent = { log: () => {}, configured: () => true }

describe("Layer 1: confident vs uncertain", () => {
  it("obvious YES is decided deterministically (no semantic gate needed)", () => {
    for (const m of ["I'm craving fried chicken.", "I want Vietnamese food.", "What should I order at a hawker centre?"]) {
      const d = layer1(m)
      expect(d.needed).toBe(true)
      expect(d.uncertain).toBeUndefined()
    }
  })

  it("obvious NO is a confident NO and never reaches a model", () => {
    for (const m of ["How many calories do I have left?", "Show me the macros.", "Remove the rice.", "Log this meal.", "Make this under 400 calories.", "How much protein is in this?", "I hate Greek yogurt.", "Add chicken.", "Make it cheaper.", "How many grams of rice?", "What did I eat earlier?", "Is this 400 calories?", "Thanks!", "hi"]) {
      const d = layer1(m)
      expect(d, m).toMatchObject({ needed: false })
      expect(d.uncertain, m).toBeUndefined()
    }
  })

  it("qualitative / advisory wording with no deterministic signal is UNCERTAIN, not guessed", () => {
    for (const m of ["This tastes kind of flat.", "Can we give this more bite?", "It feels kinda one-note, lacks depth.", "I feel awful after dinner.", "Bring on the pho tonight."]) {
      expect(layer1(m), m).toMatchObject({ needed: false, uncertain: true })
    }
  })

  it("the band is bounded: very short, very long and plain statements stay confident NO", () => {
    expect(inUncertainBand("ok cool")).toBe(false)
    expect(inUncertainBand("flat flat")).toBe(false)
    expect(inUncertainBand(`I feel ${"really ".repeat(50)}tired`)).toBe(false)
    expect(inUncertainBand("my name is Sam")).toBe(false)
  })

  it("Vietnamese (which the English cues cannot read) is routed to Layer 2, but never given a YES by Layer 1", () => {
    expect(layer1("Món này nhạt quá, thêm vị gì đây?")).toMatchObject({ needed: false, uncertain: true })
  })
})

describe("R3 Layer 1: wider uncertain band, still bounded and still no YES", () => {
  const unc = (m: string) => layer1(m)
  it("routes advice-shaped questions with no food word, provenance talk and unaccented Vietnamese to Layer 2", () => {
    for (const m of ["is the protein in that dish verified or a guess", "I don't remember exactly how much I had at lunch", "how much should I trust the calorie number you gave", "sambal on the side, does that actually make a difference", "an thit nuong hoai ko dc, lam sao"]) {
      expect(unc(m), m).toMatchObject({ needed: false, uncertain: true })
    }
  })

  it("keeps lookups, edits, preference / goal statements, log actions and chat about the assistant out of the band", () => {
    for (const m of ["how much protein is in this?", "protein content of the tuna?", "which of these two meals has more protein?", "cheaper protein swap for the chicken", "my goal is lean bulk from now on", "spicy is fine by me, I like it hot", "greek yoghurt is disgusting to me", "ăn xong bữa hawker rồi, mark done giúp", "yo, what u capable of?", "who are you", "remove the rice and log it"]) {
      const d = unc(m)
      expect(d.uncertain, m).toBeUndefined()
      expect(d.needed, m).toBe(false)
    }
  })

  it("a preference sentence that also asks something is not swallowed by the statement guard", () => {
    expect(unc("I love heat, does chilli actually help me eat less")).toMatchObject({ needed: true, reason: "FLAVOR_TEXTURE" })
    expect(unc("I like noodles with some bounce, which kind keeps me full longer")).toMatchObject({ needed: false, uncertain: true })
  })

  it("a goal word with a real question is still a deterministic strategy YES", () => {
    expect(unc("how should I eat while cutting?")).toMatchObject({ needed: true, reason: "STRATEGY" })
  })
})

describe("Layer 2: strict parsing", () => {
  it("accepts the closed schema", () => {
    expect(parseSemanticGate(YES(',"sensory":["crunchy"],"cuisine":[],"food":[]'))).toMatchObject({ needsKnowledge: true, category: "flavor_texture", sensory: ["crunchy"] })
    expect(parseSemanticGate('Sure! {"needsKnowledge":false,"category":"none"}')).toMatchObject({ needsKnowledge: false })
  })

  it("rejects malformed output deterministically", () => {
    for (const bad of [null, undefined, "", "no json here", "{", '{"needsKnowledge":"yes","category":"craving"}', '{"needsKnowledge":true}', '{"category":"craving"}']) {
      expect(parseSemanticGate(bad as string), String(bad)).toBeNull()
    }
  })

  // R3: a model that appends a stray brace or invents one facet value used to lose the whole reply (R2 lost ~10 of 125 DEV replies that way).
  it("salvages a reply with a stray trailing brace, prose around it, an unknown key, or hallucinated facet values", () => {
    expect(parseSemanticGate(`${YES(',"sensory":["crunchy"]')}}`)).toMatchObject({ category: "flavor_texture", sensory: ["crunchy"] })
    expect(parseSemanticGate(`Here you go: ${YES()} Hope that helps {x}`)).toMatchObject({ needsKnowledge: true })
    expect(parseSemanticGate(YES(',"extra":1'))).toMatchObject({ needsKnowledge: true })
    expect(parseSemanticGate(YES(',"sensory":["salty-ish","crunchy"],"cuisine":["thai"],"food":["pizza"],"topics":["protein","astrology"]'))).toMatchObject({ sensory: ["crunchy"], cuisine: [], food: [], topics: ["protein"] })
    expect(parseSemanticGate(YES(',"sensory":["crunchy","creamy","cold"],"topics":["protein","satiety","adherence","sauces"]'))).toMatchObject({ sensory: ["crunchy", "creamy"], topics: ["protein", "satiety", "adherence"] })
    expect(parseSemanticGate(YES(',"topics":"protein"'))).toBeNull()
  })

  it("keeps only a goal the corpus has a document for, and a braces-in-string reply parses", () => {
    expect(parseSemanticGate(YES(',"goal":"fat_loss"'))?.goal).toBe("fat_loss")
    expect(parseSemanticGate(YES(',"goal":"maintenance"'))?.goal).toBeUndefined()
    expect(parseSemanticGate(YES(',"goal":null'))?.goal).toBeUndefined()
    expect(parseSemanticGate('{"needsKnowledge":true,"category":"coaching","note":"a } in a string","topics":["coaching_tone"]}')).toMatchObject({ topics: ["coaching_tone"] })
  })

  it("rejects an unsupported category and an inconsistent yes+none", () => {
    expect(parseSemanticGate('{"needsKnowledge":true,"category":"supplements"}')).toBeNull()
    expect(parseSemanticGate('{"needsKnowledge":true,"category":"none"}')).toBeNull()
  })

  it("maps categories onto the corpus-backed reasons only", () => {
    expect(semanticOutputToDecision({ needsKnowledge: true, category: "goal_strategy" })).toMatchObject({ needed: true, reason: "STRATEGY", source: "semantic" })
    expect(semanticOutputToDecision({ needsKnowledge: true, category: "coaching" })).toMatchObject({ reason: "COACHING" })
    expect(semanticOutputToDecision({ needsKnowledge: false, category: "none" })).toMatchObject({ needed: false, reason: "NOT_NEEDED" })
  })

  it("R3: general_nutrition is a servable reason, and topics / stated goal ride along as retrieval hints only", () => {
    const d = semanticOutputToDecision({ needsKnowledge: true, category: "general_nutrition", topics: ["estimate_confidence"], goal: "fat_loss" })
    expect(d).toMatchObject({ needed: true, reason: "GENERAL_NUTRITION", source: "semantic" })
    expect(d.hints).toMatchObject({ topics: ["estimate_confidence"], goal: "fat_loss" })
    // the closed intent is not an action: nothing in the decision can mutate, log or select
    expect(Object.keys(d).sort()).toEqual(["confidence", "hints", "needed", "rationale", "reason", "source"])
  })

  it("sensory hints only ride along for sensory-type categories, and become retrieval terms", () => {
    expect(semanticOutputToDecision({ needsKnowledge: true, category: "coaching", sensory: ["crunchy"] }).hints?.sensory).toBeUndefined()
    const d = semanticOutputToDecision({ needsKnowledge: true, category: "flavor_texture", sensory: ["crunchy"], cuisine: ["vietnamese"] })
    const q = buildKnowledgeQuery({ message: "Can we give this more bite?", reason: d.reason, hints: d.hints })
    expect(q.sensoryTargets).toContain("crunchy")
    expect(q.query).toContain("crunch")
    expect(q.cuisines).toEqual(["vietnamese"])
  })
})

describe("Layer 2: resolveUncertainNeed", () => {
  const flat = layer1("This tastes kind of flat.")

  it("does not call the model for a confident decision", async () => {
    const call = reply(YES())
    expect(await resolveUncertainNeed("Log this meal.", layer1("Log this meal."), { ...silent, call })).toMatchObject({ needed: false })
    expect(await resolveUncertainNeed("I'm craving fried chicken.", layer1("I'm craving fried chicken."), { ...silent, call })).toMatchObject({ needed: true })
    expect(call).not.toHaveBeenCalled()
  })

  it("semantic YES: exactly one call, retrieve", async () => {
    const call = reply(YES(',"sensory":[]'))
    const d = await resolveUncertainNeed("This tastes kind of flat.", flat, { ...silent, call })
    expect(call).toHaveBeenCalledTimes(1)
    expect(d).toMatchObject({ needed: true, reason: "FLAVOR_TEXTURE", source: "semantic" })
  })

  it("semantic NO: exactly one call, no retrieval", async () => {
    const call = reply('{"needsKnowledge":false,"category":"none"}')
    expect(await resolveUncertainNeed("This tastes kind of flat.", flat, { ...silent, call })).toMatchObject({ needed: false, source: "semantic" })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("falls back to the Layer-1 decision on malformed output, unsupported category, provider failure, null, timeout and missing key", async () => {
    const cases: Array<[string, Parameters<typeof resolveUncertainNeed>[2]]> = [
      ["malformed", { ...silent, call: reply("flat is a vibe") }],
      ["unsupported", { ...silent, call: reply('{"needsKnowledge":true,"category":"supplements"}') }],
      [
        "throws",
        {
          ...silent,
          call: vi.fn(async () => {
            throw new Error("boom")
          }),
        },
      ],
      ["null", { ...silent, call: reply(null) }],
      ["timeout", { ...silent, timeoutMs: 20, call: () => new Promise(() => {}) }],
      ["not configured", { ...silent, configured: () => false, call: reply(YES()) }],
    ]
    for (const [name, deps] of cases) expect(await resolveUncertainNeed("This tastes kind of flat.", flat, deps), name).toBe(flat)
  })

  it("the prompt carries only the (bounded) message: no profile, history or meal data", () => {
    const p = buildSemanticGatePrompt(`flat ${"x".repeat(1000)}`)
    expect(p.length).toBeLessThan(6500)
    expect(p).not.toMatch(/activeMealDraft|CONTEXT:|RECENT CONVERSATION|snapshot/i)
    expect(p).toContain('"needsKnowledge"')
  })

  it("logs structure only (outcome, category, latency), never the message", async () => {
    const log = vi.fn()
    await resolveUncertainNeed("This tastes kind of flat zebra", flat, { configured: () => true, log, call: reply(YES()) })
    expect(JSON.stringify(log.mock.calls)).not.toContain("zebra")
    expect(log.mock.calls[0][0]).toMatchObject({ layer: "semantic", outcome: "yes", category: "flavor_texture" })
  })
})
