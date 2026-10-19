import type { IndexedKnowledgeChunk, NutritionKnowledgeChunk } from "./types"

/**
 * Small deterministic vocabulary expansion for retrieval ONLY. It adds
 * canonical concept terms next to what the user said; it never rewrites the
 * message, so the agent keeps talking about "Coco Pops", not "cereal".
 */

export type ConceptKind = "sensory" | "cuisine" | "food" | "goal"

const CONCEPTS: Array<[ConceptKind, string, string[]]> = [
  ["sensory", "crunchy", ["crunchy", "crispy", "crisp", "crunch", "crunchier", "crispier"]],
  ["sensory", "savory", ["savory", "savoury", "umami"]],
  ["sensory", "cold", ["cold", "frozen", "icy", "chilled", "colder"]],
  ["sensory", "creamy", ["creamy", "smooth", "silky", "creamier"]],
  ["sensory", "sweet", ["sweet", "dessert", "dessert-like", "sugary", "sweeter"]],
  ["sensory", "spicy", ["spicy", "hot", "chilli", "chili", "spicier", "hotter", "heat"]],
  ["sensory", "chocolate", ["chocolate", "choco", "cocoa"]],
  ["cuisine", "vietnamese", ["vietnamese", "viet", "vietnamese cuisine"]],
  ["cuisine", "singapore_hawker", ["hawker", "hawker centre", "hawker center", "singapore hawker", "singaporean"]],
  ["food", "fried_chicken", ["fried chicken", "crispy chicken", "crunchy chicken"]],
  ["food", "cereal", ["cereal", "coco pops", "cocoa pops", "chocolate cereal"]],
  ["food", "ice_cream", ["ice cream", "gelato", "froyo"]],
  ["food", "fast_food", ["fast food", "burger", "burgers", "drive thru", "drive-thru"]],
  ["goal", "fat_loss", ["cutting", "fat loss", "lose weight", "losing weight", "weight loss", "fat_loss"]],
  ["goal", "muscle_gain", ["bulking", "muscle gain", "build muscle", "muscle_gain", "lean bulk", "lean_bulk"]],
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const MATCHERS = CONCEPTS.map(([kind, id, aliases]) => ({
  kind,
  id,
  pattern: new RegExp(`(?<![a-z0-9])(?:${aliases.map(esc).join("|")})(?![a-z0-9])`, "i"),
}))
/** alias -> concept id, for normalising single metadata values ("crispy" -> "crunchy"). */
const ALIAS_TO_ID = new Map(CONCEPTS.flatMap(([, id, aliases]) => [[id, id] as const, ...aliases.map((a) => [a.replace(/[\s-]+/g, "_"), id] as const)]))

/** Canonical form of one metadata value or query term. */
export const canonTerm = (value: string): string => {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return ALIAS_TO_ID.get(key) ?? key
}

/** Concept ids found in free text, grouped by kind. */
export function detectConcepts(text: string): Record<ConceptKind, string[]> {
  const out: Record<ConceptKind, string[]> = { sensory: [], cuisine: [], food: [], goal: [] }
  for (const m of MATCHERS) if (m.pattern.test(text)) out[m.kind].push(m.id)
  return out
}

/**
 * Function words and conversational filler. In a corpus of ~120 short sections a word like "actually" or "look" is rare, so idf
 * scores it as highly informative and it lights up an unrelated heading ("Identify what the user actually wants"). Standard English
 * function/filler vocabulary carries no topical meaning, so it never counts as retrieval evidence. Domain words (cut, full, keep,
 * stop, big, enough) are deliberately NOT here.
 */
const FILLER_WORDS =
  "actually also always ever every never other another both each few many much most own same such too only even still yet already often usually sometimes anyway maybe perhaps quite rather pretty almost mostly nearly basically literally honestly truly kind sort lot bit little thing things stuff way ways one two three first last next because since until unless although though however therefore whether either neither nor if else into onto out over under up down off through during before after again once between against above below around across along within without upon per via am being been were had having done doing go goes going went gone got getting gets take takes took taken give gives gave given come comes came let lets see saw seen look looks looking use used using try tried trying say says said tell told ask asked know knew known think thought seem seems their theirs them they he she him her his hers himself herself itself ourselves yourself myself us our ours tbh ok okay yeah yes please thanks hi hello".split(
    " ",
  )
const STOPWORDS = new Set([
  ..."a an the and or but of to in on at for with from by is are was be it its this that these those i im me my we you your do does did can could should would will want wanna need like have has get some any something anything what how why when where which who while about as so not no dont tonight today now just really very more less than then there here make eat".split(" "),
  ...FILLER_WORDS,
])

/** Plural "s" and the "-ness" noun form, so "Crispness"/"Creaminess" headings meet the user's "crisp"/"creamy". */
const stem = (t: string) =>
  t.length > 6 && t.endsWith("iness")
    ? `${t.slice(0, -5)}y`
    : t.length > 6 && t.endsWith("ness")
      ? t.slice(0, -4)
      : t.length > 3 && t.endsWith("s") && !t.endsWith("ss")
        ? t.slice(0, -1)
        : t

const tokensOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)

/** Lowercased, stop-word-free, lightly stemmed tokens plus canonical concept ids. Deterministic, deduplicated. */
export function normalizeTerms(text: string): string[] {
  const c = detectConcepts(text)
  return [...new Set([...tokensOf(text), ...Object.values(c).flat()])].sort()
}

/** Same vocabulary as normalizeTerms, but with occurrence counts (concept ids count once per mention) for length-aware section scoring. */
export function termCounts(text: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of [...tokensOf(text), ...Object.values(detectConcepts(text)).flat()]) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

const list = (v?: string[]) => (v ?? []).map(canonTerm)
const label = (v: string) => v.replace(/_/g, " ")

/** Title + category + path/heading + usable metadata + content. Internal only. */
export function indexChunk(chunk: NutritionKnowledgeChunk): IndexedKnowledgeChunk {
  const m = chunk.metadata
  const header = [
    `Document: ${m.title}`,
    `Category: ${label(m.category)}`,
    `Path: ${m.title} > ${chunk.heading}`,
    m.goals?.length ? `Goals: ${list(m.goals).map(label).join(", ")}` : "",
    m.cuisines?.length ? `Cuisines: ${list(m.cuisines).map(label).join(", ")}` : "",
    m.foodTypes?.length ? `Food types: ${list(m.foodTypes).map(label).join(", ")}` : "",
    m.sensoryTargets?.length ? `Sensory targets: ${list(m.sensoryTargets).map(label).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  const retrievalText = `${header}\n\n${chunk.heading}\n\n${chunk.content}`
  const metaTerms = [...list(m.goals), ...list(m.cuisines), ...list(m.foodTypes), ...list(m.sensoryTargets)]
  return { chunk, retrievalText, normalizedTerms: [...new Set([...normalizeTerms(retrievalText), ...metaTerms])].sort(), headingTerms: normalizeTerms(chunk.heading), localTerms: normalizeTerms(`${chunk.heading}

${chunk.content}`), titleTerms: normalizeTerms(m.title) }
}
