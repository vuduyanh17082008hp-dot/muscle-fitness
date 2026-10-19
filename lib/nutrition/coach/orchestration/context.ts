import { COACH_INGREDIENT_IDS, getIngredient } from "../ingredients"
import { extractCravingFood } from "../conversation"

import type { ConversationContext, Language, PresentedOption, RecentMessage, StatedBudget } from "./types"

/**
 * Bounded recent-context resolver (pure, deterministic, bilingual).
 *
 * It does NOT classify intent. It extracts the *evidence* a model (or the
 * fallback) needs to understand a short turn: the last offer, presented
 * options, referenced foods/amounts, active constraints, and whether the
 * message corrects an earlier inference. Recency is explicit and bounded:
 * the current message beats every older turn, and turns beyond the window are
 * never read.
 */

/** Messages older than this (counting the current message as 0) are never read. */
export const CONTEXT_WINDOW = 6
/** Foods/slots older than this are stale and cannot override the current request. */
export const FRESH_WINDOW = 4
const TURN_TEXT_LIMIT = 300

// JS \b is ASCII-only; Vietnamese needs Unicode-aware boundaries.
const L = "(?<![\\p{L}\\p{N}])"
const R = "(?![\\p{L}\\p{N}])"
const word = (alternatives: string) => new RegExp(`${L}(?:${alternatives})${R}`, "iu")

/* ---------- language ---------- */

const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i
const VI_ASCII_WORDS = new Set(["khong", "co", "duoc", "nhe", "nha", "toi", "minh", "muon", "bao", "nhieu", "cho", "va", "la", "voi", "roi", "di", "cai", "nay", "thu", "hai", "ba", "bua"])
const VI_WORDS = word("không|có|được|nhé|nha|ạ|đi|cho|tôi|mình|em|muốn|bữa|ăn|thêm|bớt|cái|này|thứ|rồi|ừ|ừm|vâng|dạ|làm|còn|sao|nhiều|hơn|món|nữa|vậy|thôi|đó|kia")

export function detectLanguage(text: string, fallback: Language = "en"): Language {
  const lower = text.toLowerCase()
  const viSignals = VI_CHARS.test(lower) || VI_WORDS.test(lower)
  const tokens = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const asciiTokens = tokens.filter((token) => /^[a-z]{2,}$/.test(token) && !VI_ASCII_WORDS.has(token) && !["ok", "oke"].includes(token))
  if (!viSignals) return asciiTokens.length === 0 && tokens.length <= 1 ? fallback : "en"
  return asciiTokens.length >= 2 ? "mixed" : "vi"
}

/* ---------- message shape ---------- */

const strip = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim()

const AFFIRM = new Set([
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "please", "do it", "go ahead", "go for it", "sounds good", "lets do it", "let's do it", "that works", "do that", "perfect", "alright", "fit it in", "yes please", "sure thing", "yes do it",
  "ừ", "ừm", "ờ", "vâng", "dạ", "có", "được", "được rồi", "đồng ý", "làm đi", "chốt", "đúng rồi", "ok luôn", "ừ làm đi", "có nhé", "có nha", "dạ có", "ok nhé", "ừ đi", "ok đi", "làm đi nhé",
])
const NEGATE = new Set(["no", "nope", "nah", "not really", "no thanks", "không", "ko", "thôi", "thôi khỏi", "khỏi", "không cần", "không nhé"])

export const isAffirmationText = (text: string) => AFFIRM.has(strip(text))
export const isNegationText = (text: string) => NEGATE.has(strip(text))

