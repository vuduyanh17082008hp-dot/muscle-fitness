import { classifyConversation, type NutritionIntent } from "../coach/conversation"
import { detectConcepts } from "./normalize"
import type { KnowledgeNeedDecision, KnowledgeNeedReason } from "./types"

/**
 * Knowledge Need Gate. Conversation decides whether knowledge is needed;
 * retrieval never decides what the conversation means. Pure, deterministic,
 * no LLM. `intent` is the N1.5 intent when the caller already has one.
 */

const NO = (rationale: string, confidence: KnowledgeNeedDecision["confidence"] = "HIGH"): KnowledgeNeedDecision => ({ needed: false, reason: "NOT_NEEDED", confidence, rationale })
const YES = (reason: KnowledgeNeedReason, confidence: KnowledgeNeedDecision["confidence"], rationale: string): KnowledgeNeedDecision => ({ needed: true, reason, confidence, rationale })

/** Deterministic tools / state handle these; knowledge adds nothing. */
const BYPASS_INTENTS: ReadonlySet<NutritionIntent> = new Set(["EDIT_ACTIVE_DRAFT", "LOG_MEAL", "MACRO_CALCULATION", "PREFERENCE_UPDATE", "RESET_CONTEXT", "NEW_MEAL_REQUEST"])

/** Talk about where a number came from or how sure it is: portion recall, estimates, ranges, verification, trust. */
const PROVENANCE_TALK = /\b(?:remember\w*|recall\w*|estimat\w*|guess\w*|verified|accura\w*|precise|trust\w*|reliable|ranges?|spread|figure|uncertain\w*)\b/i
const REMAINING = /\b(?:left|remaining|so far|consumed|eaten)\b/i
const MACRO_WORD = /\b(?:calories?|kcal|protein|carbs?|fat|macros?|budget)\b/i
const EXACT_LOOKUP = /\bhow (?:much|many)\b[^.?!]*\b(?:protein|calories?|kcal|carbs?|fat|macros?)\b|\bwhat(?:'s| is| are) the (?:calories?|kcal|protein|carbs?|fat|macros?)\b|\b(?:calories?|kcal|protein|carbs?|macros?)(?:\s+content)?\s+(?:in|of|for)\b(?!\s+(?:a |my|the |your )?(?:deficit|surplus|cut|cutting|bulk|bulking|diet|fat loss|weight loss|general|plan)\b)/i
const DRAFT_EDIT = /^\s*(?:please\s+)?(?:remove|drop|skip|take out|get rid of|swap|replace|undo|redo)\b|\bunder\s+\d{2,4}\s*(?:k?cal|calories)\b|\b(?:make|get|bring|keep|cut)\s+(?:this|it|that)\b[^.?!]*\b\d{2,4}\s*(?:k?cal|calories)\b/i

/** A statement that only sets a goal or states a taste ("my goal is...", "X is fine by me", "I like it hot") updates state; it asks for nothing. */
const STATE_STATEMENT = /\bmy goal (?:is|now is)\b|\bfrom now on\b|\bis fine (?:by|with) me\b|\b(?:is|are) (?:disgusting|gross|yucky)\b|^\s*i (?:like|love|prefer|enjoy)\b/i
/** "mark ... done / logged" is a log action, whatever else the sentence names. */
const LOG_ACTION = /\bmark\b[^.?!]*\b(?:done|eaten|logged|complete\w*)\b/i
/** "mark ... done / logged" is a log action, whatever else the sentence names. */
const CRAVING = /\bcrav\w*|\bsweet tooth\b/i
const MAKEOVER = /\b(?:fast food|makeover|healthier version|lighter version|(?:blow|ruin|wreck) my (?:calories|macros|diet|day))\b/i
const CUISINE = /\b(?:cuisine|food court|hawker)\b/i
const FLAVOR = /\btaste (?:better|good|great)\b|\bflavou?r\w*|\btexture\b|\bbland\b|\bboring\b/i
const STRATEGY = /\b(?:strateg\w+|approach|navigate|tips? for|eat(?:ing)? out|dining out|ordering)\b/i
const COACHING = /\b(?:guilty|feel bad about|motivation|struggl\w*|binge|can'?t stick|give up on)\b/i
const GENERAL = /\b(?:is|are|does|do|can|should)\b[^.?!]*\b(?:bad|good|healthy|unhealthy|fattening|okay|ok|worth|reliable|accurate|trustworthy|precise)\b/i
/** A question that names a training goal ("while cutting", "I'm bulking") is a strategy question. */
const QUESTION = /\b(?:how|what|which|should|can|could|is|are|does|do)\b/i
/** Wanting a named food in a lighter form is a makeover, whatever the verb. */
const LIGHTER = /\b(?:lighter|healthier|leaner|slimmer|lower[- ]cal\w*|fewer calories|less calories)\b/i

/**
 * Layer-1 uncertain band. This is a COST router, not a decision: it only says "a model may be worth asking".
 * Rule: not a deterministic action / lookup / pleasantry / preference statement, 3-40 words, and one of
 *   (A) talks about the eating experience (taste, texture, depth, satisfaction),
 *   (B) a want or an emotional state about food,
 *   (C) an eating context (food, meal, diet, a named dish) in a message of 4+ words, or an advice frame together with one,
 *   (D) Vietnamese (accented, or two or more unaccented function words), which the English cues above cannot read at all.
 *   (C) also covers everyday food / nutrient / training-fuel vocabulary (NUTRITION_TOPIC).
 * Everything else stays a confident NO and never costs a model call.
 */
const NOT_UNCERTAIN_COMMAND = /^\s*(?:please\s+|pls\s+|can you\s+|could you\s+)?(?:add|more|less|extra|double|triple|half|halve|bigger|larger|smaller|increase|decrease|lower|raise|reduce|save|log|record|show|list|set|change|update|cancel|undo|redo|thanks?|thank|ok(?:ay)?|cool|great|nice|hi|hello|hey|lol)\b/i
/** Questions about the assistant itself ("what u capable of?", "who are you") are small talk, not food strategy: never worth a model call. */
const ASSISTANT_META = /\bcapable\b|\bwho are (?:you|u)\b|\bwhat (?:can|do|could) (?:you|u) do\b|\bwhat do (?:you|u) do\b|\bare (?:you|u) (?:an? )?(?:ai|bot|robot|real|human)\b|\byour name\b/i
/** Quantity lookups, prices and preference statements. A message about where a number came from (PROVENANCE_TALK) is not one. */
const NOT_UNCERTAIN_LOOKUP = new RegExp(
  [
    // "how much / how many" is a quantity lookup unless the message asks for a judgment (should, trust, matter, worth, need, count).
    String.raw`\bhow (?:much|many)\b(?![^.?!]*\b(?:should|trust\w*|matter\w*|worth|need|counts?)\b)|\b(?:grams?|kg|oz|totals?|target|cheap(?:er|est)?(?!\s+(?:ways?|options?|sources?|foods?|meals?|swaps?))|expensive|price|cost)\b|\b\d+\s*(?:g|kcal|cal|calories)\b`,
    String.raw`\bwhich\b[^.?!]*\b(?:has|have|had)\b[^.?!]*\b(?:more|less|most|least)\b|\bwhat (?:did|have) i (?:eat|have|log|had)\w*|\b(?:allerg\w+|joke|weather)\b|\bi(?:'m| am) not (?:eating|having)\b|\bi (?:don'?t|do not) (?:eat|want|like)\b`,
  ].join("|"),
  "i",
)
const EXPERIENCE = /\b(?:tast\w*|flavou?r\w*|texture|mouthfeel|flat|dull|bland|boring|plain|samey|meh|bite|snap|crisp\w*|crunch\w*|chew\w*|creamy|velvet\w*|silky|sharp\w*|bright\w*|tang\w*|rich|heavy|one-note|satisf\w*|missing|lack\w*|depth|exciting|interesting|juic\w*|fresh\w*)\b/i
const WANT_OR_FEEL = /\b(?:calling my name|dying for|jonesing|hit the spot|bring on|want|wanna|fancy|hungry|starving|in the mood|mood for|treat|snack\w*|dessert|feel\w*|felt|guilt\w*|awful|rubbish|terrible|stress\w*|anxious|overate|over-ate|ate too|bing\w*|failed|ruined|blew|slipped|cheat\w*|motivat\w*|willpower|discipline|obsess\w*|restrict\w*)\b/i
const ADVICE = /\b(?:how (?:do|can|should|to)|what (?:should|can|do)|any (?:tips|ideas|advice)|ideas?|tips?|advice|options?|suggest\w*|recommend\w*|thoughts)\b/i
const EATING_CONTEXT = /\b(?:lean|eat\w*|food|meals?|dinner|lunch|breakfast|brunch|diet|deficit|surplus|bulk\w*|cut\w*|weight|muscle|gain|lose|loss|size|shed|menu|order\w*|restaurant|takeaway|takeout|dish\w*|noodles?|rice|soup|stalls?|burger|pizza|chicken|wings?|fries|chocolate|cake|biscuits?|cookies?|bread|pasta|sauce|broth)\b/i
/** A question or an either/or choice: the shape of someone asking for advice even when no food word appears. */
const ASKS_OR_CHOOSES = /\?|\b(?:vs\.?|versus|or)\b|\b(?:does|do|is|are|can|should|would) (?:that|it|this|these|i|we|you)\b|^\s*(?:how|what|why|should|can|could|is|are|does|do|any|which)\b/i
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i
/**
 * Unaccented Vietnamese ("ko dc", "lam sao") has no diacritic for VIETNAMESE to see. Function words that are not English
 * words, two or more distinct ones in a message, are a language signal for ROUTING only; Layer 2 reads the meaning.
 */
const VI_FUNCTION_WORDS = new Set("ko khong dc duoc nao sao minh toi roi hoai qua muon thi cua nay voi ma nhe k j".split(" "))
const unaccentedVietnamese = (text: string) => new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => VI_FUNCTION_WORDS.has(w))).size >= 2
/**
 * Everyday food, cooking, nutrient and training-fuel vocabulary. Not a dish list: it only says "this message is about
 * eating or fuelling", which is the precondition for asking Layer 2 whether guidance would help.
 */
