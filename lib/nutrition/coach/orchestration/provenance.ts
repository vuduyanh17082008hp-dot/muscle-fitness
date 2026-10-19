import { parseOptions, parseSelection } from "./context"
import type { ActiveEntityReference, ConversationContext, PlanningExtras, PresentedOption, PresentedOptionSnapshot, RecentMessage } from "./types"

/**
 * Provenance + focus ownership (pure, deterministic).
 *
 * Two invariants live here:
 *
 *  1. NO ACTIVE ENTITY WITHOUT VALID PROVENANCE. The meal/food a turn is about must trace to the current user message,
 *     an option the coach actually displayed, the server-held active draft, or a deterministic tool result. An entity whose
 *     sourceRef does not re-resolve against the conversation is rejected (the caller clarifies / falls back safely).
 *
 *  2. ONE OWNER OF "WHAT THE USER WAS SHOWN". The engine (draft + follow-up state) and the conversation (the options the
 *     coach wrote in its own reply) can each hold a pending choice. The newest coach turn is the truth about what the user
 *     can see; state that does not correspond to it is stale and must not capture "option 2" / "make it cheaper".
 */

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()
export const normalizeText = normalize
/** The server holds an active draft but did not pass its name: the draft itself is still a valid, checkable source. */
const DRAFT_FALLBACK_LABEL = "active meal draft"

/** Dish-type descriptors say nothing about WHICH food it is, so they can never ground an ingredient lookup on their own. */
const GENERIC_DISH_WORDS = new Set(["high", "protein", "bowl", "plate", "meal", "wrap", "salad", "snack", "dish", "healthy", "light", "quick", "power", "mixed", "special", "delight", "deluxe", "classic"])

/** Singular/plural-tolerant form ("donuts" == "donut") for evidence matching. */
const stemmed = (text: string) => normalize(text).split(" ").map((word) => word.replace(/(?:es|s)$/, "")).join(" ")
const slug = (text: string) => normalize(text).replace(/\s+/g, "-").slice(0, 40)
export const slugOf = slug

/** Newest coach turn in the window that presented a list of options. */
export function optionsTurnOf(context: ConversationContext) {
  return [...context.turns].reverse().find((turn) => turn.role === "coach" && parseOptions(turn.text).length >= 2) ?? null
}

/**
 * The picked option as an entity. With a displayed-option snapshot the sourceRef points back to that exact snapshot option
 * (`snapshot:<responseId>#<n>`); without one (callers that predate the snapshot) it points at the coach turn.
 */
const optionEntity = (option: PresentedOption, turnsAgo: number, snapshot?: PresentedOptionSnapshot | null): ActiveEntityReference => {
  const shown = snapshot?.options.find((candidate) => candidate.index === option.index && normalize(candidate.label) === normalize(option.text))
  return {
    entityId: shown?.entityId ?? `opt:${option.index}:${slug(option.text)}`,
    label: option.text,
    sourceType: "ASSISTANT_DISPLAYED_OPTION",
    sourceRef: shown && snapshot ? `snapshot:${snapshot.responseId}#${shown.index}` : `turn:${turnsAgo}#${option.index}`,
    createdTurn: turnsAgo,
    lastValidatedTurn: 0,
  }
}

/**
 * Evidence priority (strongest first):
 *   explicit pick in THIS message > pending choice set (unresolved => no entity) > earlier pick still active
 *   > food named in this message > the server-held active draft > a food the last coach turn was about.
 * A stronger explicit selection always overrides stale draft/referent state.
 */
