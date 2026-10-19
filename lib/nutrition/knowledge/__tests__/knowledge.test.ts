import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { fitnessGoalValues } from "@/features/onboarding/schema"

import { loadKnowledgeChunks, loadKnowledgeCorpus, loadPolicyDocuments } from "../load"
import { chunkDocument, KnowledgeParseError, MIN_CHUNK_CHARS, parseKnowledgeDocument, parsePolicyDocument } from "../parse"
import { KNOWLEDGE_CATEGORIES } from "../types"

const corpus = loadKnowledgeCorpus()
const policies = loadPolicyDocuments()
const byId = (id: string) => corpus.find((d) => d.metadata.id === id)!

const VALID = `---
id: nutrition.test.doc
title: Test
domain: nutrition
category: principle
tags: [a]
authority: mf_curated
confidence: curated
risk: low
updatedAt: 2026-10-09
---

# Test

## First section
${"Some reasonable content for the first section of the test document. ".repeat(3)}

## Second section
${"More reasonable content for the second section of the test document. ".repeat(3)}
`
const withField = (field: string, from: string, to: string) => VALID.replace(`${field}: ${from}`, `${field}: ${to}`)

describe("corpus", () => {
  it("loads all 15 nutrition docs", () => {
    expect(corpus).toHaveLength(15)
  })

  it("every doc has valid metadata and unique ids", () => {
    const ids = corpus.map((d) => d.metadata.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of corpus) {
      expect(d.metadata.domain).toBe("nutrition")
      expect(KNOWLEDGE_CATEGORIES).toContain(d.metadata.category)
      expect(d.metadata.authority).not.toBe("policy")
      expect(d.metadata.tags.length).toBeGreaterThan(0)
      expect(Number.isNaN(Date.parse(d.metadata.updatedAt))).toBe(false)
      expect(d.sections.length).toBeGreaterThan(0)
    }
  })

  it("loads the 5 policy docs separately and keeps them out of the corpus", () => {
    expect(policies).toHaveLength(5)
    for (const p of policies) {
      expect(p.kind).toBe("policy")
      expect(p.metadata.authority).toBe("policy")
      expect(p.path.startsWith("knowledge/policy") || p.path.startsWith("policy/")).toBe(true)
    }
    const policyIds = new Set(policies.map((p) => p.metadata.id))
    expect(corpus.some((d) => policyIds.has(d.metadata.id) || d.path.startsWith("policy/"))).toBe(false)
    expect(loadKnowledgeChunks().some((c) => policyIds.has(c.documentId))).toBe(false)
  })

  it("goal tags use the app's fitness goal values (absent = applies to every goal)", () => {
    for (const d of corpus) for (const g of d.metadata.goals ?? []) expect(fitnessGoalValues, d.path).toContain(g)
  })

  it("carries the expected metadata", () => {
    expect(byId("nutrition.cuisine.singapore_hawker").metadata.locale).toBe("SG")
    const cereal = byId("nutrition.craving.cereal").metadata
    expect(cereal.category).toBe("craving")
    expect(cereal.sensoryTargets).toEqual(expect.arrayContaining(["sweet", "crunchy", "cold"]))
  })
})

describe("parser", () => {
  it("parses a valid document, including BOM + CRLF files", () => {
    expect(parseKnowledgeDocument("x.md", VALID).metadata.id).toBe("nutrition.test.doc")
    expect(parseKnowledgeDocument("x.md", `\uFEFF${VALID.replace(/\n/g, "\r\n")}`).sections).toHaveLength(2)
  })

  it("rejects malformed frontmatter", () => {
    expect(() => parseKnowledgeDocument("x.md", "# no frontmatter\n## A\ntext")).toThrow(KnowledgeParseError)
    expect(() => parseKnowledgeDocument("x.md", VALID.replace("tags: [a]", "this is not a key value"))).toThrow(/malformed/)
  })

  it("rejects invalid enum values and bad dates", () => {
    expect(() => parseKnowledgeDocument("x.md", withField("category", "principle", "nonsense"))).toThrow(/category/)
    expect(() => parseKnowledgeDocument("x.md", withField("confidence", "curated", "certain"))).toThrow(/confidence/)
    expect(() => parseKnowledgeDocument("x.md", withField("risk", "low", "extreme"))).toThrow(/risk/)
    expect(() => parseKnowledgeDocument("x.md", withField("updatedAt", "2026-10-09", "2026-13-45"))).toThrow(/updatedAt/)
  })

  it("rejects empty tags, unknown fields, and domain mismatch", () => {
    expect(() => parseKnowledgeDocument("x.md", withField("tags", "[a]", "[]"))).toThrow(/tag/)
    expect(() => parseKnowledgeDocument("x.md", VALID.replace("risk: low", "risk: low\nextra: 1"))).toThrow()
    expect(() => parseKnowledgeDocument("x.md", withField("domain", "nutrition", "fitness"))).toThrow(/domain/)
  })

  it("refuses the policy authority on ordinary knowledge", () => {
    expect(() => parseKnowledgeDocument("x.md", withField("authority", "mf_curated", "policy"))).toThrow(/reserved/)
  })

  it("rejects duplicate ids at load time", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-"))
    fs.mkdirSync(`${dir}/nutrition`)
    fs.writeFileSync(`${dir}/nutrition/a.md`, VALID)
    fs.writeFileSync(`${dir}/nutrition/b.md`, VALID)
    expect(() => loadKnowledgeCorpus(dir)).toThrow(/duplicate id/)
  })

  it("parses policy docs with the policy schema only", () => {
    expect(() => parsePolicyDocument("p.md", VALID)).toThrow(KnowledgeParseError)
  })
})