const NUTRITION_TOPIC = /\b(?:protein|carbs?|carbohydrates?|fats?|fib(?:er|re)|sugar|salt|sodium|calor\w*|kcal|macros?|energy|appetite|hunger|full|fill\w*|portions?|servings?|snacks?|shakes?|smoothies?|salads?|veg\w*|fruit\w*|fish|eggs?|meat|beef|pork|tofu|oats?|yog\w+|noodles?|curry|curries|sushi|ramen|sweet\w*|sugary|fried|fry\w*|bak(?:e|ed|ing)|grill\w*|roast\w*|cook\w*|recipe|ingredient\w*|pre-?workout|post-?workout|workout|train(?:ing)?|gym|lifts?|run(?:ning)?|maintenance|bulk\w*|cutting|cheap|budget|caf[eé]|brunch|pad thai)\b/i

export function inUncertainBand(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (words < 3 || words > 40) return false
  if (NOT_UNCERTAIN_COMMAND.test(text) || ASSISTANT_META.test(text) || (NOT_UNCERTAIN_LOOKUP.test(text) && !PROVENANCE_TALK.test(text))) return false
  return (
    VIETNAMESE.test(text) ||
    unaccentedVietnamese(text) ||
    EXPERIENCE.test(text) ||
    WANT_OR_FEEL.test(text) ||
    PROVENANCE_TALK.test(text) ||
    (words >= 5 && ASKS_OR_CHOOSES.test(text)) ||
    (ADVICE.test(text) && (EATING_CONTEXT.test(text) || NUTRITION_TOPIC.test(text))) ||
    (words >= 4 && (EATING_CONTEXT.test(text) || NUTRITION_TOPIC.test(text) || detectConcepts(text).food.length > 0))
  )
}