const CORRECTION = new RegExp(
  [
    "\\bi\\s+meant\\b",
    "\\b(?:no|nope|wait|actually|sorry)\\b[,.! ]+(?:i\\s+mean\\b|make (?:it|that)|for\\s+(?:breakfast|lunch|dinner|supper|snack))",
    "\\bnot\\s+(?:that|this|the\\s+\\w+)[,.]?\\s+(?:i\\s+mean|but)\\b",
    "ý\\s+(?:tôi|mình|em)\\s+là",
    "không\\s+phải[^.?!]*\\s+mà\\s+là",
    "nhầm",
  ].join("|"),
  "iu",
)
const ANAPHOR = word("it|that|this|them|those|these|one|same|again|too|also|instead|cái đó|cái này|cái kia|món đó|món này|nữa|vậy")
const PRONOUN_EDIT = new RegExp(
  `${L}(?:make|get|keep|turn|cut|bring)\\s+(?:it|that|this)${R}|${L}(?:bigger|smaller|larger|lower|higher|less|more|cheaper|lighter|sweeter)${R}|(?:làm|cho)\\s+(?:nó|cái đó|món đó|món này)|(?:to|nhỏ|nhiều|ít|rẻ)\\s+hơn`,
  "iu",
)

/* ---------- meal slot / constraints ---------- */

const SLOTS: Array<[RegExp, string]> = [
  [word("breakfast|brunch|bữa sáng|ăn sáng"), "breakfast"],
  [word("lunch|bữa trưa|ăn trưa"), "lunch"],
  [word("dinner|supper|bữa tối|ăn tối"), "dinner"],
  [word("snack|bữa phụ|ăn vặt"), "snack"],
]
const slotOf = (text: string): string | null => SLOTS.find(([pattern]) => pattern.test(text))?.[1] ?? null

const FREE_FROM = /\b(?:dairy|gluten|lactose|sugar|nut)[- ]free\b|\bvegan\b|\bvegetarian\b/i
const WITHOUT = /\bwithout\s+([a-z][a-z ]{1,20}?)(?=[,.;!?]|\s+(?:and|but|or)\b|$)/i
const MAX_KCAL = /\b(?:under|below|less than|max(?:imum)?|within|<=?)\s*(\d{2,4})\s*(?:k?cal(?:ories)?)\b/i