describe("chunker", () => {
  it("chunks fried_chicken_makeovers by heading with deterministic ids", () => {
    const doc = byId("nutrition.food_makeovers.fried_chicken")
    const chunks = chunkDocument(doc)
    const headings = chunks.map((c) => c.heading)
    expect(headings).toEqual(expect.arrayContaining(["Core goal", "Sensory targets", "Main calorie drivers", "High-leverage strategies", "Coach decision rules", "Do not claim"]))
    expect(chunks.map((c) => c.id)).toContain("nutrition.food_makeovers.fried_chicken::sensory-targets")
    expect(chunkDocument(doc).map((c) => c.id)).toEqual(chunks.map((c) => c.id))
  })

  it("every chunk id is unique, inherits metadata, and is not tiny", () => {
    const chunks = loadKnowledgeChunks()
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length)
    for (const c of chunks) {
      expect(c.metadata.id).toBe(c.documentId)
      expect(c.content.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS)
      expect(c.content).not.toMatch(/^---\s*$/m) // no frontmatter leaked into content
    }
  })

  it("splits oversized sections on ### and merges tiny ones", () => {
    const big = `${"Intro line of reasonable length for the oversized section here. ".repeat(2)}\n### Part A\n${"a".repeat(1000)}\n### Part B\n${"b".repeat(1000)}`
    const doc = parseKnowledgeDocument("x.md", `${VALID.split("## First")[0]}## Big\n${big}\n\n## Tiny\nshort\n`)
    const chunks = chunkDocument(doc)
    expect(chunks.map((c) => c.heading)).toEqual(expect.arrayContaining(["Big / Part A", "Big / Part B"]))
    expect(chunks.some((c) => c.heading === "Tiny")).toBe(false)
  })
})

describe("macro truth guard", () => {
  // Knowledge teaches strategy; exact nutrition numbers live in structured data.
  // [name, pattern, a claim it must catch]
  const patterns: [string, RegExp, string][] = [
    ["calorie figure", /\b\d[\d,.]*[\s-]*(kcal|calories?|cals?)\b/i, "a 100-calorie snack"],
    ["gram macro figure", /\b\d+(\.\d+)?\s*g(rams?)?\s*(of\s+)?(protein|carbs?|carbohydrates?|fat)\b/i, "about 30g of protein"],
    ["per-bodyweight figure", /\b\d+(\.\d+)?\s*g\s*(\/|per)\s*kg\b/i, "eat 1.6 g/kg daily"],
    ["'exactly N'", /\bexactly\s+\d/i, "it has exactly 12"],
    ["'contains N'", /\bcontains?\s+(about\s+)?\d+\s*(kcal|cal|g)\b/i, "contains 40g"],
  ]
  it.each(patterns)("no knowledge or policy doc contains a %s", (_name, re) => {
    for (const d of [...corpus, ...policies]) expect(d.content, d.path).not.toMatch(re)
  })

  it.each(patterns)("the %s guard catches a claim", (_name, re, claim) => {
    expect(claim).toMatch(re)
  })

  it("the guard leaves ordinary coaching text alone", () => {
    const harmless = "Offer two or three approaches, 1 or 2 changes, 3 meals a day, a 5-minute prep, 2 eggs, a 1 kg bag."
    for (const [, re] of patterns) expect(harmless).not.toMatch(re)
  })
})