export function deriveActiveEntity(message: string, context: ConversationContext, extras: PlanningExtras = {}): ActiveEntityReference | null {
  const optionsTurn = optionsTurnOf(context)
  if (optionsTurn && context.presentedOptions.length >= 2) {
    const picked = context.turns.length > 0 ? parseSelection(message, context.presentedOptions) : null
    if (picked && !context.correction) return optionEntity(picked, optionsTurn.turnsAgo, extras.snapshot)
    if (context.selectedOption) return optionEntity(context.selectedOption, optionsTurn.turnsAgo, extras.snapshot)
    if (context.referentCandidates.length >= 2) return null
  }
  const lower = message.toLowerCase()
  const own = context.referencedFoods.find((food) => lower.includes(food))
  if (own) return { entityId: `food:${slug(own)}`, label: own, sourceType: "USER_MESSAGE", sourceRef: "message", createdTurn: 0, lastValidatedTurn: 0 }
  if (extras.priorActiveItem) return { entityId: `state:${slug(extras.priorActiveItem)}`, label: extras.priorActiveItem, sourceType: "CONVERSATION_STATE", sourceRef: "state", createdTurn: 0, lastValidatedTurn: 0 }
  const draftName = extras.hasActiveDraft ? (extras.activeDraftName ?? extras.currentTopicFood ?? DRAFT_FALLBACK_LABEL) : null
  if (draftName) return { entityId: `draft:${slug(draftName)}`, label: draftName.toLowerCase(), sourceType: "ACTIVE_DRAFT", sourceRef: "draft", createdTurn: 0, lastValidatedTurn: 0 }
  if (extras.currentTopicFood) return { entityId: `topic:${slug(extras.currentTopicFood)}`, label: extras.currentTopicFood.toLowerCase(), sourceType: "SERVER_TOPIC", sourceRef: "topic", createdTurn: 0, lastValidatedTurn: 0 }
  // Foods carried from earlier turns: the newest turn that actually contains the food is its source.
  for (const food of context.referencedFoods) {
    const turn = [...context.turns].reverse().find((t) => t.text.toLowerCase().includes(food))
    if (turn) return { entityId: `food:${slug(food)}`, label: food, sourceType: turn.role === "user" ? "USER_MESSAGE" : "ASSISTANT_TURN", sourceRef: `turn:${turn.turnsAgo}`, createdTurn: turn.turnsAgo, lastValidatedTurn: 0 }
  }
  return null
}