export function decideNutritionKnowledgeNeed(input: { message: string; intent?: NutritionIntent }): KnowledgeNeedDecision {
  const text = input.message.trim()
  if (!text) return NO("empty message")

  if (input.intent && BYPASS_INTENTS.has(input.intent)) return NO(`${input.intent} is handled by deterministic tools`)
  const conv = classifyConversation(text, { reference: { bound: false, explicit: false, via: "none" }, state: {} })
  if (conv && conv.intent !== "NEW_CRAVING_REQUEST" && conv.intent !== "FOOD_SUBSTITUTION") return NO(`${conv.intent} is handled by deterministic tools`)

  const craving = input.intent === "NEW_CRAVING_REQUEST" || CRAVING.test(text)
  if (!craving) {
    if (REMAINING.test(text) && MACRO_WORD.test(text)) return NO("remaining-macros question: Athlete State answers it")
    if (EXACT_LOOKUP.test(text) && !PROVENANCE_TALK.test(text)) return NO("exact nutrition lookup: deterministic food data answers it")
    if (DRAFT_EDIT.test(text)) return NO("draft edit: the meal engine handles it")
  }

  if (!craving && LOG_ACTION.test(text)) return NO("log action: the meal tools handle it")
  if (!craving && STATE_STATEMENT.test(text) && !/\?|\b(?:how|what|which|why|should|does|do i|can i|could i)\b/i.test(text) && !ADVICE.test(text)) return NO("goal or preference statement: state, not a question")

  const concepts = detectConcepts(text)
  if (craving) return YES("CRAVING", "HIGH", "craving")
  if (MAKEOVER.test(text)) return YES("FOOD_MAKEOVER", "HIGH", "wants a food but is protecting the budget")
  if (concepts.food.length && LIGHTER.test(text)) return YES("FOOD_MAKEOVER", "MEDIUM", "wants a named food in a lighter form")
  if (concepts.cuisine.length || CUISINE.test(text)) return YES("CUISINE", "HIGH", "cuisine named")
  if (concepts.sensory.length || FLAVOR.test(text)) return YES("FLAVOR_TEXTURE", "MEDIUM", "sensory or flavour target")
  if (input.intent === "FOOD_SUBSTITUTION") return YES("FOOD_MAKEOVER", "MEDIUM", "substitution strategy")
  if (STRATEGY.test(text)) return YES("STRATEGY", "MEDIUM", "asks for an approach")
  if (COACHING.test(text)) return YES("COACHING", "MEDIUM", "coaching conversation")
  if (input.intent === "GENERAL_NUTRITION_QUESTION" || GENERAL.test(text)) return YES("GENERAL_NUTRITION", "LOW", "general nutrition question")
  if (concepts.goal.length && QUESTION.test(text)) return YES("STRATEGY", "MEDIUM", "goal-based strategy question")
  return inUncertainBand(text) ? { ...NO("no deterministic knowledge signal; semantic gate may decide", "LOW"), uncertain: true } : NO("no knowledge-seeking signal", "LOW")
}

/**
 * An explicit meal build (already resolved by N1.5) is engine-owned, but a
 * named cuisine or sensory target is strategy the engine cannot represent, so
 * it may retrieve guidance for presenting the engine's draft.
 */
export function decideMealBuildKnowledgeNeed(message: string): KnowledgeNeedDecision {
  const concepts = detectConcepts(message)
  if (concepts.cuisine.length || CUISINE.test(message)) return YES("CUISINE", "HIGH", "meal build names a cuisine")
  if (concepts.sensory.length) return YES("FLAVOR_TEXTURE", "MEDIUM", "meal build names a sensory target")
  return NO("plain meal build: the engine handles it")
}