// Effort ("I don't want to cook"), exclusions ("no peanut butter"), a protein floor and taste are constraints the user
// states once and expects to hold until they say otherwise. Extraction is by shape, not a phrase list per food.
const LOW_PREP = word("(?:don'?t|do not|dont|doesn'?t) (?:really |seriously |want to |wanna |feel like |have time to )+cook(?:ing)?|(?:don'?t|do not) have (?:the )?time to cook|no[- ]cook(?:ing)?|without cooking|nothing to cook|zero[- ]prep|không (?:muốn|có thời gian) nấu|lười nấu|không nấu")
const MIN_PROTEIN = /(?:at least|minimum(?: of)?|min\.?|more than|over|ít nhất)\s*(\d{2,3})\s*g(?:rams?)?\s*(?:of\s+)?(?:protein|đạm)/i
const TASTE = /(?:something|craving|feel like|want(?: it)?|muốn ăn)\s+(?:a\s+bit\s+|really\s+|very\s+)?(sweet|savou?ry|crunchy|creamy|salty|spicy|ngọt|mặn|giòn)(?![\p{L}])/iu
const NO_FOOD = /(?<![\p{L}\p{N}])(?:no|without|avoid|skip|except|hold the|not|don'?t (?:want|like|eat)|đừng|không)\s+(?:any\s+)?([\p{L}][\p{L} ]{1,24}?)(?=[,.;!?]|\s+(?:and|but|or|please|i|so|because|at|in|on)\b|$)/giu
const AVOID_TERMS = word("dairy|gluten|lactose|sugar|nuts?|peanuts?|eggs?|soy|shellfish|fish|pork|beef|chicken|meat|rice|bread|oil|cheese|milk|wheat|tofu|garlic|onion|coconut|sesame|butter")

const normalizeApostrophes = (text: string) => text.replace(/[‘’]/g, "'")
const constraintKey = (constraint: string) => (constraint.includes(":") ? constraint.slice(0, constraint.indexOf(":")) : constraint)

function constraintsOf(raw: string): string[] {
  const text = normalizeApostrophes(raw)
  const out: string[] = []
  const slot = slotOf(text)
  if (slot) out.push(`meal:${slot}`)
  const kcal = text.match(MAX_KCAL)
  if (kcal) out.push(`max_kcal:${kcal[1]}`)
  const without = text.match(WITHOUT)
  if (without) out.push(`without:${without[1].trim().toLowerCase()}`)
  for (const match of text.matchAll(NO_FOOD)) {
    const phrase = match[1].trim().toLowerCase()
    if (AVOID_TERMS.test(phrase) || ingredientNamesIn(phrase).length > 0) out.push(`without:${phrase}`)
  }
  const free = text.match(FREE_FROM)
  if (free) out.push(`diet:${free[0].toLowerCase().replace(/\s+/g, "-")}`)
  if (LOW_PREP.test(text)) out.push("low_prep")
  const protein = text.match(MIN_PROTEIN)
  if (protein) out.push(`min_protein:${protein[1]}`)
  const taste = text.match(TASTE)
  if (taste) out.push(`taste:${taste[1].toLowerCase()}`)
  return [...new Set(out)]
}

const LIFT_LOW_PREP = /(?:i can|i'?ll|i will|happy to|fine to|ok(?:ay)? to|willing to|i do want to) cook|cooking is (?:fine|ok|okay)|có thể nấu|nấu cũng được/i

/** A later user turn retracts an earlier constraint ("actually I can cook", "peanut butter is fine"). */
function liftedBy(constraint: string, raw: string): boolean {
  const text = normalizeApostrophes(raw)
  if (constraint === "low_prep") return LIFT_LOW_PREP.test(text)
  if (constraint.startsWith("without:")) {
    const item = escapeRegExp(constraint.slice(8))
    return new RegExp(`${item}\\s+(?:is|are|'s)\\s+(?:fine|ok|okay|alright)|(?:fine|ok|okay)\\s+(?:with|to have)\\s+${item}|actually,?\\s+(?:add|include|use)\\s+${item}`, "i").test(text)
  }
  return false
}

/** Constraints visible in the window, oldest to newest: a later same-kind constraint replaces an earlier one; a retraction removes it. */
function retainedConstraints(userTexts: string[], seed: string[] = []): string[] {
  let kept: string[] = [...seed]
  for (const text of userTexts) {
    kept = kept.filter((constraint) => !liftedBy(constraint, text))
    for (const next of constraintsOf(text)) {
      const replaces = ["max_kcal", "min_protein", "taste", "meal"].includes(constraintKey(next))
      kept = kept.filter((constraint) => constraint !== next && !(replaces && constraintKey(constraint) === constraintKey(next)))
      kept.push(next)
    }
  }
  return kept
}

/* ---------- amounts / foods ---------- */

const AMOUNT = /\b\d{1,4}(?:\.\d+)?\s*(?:g|kg|ml|kcal|cal|cals|calories|oz|cups?|pieces?|slices?|scoops?)\b/gi

function amountsOf(text: string): string[] {
  const found = (text.match(AMOUNT) ?? []).map((m) => m.toLowerCase().replace(/\s+/g, " "))
  const bare = text.trim().split(/\s+/).length <= 4 ? (text.match(/(?<![\w.])\d{1,3}(?![\w.])/g) ?? []) : []
  return [...new Set([...found, ...bare])].slice(0, 6)
}

const OFFER_OBJECT = /\b(?:fit|work|squeeze|include|slot|build)\s+(?:in\s+)?(?:the\s+|your\s+|some\s+|a\s+|those\s+|these\s+)?([\p{L}][\p{L}' -]{1,28}?)\s+(?:into|in(?:to)?|within|around)\b/iu

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function ingredientNamesIn(lower: string): string[] {
  return COACH_INGREDIENT_IDS.flatMap((id) => {
    const name = getIngredient(id)?.shortName.toLowerCase()
    return name && new RegExp(`${L}${escapeRegExp(name)}${R}`, "iu").test(lower) ? [name] : []
  })
}

function foodsOf(text: string, role: "user" | "coach"): string[] {
  const out = new Set<string>()
  const crave = role === "user" ? extractCravingFood(text) : undefined
  if (crave) out.add(crave.toLowerCase())
  if (role === "coach") {
    const offered = text.match(OFFER_OBJECT)?.[1]?.trim().toLowerCase()
    if (offered && !/^(it|them|that|this|those|these)$/.test(offered)) out.add(offered)
  }
  for (const name of ingredientNamesIn(text.toLowerCase())) out.add(name)
  return [...out].slice(0, 6)
}

/* ---------- stated budget (user words only; trusted numbers come from nutrition state) ---------- */

const KCAL = "(?:k?cal(?:ories)?|calo)"
const REMAINING_CAL = new RegExp(`(\\d{2,4})\\s*${KCAL}\\s*(?:are\\s+|is\\s+)?(?:left|remaining|to go|còn lại|còn)|(?:left|remaining|còn lại|còn)\\D{0,12}(\\d{2,4})\\s*${KCAL}`, "iu")
const CONSUMED_CAL = new RegExp(`(\\d{2,4})\\s*${KCAL}\\b(?:(?!left|remaining|còn)[^.?!]){0,30}?(?:eaten|ate|consumed|had|so far|đã ăn|ăn rồi)|(?:eaten|ate|had|consumed|đã ăn)\\s+(?:about\\s+|around\\s+)?(\\d{2,4})\\s*${KCAL}`, "iu")
const NOT_REMAINING = /not\s+(?:what\s+)?(?:i\s+(?:have|got)\s+)?(?:left|remaining)|không phải\s+(?:là\s+)?(?:còn lại|số còn)/iu
export const OTHER_REF = word("the other(?: one| ones)?|another one|the others?|the remaining one|cái còn lại|cái kia|món kia|món còn lại")

const numberOf = (match: RegExpMatchArray | null) => (match ? Number(match[1] ?? match[2]) : null)

/**
 * Replays the user's own turns oldest -> newest. A later explicit statement or correction beats an earlier one
 * ("620 left" ... "I meant 620 is what I've eaten" => remaining retracted, consumed = 620). Nothing here is trusted state.
 */
export function statedBudgetOf(userTexts: string[]): StatedBudget {
  let remaining: number | null = null
  let consumed: number | null = null
  let invalidated: number | null = null
  for (const raw of userTexts) {
    const text = normalizeApostrophes(raw)
    const isCorrection = CORRECTION.test(text)
    const left = numberOf(text.match(REMAINING_CAL))
    const eaten = numberOf(text.match(CONSUMED_CAL))
    if (eaten !== null) {
      consumed = eaten
      // The same figure cannot be both: the consumed reading replaces the earlier remaining reading.
      if (remaining === eaten && (isCorrection || NOT_REMAINING.test(text))) {
        invalidated = remaining
        remaining = null
      }
    }
    if (left !== null) remaining = left
    if (eaten === null && isCorrection && NOT_REMAINING.test(text) && remaining !== null) {
      invalidated = remaining
      remaining = null
    }
  }
  return { remainingCalories: remaining, consumedCalories: consumed, invalidatedRemaining: invalidated }
}

/* ---------- offers / options ---------- */

const OFFER_CUE = new RegExp(
  `${L}(?:would you like|want me to|do you want|shall i|should i|can i|could i|i can|i could|how about)${R}|(?:bạn\\s+)?(?:có\\s+)?muốn\\s+(?:mình|em|tôi)|để\\s+(?:mình|em)[^.?!]*không\\s*\\?`,
  "iu",
)

function lastQuestion(text: string): string | null {
  const sentences = text.match(/[^.!?\n]+[.!?]*/g) ?? []
  const question = [...sentences].reverse().find((sentence) => sentence.includes("?"))
  return question ? question.trim().slice(0, 240) : null
}

const OPTION_LINE = /^\s*(?:[-*•]\s*)?(?:\*\*)?(?:option|lựa chọn|phương án)?\s*([A-Ea-e]|[1-5])\s*(?:\*\*)?\s*[.):\-–]\s*(.+)$/iu
const OPTION_HEAD = /^(?:option|lựa chọn|phương án)\s+([A-Ea-e1-5])\s*[.):\-–]?\s*([\s\S]*)$/iu

export function parseOptions(text: string): PresentedOption[] {
  let raw = text.split("\n").flatMap((line) => {
    const match = line.match(OPTION_LINE)
    return match ? [{ label: match[1].toUpperCase(), text: match[2].replace(/\*\*/g, "").trim().slice(0, 160) }] : []
  })
  if (raw.length < 2) {
    raw = text
      .split(/(?=(?:option|lựa chọn|phương án)\s+[A-Ea-e1-5]\b)/iu)
      .flatMap((part) => {
        const match = part.trim().match(OPTION_HEAD)
        return match ? [{ label: match[1].toUpperCase(), text: match[2].replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 160) }] : []
      })
  }
  return raw.length >= 2 ? raw.slice(0, 5).map((o, i) => ({ index: i + 1, label: o.label, text: o.text })) : []
}

const ORDINALS: Array<[number, RegExp]> = [
  [1, word("first|1st|option 1|option a|#1|number 1|số 1|thứ nhất|thứ 1|đầu tiên")],
  [2, word("second|2nd|option 2|option b|#2|number 2|số 2|thứ hai|thứ 2")],
  [3, word("third|3rd|option 3|option c|#3|number 3|số 3|thứ ba|thứ 3")],
  [4, word("fourth|4th|option 4|option d|#4|number 4|số 4|thứ tư|thứ 4")],
]
const AMOUNT_HINT = /\d+\s*(?:g|kg|ml|kcal|cal|cals|calories|oz|cups?|pieces?|slices?|scoops?)(?![\p{L}\p{N}])/iu
const LAST = word("last|final|cuối|cuối cùng")

/**
 * Selection by NAME ("the Greek Yogurt Bowl"). Only used to bind the answer to a pending "which one?" question; a unique
 * match among the displayed options or nothing.
 */
export function optionByName(message: string, options: PresentedOption[]): PresentedOption | null {
  const said = strip(message)
  if (said.split(" ").length > 10) return null
  const hits = options.filter((option) => {
    const head = strip(option.text.split(/\s[—–-]\s|[:(,]/)[0])
    return head.length >= 4 && said.includes(head)
  })
  return hits.length === 1 ? hits[0] : null
}

/**
 * The answer to "which one do you mean: A or B?": a name, or an ordinal counted over the options THE QUESTION OFFERED
 * ("the second one" there means B, not the second of the original list). Null when it names neither.
 */
export function pickForPendingQuestion(message: string, options: PresentedOption[], question: string): PresentedOption | null {
  const byName = optionByName(message, options)
  if (byName) return byName
  const asked = strip(question)
  const offered = options
    .map((option) => ({ option, at: asked.indexOf(strip(option.text.split(/s[—–-]s|[:(,]/)[0])) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.option)
  return offered.length >= 2 ? parseSelection(message, offered) : null
}

/** Only short, selection-shaped messages select an option ("the second one", "option B", "cái thứ 2"). */
export function parseSelection(text: string, options: PresentedOption[]): PresentedOption | null {
  if (options.length < 2) return null
  const trimmed = text.trim()
  const tokens = trimmed.split(/\s+/)
  // Short messages select outright. A selection that also carries a tweak ("ừ, cái thứ 2 đi nhưng tăng protein lên",
  // "the second one but more protein") must lead with the ordinal and carry no quantity, so a long sentence that merely
  // mentions "second" is never treated as a pick.
  if (tokens.length > 12 || (tokens.length > 6 && (AMOUNT_HINT.test(trimmed) || !ORDINALS.some(([, pattern]) => pattern.test(tokens.slice(0, 5).join(" ")))))) return null
  if (LAST.test(tokens.length > 6 ? tokens.slice(0, 5).join(" ") : trimmed)) return options[options.length - 1]
  const bare = strip(trimmed).match(/^([abcd])(?:\s+(?:please|đi|nhé))?$/)
  if (bare) return options[bare[1].charCodeAt(0) - 97] ?? null
  const hit = ORDINALS.find(([, pattern]) => pattern.test(tokens.length > 6 ? tokens.slice(0, 5).join(" ") : trimmed))
  return hit ? (options[hit[0] - 1] ?? null) : null
}

/* ---------- main ---------- */

/**
 * Constraints worth carrying past the 6-message window (echoed by the client, so shape-checked): exclusions, diet, effort,
 * protein floor, taste. Request-scoped ones (meal slot, calorie cap) are re-read from the window and never carried.
 */
const DURABLE_CONSTRAINT = /^(?:without:[\p{L} ]{2,25}|diet:[a-z-]{3,24}|low_prep|min_protein:\d{2,3}|taste:[\p{L}]{3,12})$/u
export const durableConstraints = (constraints: readonly string[] | null | undefined): string[] => [...new Set((constraints ?? []).filter((constraint) => DURABLE_CONSTRAINT.test(constraint)))].slice(0, 8)

export function resolveConversationContext(message: string, recent: RecentMessage[], extras: { currentTopicFood?: string | null; priorConstraints?: string[]; pendingQuestion?: string } = {}): ConversationContext {
  // The panel echoes the current message as the last entry of recentMessages; it is not "history".
  const last = recent[recent.length - 1]
  const history = last?.role === "user" && last.text.trim() === message.trim() ? recent.slice(0, -1) : recent
  const windowed = history.slice(-CONTEXT_WINDOW)
  const turns = windowed.map((m, i) => ({ role: m.role, text: m.text.slice(0, TURN_TEXT_LIMIT), turnsAgo: windowed.length - i }))
  const fresh = turns.filter((t) => t.turnsAgo <= FRESH_WINDOW)
  const prevCoach = turns.find((t) => t.turnsAgo === 1 && t.role === "coach") ?? null

  const words = message.trim().split(/\s+/).filter(Boolean).length
  const affirmation = isAffirmationText(message)
  const negation = isNegationText(message)
  const correctionMatch = CORRECTION.exec(message)
  const correction = correctionMatch ? { text: message.trim().slice(0, 160) } : null
  const pronounEdit = words <= 6 && PRONOUN_EDIT.test(message)

  // Offer / unresolved question: only the IMMEDIATELY preceding coach turn counts, so an offer expires after one user turn.
  const question = prevCoach ? lastQuestion(prevCoach.text) : null
  const lastAssistantOffer = question && OFFER_CUE.test(question) ? question : null

  // Options: newest coach message in the window that presented >=2 options; a selection may come from any later user turn.
  const optionsTurn = [...turns].reverse().find((t) => t.role === "coach" && parseOptions(t.text).length >= 2) ?? null
  const presentedOptions = optionsTurn ? parseOptions(optionsTurn.text) : []
  const laterUserTurns = optionsTurn ? turns.filter((t) => t.role === "user" && t.turnsAgo < optionsTurn.turnsAgo) : []
  const selectedOption =
    (extras.pendingQuestion ? pickForPendingQuestion(message, presentedOptions, extras.pendingQuestion) : null) ??
    parseSelection(message, presentedOptions) ??
    [...laterUserTurns].reverse().map((t) => parseSelection(t.text, presentedOptions)).find(Boolean) ??
    null
  let selected = selectedOption
  let referentCandidates = selected ? [] : presentedOptions.map((o) => o.label)
  // "the other one" names something that is NOT the current pick. One option left => that one; several => ambiguous (never guess).
  const otherReference = OTHER_REF.test(message) && presentedOptions.length >= 2
  if (otherReference) {
    const others = presentedOptions.filter((o) => o.index !== selected?.index)
    if (others.length === 1) {
      selected = others[0]
      referentCandidates = []
    } else {
      referentCandidates = others.map((o) => o.label)
    }
  }

  // Foods: the current message wins. Older foods survive only for context-dependent turns and only while fresh.
  const ownFoods = foodsOf(message, "user")
  const olderFoods = fresh.flatMap((t) => foodsOf(t.text, t.role))
  if (extras.currentTopicFood) olderFoods.push(extras.currentTopicFood.toLowerCase())
  const olderUnique = [...new Set(olderFoods)].filter((food) => !ownFoods.includes(food))
  const isShortFollowUp = turns.length > 0 && words <= 8 && (affirmation || negation || ANAPHOR.test(message) || pronounEdit || Boolean(selected) || ownFoods.length === 0)
  const keepOlder = isShortFollowUp && !correction
  const referencedFoods = [...ownFoods, ...(keepOlder ? olderUnique : [])].slice(0, 6)
  const supersededFoods = keepOlder ? [] : olderUnique
  if (referentCandidates.length === 0 && !selected) {
    const nearFoods = [...new Set(turns.filter((t) => t.turnsAgo <= 2).flatMap((t) => foodsOf(t.text, t.role)))]
    if (nearFoods.length >= 2) referentCandidates.push(...nearFoods.slice(0, 3))
  }

  // Constraints/slot: the current message beats older turns; an explicit correction replaces the earlier inference outright.
  const ownConstraints = constraintsOf(message).filter((c) => !c.startsWith("meal:"))
  // "not lunch, I meant dinner": what follows the correction cue is the corrected value.
  const ownSlot = (correctionMatch ? slotOf(message.slice(correctionMatch.index)) : null) ?? slotOf(message)
  const olderSlot = [...fresh].reverse().map((t) => (t.role === "user" ? slotOf(t.text) : null)).find(Boolean) ?? null
  const mealSlot = ownSlot ?? (correction ? null : olderSlot)
  // Constraints outlive the freshness window: they hold across the whole bounded window until retracted or replaced
  // (select -> modify -> "give me the recipe" must still be a no-cook, no-peanut-butter request). A correction replaces the
  // facts it restates (the meal slot above, budget numbers below) without wiping unrelated constraints.
  const userTexts = turns.filter((t) => t.role === "user").map((t) => t.text)
  const retained = retainedConstraints([...userTexts, message], durableConstraints(extras.priorConstraints)).filter((c) => !c.startsWith("meal:"))
  const activeConstraints = [...new Set([...retained, ...ownConstraints, ...(mealSlot ? [`meal:${mealSlot}`] : [])])].slice(0, 10)

  const priorUser = [...turns].reverse().find((t) => t.role === "user")
  const language = detectLanguage(message, priorUser ? detectLanguage(priorUser.text) : "en")

  return {
    language,
    turns,
    lastUserRequest: priorUser?.text ?? null,
    lastAssistantOffer,
    unresolvedQuestion: question,
    presentedOptions,
    selectedOption: selected,
    isShortFollowUp,
    isAffirmation: affirmation,
    isNegation: negation,
    correction,
    pronounEdit,
    referencedFoods,
    referencedAmounts: [...new Set([...amountsOf(message), ...(keepOlder ? fresh.flatMap((t) => amountsOf(t.text)) : [])])].slice(0, 6),
    activeConstraints,
    mealSlot,
    referentCandidates,
    otherReference,
    statedBudget: statedBudgetOf([...turns.filter((t) => t.role === "user").map((t) => t.text), message]),
    supersededFoods,
  }
}