/** Re-resolves the entity's sourceRef against the real conversation / tool output. False = fabricated or stale. */
export function hasProvenance(entity: ActiveEntityReference, message: string, context: ConversationContext, extras: PlanningExtras = {}, toolFoods: string[] = []): boolean {
  const label = normalize(entity.label)
  if (!label) return false
  switch (entity.sourceType) {
    case "USER_MESSAGE": {
      if (entity.sourceRef === "message") return normalize(message).includes(label)
      const earlier = entity.sourceRef.match(/^turn:(\d+)$/)
      const turn = earlier ? context.turns.find((t) => t.role === "user" && t.turnsAgo === Number(earlier[1])) : undefined
      return Boolean(turn && normalize(turn.text).includes(label))
    }
    case "ASSISTANT_DISPLAYED_OPTION": {
      // Preferred: the sourceRef re-resolves against the displayed-option snapshot (same response, same index, same label).
      const shown = entity.sourceRef.match(/^snapshot:([^#]+)#(\d+)$/)
      if (shown) {
        const option = extras.snapshot?.responseId === shown[1] ? extras.snapshot.options.find((candidate) => candidate.index === Number(shown[2])) : undefined
        return Boolean(option && normalize(option.label) === label && option.entityId === entity.entityId)
      }
      const match = entity.sourceRef.match(/^turn:(\d+)#(\d+)$/)
      if (!match) return false
      const turn = context.turns.find((t) => t.role === "coach" && t.turnsAgo === Number(match[1]))
      const option = turn ? parseOptions(turn.text)[Number(match[2]) - 1] : undefined
      return Boolean(option && normalize(option.text) === label)
    }
    case "ASSISTANT_TURN": {
      const match = entity.sourceRef.match(/^turn:(\d+)$/)
      const turn = match ? context.turns.find((t) => t.role === "coach" && t.turnsAgo === Number(match[1])) : undefined
      return Boolean(turn && normalize(turn.text).includes(label))
    }
    case "ACTIVE_DRAFT": {
      const name = extras.activeDraftName ?? extras.currentTopicFood ?? DRAFT_FALLBACK_LABEL
      return Boolean(extras.hasActiveDraft && normalize(name) === label)
    }
    case "CONVERSATION_STATE":
      return Boolean(extras.priorActiveItem && normalize(extras.priorActiveItem) === label)
    case "SERVER_TOPIC":
      return Boolean(extras.currentTopicFood && normalize(extras.currentTopicFood) === label)
    case "TOOL_RESULT":
      return toolFoods.some((food) => normalize(food) === label)
  }
}

/** Planner-named entities must be supported by the conversation, an offered option, or tool output; the rest are dropped. */
export function groundEntities(names: string[], message: string, context: ConversationContext, options: { lenient?: boolean; toolFoods?: string[] } = {}): { kept: string[]; rejected: string[] } {
  const evidence = [message, ...context.turns.map((turn) => turn.text), ...context.presentedOptions.map((option) => option.text), ...(options.toolFoods ?? [])].map(stemmed).join(" | ")
  const words = new Set(evidence.split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  const kept: string[] = []
  const rejected: string[] = []
  for (const name of names) {
    const key = stemmed(name)
    // Dish names must appear whole. Ingredient lookups ("chicken breast" for "150g chicken") may be grounded by a content word.
    const grounded = Boolean(key) && (evidence.includes(key) || (options.lenient === true && key.split(" ").some((word) => word.length >= 4 && !GENERIC_DISH_WORDS.has(word) && words.has(word))))
    if (grounded) kept.push(name)
    else rejected.push(name)
  }
  return { kept, rejected }
}

/** The short dish name at the head of an option line, original casing ("Protein Shake — 40g protein" => "Protein Shake"). */
export function optionHead(text: string): string {
  return text.split(/\s[—–-]\s|[:(,]|\s\d/)[0].replace(/\*\*/g, "").trim()
}
export const optionName = (text: string): string => normalize(optionHead(text))

/**
 * Drift guard for CONTINUE turns on a picked option: a reply that names a DIFFERENT presented option (and not the picked
 * one) has silently switched entities. Comparisons are legitimate and exempt.
 */
export function driftsFromActiveEntity(reply: string, entity: ActiveEntityReference | null, context: ConversationContext, message: string): boolean {
  if (!entity || entity.sourceType !== "ASSISTANT_DISPLAYED_OPTION" || /\b(?:compare|versus|vs\.?|difference|so với|khác gì)\b/i.test(message)) return false
  const active = optionName(entity.label)
  const lower = normalize(reply)
  return context.presentedOptions.some((option) => {
    const name = optionName(option.text)
    return name.length >= 6 && name !== active && !active.includes(name) && !name.includes(active) && lower.includes(name)
  })
}

/* ---------- focus ownership ---------- */

export type FocusOwner = "ENGINE" | "CONVERSATION"

export const listMatchesEngine = (options: Array<{ text: string }>, engineLabels: string[]) => {
  const n = Math.min(options.length, engineLabels.length)
  return n >= 2 && options.slice(0, n).every((option, i) => normalize(option.text).includes(normalize(engineLabels[i])))
}

/**
 * Who owns the pending choice / referent this turn? Walk the coach's recent turns newest -> oldest:
 *  - a turn that lists >= 2 options owns the focus: ENGINE only if that list IS the engine's list (same labels, same order);
 *    otherwise the user was shown options the engine never produced => CONVERSATION;
 *  - a turn that names an engine meal (draft / follow-up meal / option) owns it for the ENGINE;
 *  - nothing found => ENGINE (the pre-existing behaviour is unchanged).
 */
export function resolveFocusOwner(recent: RecentMessage[], engine: { names: string[]; optionLabels: string[] }): FocusOwner {
  const names = engine.names.map(normalize).filter((name) => name.length >= 4)
  for (const message of [...recent].reverse()) {
    if (message.role !== "coach") continue
    const options = parseOptions(message.text)
    const mentionsEngine = names.some((name) => normalize(message.text).includes(name))
    if (options.length >= 2) return listMatchesEngine(options, engine.optionLabels) || (engine.optionLabels.length === 0 && mentionsEngine) ? "ENGINE" : "CONVERSATION"
    if (mentionsEngine) return "ENGINE"
  }
  return "ENGINE"
}
