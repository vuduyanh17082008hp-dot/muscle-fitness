import { applyDraftOp, assembleDraft, contextConstraints, type DraftOp, type SwapWarning } from "./draft"
import {
  CHOICE_TTL_MS,
  PROPOSAL_TTL_MS,
  draftReferent,
  isFollowUpLive,
  knownMeals,
  matchMeals,
  mealFromDraft,
  mealKey,
  nextFollowUpState,
  type ClarificationRequest,
  type ConversationReferent,
  type FollowUpArgs,
  type FollowUpState,
  type MealModificationProposal,
  type MealResultState,
  type NutritionFollowUpIntent,
  type PendingChoiceContext,
  type StatePatch,
  type StructuredBlock,
  type TargetResolution,
  type TurnResolution,
} from "./followup"
import { findIngredientByText, getIngredient, isIngredientBlocked } from "./ingredients"
import { assessConfidence, totalsFor } from "./macros"
import { guardedPool } from "./optimizer"
import type { ActiveMealDraft, CoachContext, DraftItem, MacroTotals, MealConstraints } from "./types"

/**
 * N1.5.6 follow-up execution — pure and deterministic. Read-only intents read
 * the structured meal; modification intents build a VISIBLE proposal (never a
 * silent mutation) after the allergy/exclusion pre-gate; a proposal only
 * becomes a draft change when the user accepts it, through the existing
 * `applyDraftOp` mechanism. No model, no Supabase, no randomness except ids.
 */

type ActionType = "NONE" | "ASK_BEFORE_BUILD" | "CREATE_MEAL_DRAFT" | "UPDATE_MEAL_DRAFT" | "PROPOSE_LOG"

export type FollowUpExec = {
  route: string
  reply: string
  blocks: StructuredBlock[]
  hints: string[]
  action: ActionType
  draftTarget: "NONE" | "ACTIVE" | "NEW"
  mealDraft: ActiveMealDraft | null
  /** Legacy swap preview (calorie/protein warnings) so the existing proposal UI can render it. */
  proposal: ActiveMealDraft | null
  warnings: Array<{ kind: string; message: string; actions: Array<{ label: string; fit: string }> }>
  patch: StatePatch
  modificationProposal: MealModificationProposal | null
  toolCalls: Array<{ name: "draft_editor" | "macro_calculator"; ok: boolean }>
  safetyBlocked: boolean
  clarified: boolean
  /** Top-level NutritionIntent label for the response envelope. */
  envelopeIntent: "GENERAL_NUTRITION_QUESTION" | "EDIT_ACTIVE_DRAFT" | "MACRO_CALCULATION"
}

export type ExecInput = {
  ctx: CoachContext
  activeDraft: ActiveMealDraft | null
  state: FollowUpState | null
  now: Date
}

const r = (n: number) => Math.round(n)
const short = (id: string) => getIngredient(id)?.shortName ?? id
const macroText = (m: MacroTotals) => `about ${r(m.calories)} kcal, ${r(m.protein)}g protein, ${r(m.carbs)}g carbs and ${r(m.fat)}g fat`
const itemText = (items: DraftItem[]) => items.map((item) => `${short(item.ingredientId)} ${r(item.grams)} g`).join(", ")
const OPEN_CONSTRAINTS: MealConstraints = { calorieCeiling: null, calorieCeilingStrict: false, calorieCeilingSource: "context", proteinTarget: null, proteinTargetSource: "context", maxPriceSgd: null, maxCookMinutes: null, availableIds: null }

const base = (partial: Partial<FollowUpExec> & Pick<FollowUpExec, "route" | "reply">): FollowUpExec => ({
  blocks: [],
  hints: [],
  action: "NONE",
  draftTarget: "NONE",
  mealDraft: null,
  proposal: null,
  warnings: [],
  patch: {},
  modificationProposal: null,
  toolCalls: [],
  safetyBlocked: false,
  clarified: false,
  envelopeIntent: "GENERAL_NUTRITION_QUESTION",
  ...partial,
})

/** An editable draft for a stored meal: the Active Draft itself when ids match, else a fresh assembly from ids + grams. */
export function draftForMeal(meal: MealResultState, ctx: CoachContext, active: ActiveMealDraft | null, options: { fresh?: boolean } = {}): ActiveMealDraft {
  if (active && active.id === meal.id && !options.fresh) return active
  return assembleDraft({
    ctx,
    ...(options.fresh ? {} : { id: meal.id }),
    name: meal.name,
    family: meal.family ?? "choose",
    source: "conversation",
    items: meal.items,
    constraints: contextConstraints(ctx.snapshot) ?? OPEN_CONSTRAINTS,
  })
}

/* =========================================================
   SAFETY PRE-GATE — before any modification becomes actionable
========================================================= */

const singular = (term: string) => (term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term)

/** True when free text names something the user's allergies/exclusions (incl. session dislikes) rule out. Runs before ingredient lookup, so foods we have no data for are still blocked. */
export function violatesGuards(text: string, ctx: CoachContext): boolean {
  const terms = [...ctx.guards.allergies, ...ctx.guards.excludedFoods].map((term) => term.toLowerCase().trim()).filter(Boolean)
  if (terms.length === 0) return false
  const lower = text.toLowerCase()
  if (terms.some((term) => lower.includes(singular(term)))) return true
  const ingredient = findIngredientByText(text)
  return Boolean(ingredient && isIngredientBlocked(ingredient, terms))
}

const blockedReply = (food: string, verb: "add" | "swap in" | "use") =>
  `I can't ${verb} ${food} — it conflicts with an allergy or an excluded food on your profile, and that always wins. Want me to suggest something else instead?`

/* =========================================================
   CLARIFICATION
========================================================= */

function clarification(turn: Extract<TurnResolution, { kind: "follow_up" }>, target: Extract<TargetResolution, { kind: "clarify" }>, input: ExecInput): FollowUpExec {
  const { ctx, state, now } = input
  const left = `${r(ctx.snapshot.caloriesRemaining)} kcal and ${r(ctx.snapshot.proteinRemaining)}g protein`
  const names = target.candidates.map((meal) => meal.name)
  let question: string
  if (target.reason === "ambiguous") question = names.length === 1 ? `Do you mean ${names[0]}?` : `Do you mean ${names.length === 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`}?`
  else if (target.reason === "unanchored_draft") question = `Do you mean “${names[0]}”, the meal in your draft?`
  else if (target.reason === "not_found") question = names.length ? `I don't see a meal like that in this chat. I have ${names.join(" and ")} — which one?` : "I don't have a meal like that in this chat. Want me to build one?"
  else question = `I've lost track of which meal we were on. Tell me the one you mean, or I can build a fresh one from the ${left} you have left today.`

  const candidates = target.candidates.map((meal) => ({ type: meal.id === input.activeDraft?.id ? "MEAL_DRAFT" : "MEAL_RESULT", id: meal.id, name: meal.name }) as ConversationReferent)
  const asked: ClarificationRequest | null = candidates.length
    ? {
        question,
        candidateReferents: candidates,
        expectedResponseType: state?.presentedOptions && target.reason === "ambiguous" ? "OPTION_SELECTION" : "REFERENT_SELECTION",
        expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
        pendingIntent: { intent: turn.intent, args: turn.args },
      }
    : null
  return base({
    route: "followup_clarify",
    reply: question,
    blocks: [{ type: "CLARIFICATION", question, options: names }],
    patch: { clarification: asked, candidateReferents: candidates },
    clarified: true,
  })
}

/* =========================================================
   READ-ONLY + EXPLAIN
========================================================= */

const HINTS_AFTER_MEAL = ["macros?", "why this one?", "cheaper?"]

function whyParts(draft: ActiveMealDraft, meal: MealResultState, ctx: CoachContext): string[] {
  const parts: string[] = []
  const { constraints, nutrition } = draft
  if (constraints.calorieCeiling !== null && nutrition.calories <= constraints.calorieCeiling) parts.push(`it fits the ${r(constraints.calorieCeiling)} kcal you have room for`)
  if (constraints.proteinTarget !== null && nutrition.protein >= constraints.proteinTarget - 2) parts.push(`it covers about ${r(nutrition.protein)}g of protein, toward the ${r(constraints.proteinTarget)}g you're aiming for`)
  if (ctx.guards.allergies.length + ctx.guards.excludedFoods.length > 0) parts.push("it avoids your allergies and excluded foods")
  if (draft.craving?.preserved.length) parts.push(`it keeps what you wanted from the craving (${draft.craving.preserved.slice(0, 2).join(", ")})`)
  for (const line of meal.rationale ?? []) parts.push(line)
  return parts
}

function readOnly(turn: Extract<TurnResolution, { kind: "follow_up" }>, meal: MealResultState, referent: ConversationReferent, input: ExecInput): FollowUpExec {
  const { ctx, activeDraft } = input
  const { intent, args } = turn
  const macros = totalsFor(meal.items)
  const patch: StatePatch = { referent, lastResolved: { intent, args }, candidateReferents: [] }
  const items = meal.items.map((item) => ({ name: getIngredient(item.ingredientId)?.name ?? item.ingredientId, grams: r(item.grams) }))
  const estimated = meal.items.some((item) => getIngredient(item.ingredientId)?.source !== "VERIFIED")

  switch (intent) {
    case "SHOW_INGREDIENTS": {
      const total = meal.items.reduce((sum, item) => sum + item.grams, 0)
      return base({
        route: "followup_ingredients",
        reply: `${meal.name} — ${itemText(meal.items)} (${r(total)} g total).${estimated ? " A few portions are curated estimates, so real products can vary." : ""}`,
        blocks: [{ type: "INGREDIENT_LIST", mealName: meal.name, items }],
        hints: HINTS_AFTER_MEAL,
        patch,
      })
    }
    case "SHOW_MACROS": {
      const confidence = assessConfidence(meal.items).confidence
      return base({
        route: "followup_macros",
        reply: `${meal.name}: ${macroText(macros)}. Macro confidence: ${confidence}.`,
        blocks: [{ type: "MACRO_SUMMARY", mealName: meal.name, macros, confidence }],
        hints: ["ingredients?", "why this one?", "more protein?"],
        patch,
        toolCalls: [{ name: "macro_calculator", ok: true }],
        envelopeIntent: "MACRO_CALCULATION",
      })
    }
    case "SHOW_PORTIONS": {
      const wanted = args.foodText
      if (!wanted) return base({ route: "followup_portions", reply: `${meal.name}: ${itemText(meal.items)}.`, blocks: [{ type: "INGREDIENT_LIST", mealName: meal.name, items }], hints: HINTS_AFTER_MEAL, patch })
      if (/^(?:sauce|seasoning|dressing|flavou?ring)$/.test(wanted)) {
        const flavors = meal.items.filter((item) => getIngredient(item.ingredientId)?.role === "flavor")
        return base({
          route: "followup_portions",
          reply: flavors.length ? `The seasoning counted in ${meal.name} is ${itemText(flavors)}.` : `${meal.name} has no sauce counted in its numbers. Any sauce or seasoning I suggest would be optional and extra to those numbers.`,
          hints: HINTS_AFTER_MEAL,
          patch,
        })
      }
      const ingredient = findIngredientByText(wanted)
      const item = ingredient && meal.items.find((entry) => entry.ingredientId === ingredient.id)
      if (!item) return base({ route: "followup_portions", reply: `There's no ${wanted} in ${meal.name}. It has ${itemText(meal.items)}.`, hints: ["ingredients?", "macros?"], patch })
      const one = totalsFor([item])
      return base({
        route: "followup_portions",
        reply: `${meal.name} has ${r(item.grams)} g of ${short(item.ingredientId)}, which is ${macroText(one)}.`,
        hints: ["ingredients?", "macros?", "cheaper?"],
        patch,
        toolCalls: [{ name: "macro_calculator", ok: true }],
      })
    }
    case "EXPLAIN_RECOMMENDATION": {
      const draft = draftForMeal(meal, ctx, activeDraft)
      const parts = whyParts(draft, meal, ctx)
      const left = `${r(ctx.snapshot.caloriesRemaining)} kcal and ${r(ctx.snapshot.proteinRemaining)}g protein left today`
      const reply = parts.length
        ? `${meal.name} makes sense because ${parts.slice(0, 3).join("; ")}. For reference, you have ${left}.`
        : `${meal.name} was the best-scoring combination my meal builder found among the foods you can eat, against the ${left}.`
      return base({ route: "followup_why", reply, hints: ["macros?", "ingredients?", "cheaper?"], patch })
    }
    default:
      return base({ route: "followup_read", reply: `${meal.name}: ${macroText(macros)}.`, patch })
  }
}

/* =========================================================
   MODIFICATION → VISIBLE PROPOSAL
========================================================= */

function diffItems(before: DraftItem[], after: DraftItem[]): string[] {
  const changes: string[] = []
  for (const item of before) {
    const next = after.find((entry) => entry.ingredientId === item.ingredientId)
    if (!next) changes.push(`Remove ${short(item.ingredientId)} (${r(item.grams)} g)`)
    else if (Math.abs(next.grams - item.grams) >= 1) changes.push(`${short(item.ingredientId)} ${r(item.grams)} g → ${r(next.grams)} g`)
  }
  for (const item of after) if (!before.some((entry) => entry.ingredientId === item.ingredientId)) changes.push(`Add ${short(item.ingredientId)} (${r(item.grams)} g)`)
  return changes
}

const itemsOf = (draft: ActiveMealDraft): DraftItem[] => draft.ingredients.map(({ ingredientId, grams }) => ({ ingredientId, grams }))

type OpPlan = { ops: DraftOp[] } | { reply: string; safetyBlocked?: boolean }

function planOps(turn: Extract<TurnResolution, { kind: "follow_up" }>, meal: MealResultState, ctx: CoachContext): OpPlan {
  const { intent, args } = turn
  const inMeal = (id: string | undefined) => (id ? meal.items.find((item) => item.ingredientId === id) : undefined)

  switch (intent) {
    case "MODIFY_PREVIOUS_RESULT":
      return args.modifier ? { ops: [{ type: args.modifier }] } : { reply: "What should I change — the price, the protein, the calories, or the flavor?" }

    case "ADD_INGREDIENT": {
      const text = args.foodText ?? ""
      if (violatesGuards(text, ctx)) return { reply: blockedReply(text, "add"), safetyBlocked: true }
      const ingredient = findIngredientByText(text)
      if (!ingredient) return { reply: `I don't have verified nutrition data for ${text}, so I can't add it without guessing.` }
      return { ops: [{ type: "add", ingredientId: ingredient.id }] }
    }

    case "REMOVE_INGREDIENT": {
      const ingredient = args.foodText ? findIngredientByText(args.foodText) : undefined
      if (!ingredient || !inMeal(ingredient.id)) return { reply: `${args.foodText ?? "That"} isn't in ${meal.name}, so nothing would change.` }
      return { ops: [{ type: "remove", ingredientId: ingredient.id }] }
    }

    case "ADJUST_QUANTITY": {
      const ingredient = args.foodText ? findIngredientByText(args.foodText) : undefined
      const item = inMeal(ingredient?.id)
      if (!args.factor) return { reply: `Do you want a bit more or less ${args.foodText ?? "of it"}, or double or half?` }
      if (!ingredient || !item) return { reply: `${args.foodText ?? "That"} isn't in ${meal.name}, so I can't change its portion.` }
      return { ops: [{ type: "set_grams", ingredientId: ingredient.id, grams: Math.max(1, r(item.grams * args.factor)) }] }
    }

    case "SUBSTITUTE_IN_PREVIOUS_RESULT": {
      const fromHint = args.fromText ?? undefined
      const present = args.foodText ? findIngredientByText(args.foodText) : undefined
      // "replace chicken" where chicken is already in the meal names the thing to replace, not the replacement.
      if (!args.toText && present && inMeal(present.id)) return { reply: `What should replace the ${short(present.id)} in ${meal.name}? Tell me a food and I'll recalculate exactly.` }
      const toText = args.toText ?? args.foodText ?? ""
      if (violatesGuards(toText, ctx)) return { reply: blockedReply(toText, "swap in"), safetyBlocked: true }
      const to = findIngredientByText(toText)
      if (!to) return { reply: `I don't have verified nutrition data for ${toText}, so I can't swap it in without guessing.` }
      if (inMeal(to.id)) return { reply: `${short(to.id)} is already in ${meal.name}.` }
      const named = fromHint ? findIngredientByText(fromHint) : undefined
      if (fromHint && (!named || !inMeal(named.id))) return { reply: `${fromHint} isn't in ${meal.name}, so there's nothing to replace.` }
      // No "from" given: the largest ingredient with the same role is what a swap most plausibly means.
      const sameRole = meal.items.filter((item) => getIngredient(item.ingredientId)?.role === to.role).sort((a, b) => b.grams - a.grams)[0]
      const from = named?.id ?? sameRole?.ingredientId
      if (!from) return { reply: `Nothing in ${meal.name} plays the same role as ${short(to.id)}. Tell me what to replace and I'll recalculate.` }
      return { ops: [{ type: "swap", from, to: to.id }] }
    }

    case "APPLY_DIETARY_CONSTRAINT": {
      const term = args.dietary ?? ""
      const pool = guardedPool(ctx.guards, null).filter((item) => !isIngredientBlocked(item, [term]))
      const ops: DraftOp[] = []
      for (const item of meal.items) {
        const ingredient = getIngredient(item.ingredientId)
        if (!ingredient || !isIngredientBlocked(ingredient, [term])) continue
        const replacement = pool.filter((candidate) => candidate.role === ingredient.role && !meal.items.some((entry) => entry.ingredientId === candidate.id)).sort((a, b) => b.proteinPer100g - a.proteinPer100g)[0]
        if (replacement) ops.push({ type: "swap", from: ingredient.id, to: replacement.id, fit: "force" })
        else if (meal.items.length - ops.filter((op) => op.type === "remove").length > 1) ops.push({ type: "remove", ingredientId: ingredient.id })
      }
      if (ops.length === 0) return { reply: meal.items.some((item) => isIngredientBlocked(getIngredient(item.ingredientId)!, [term])) ? `I couldn't find a safe ${term}-free replacement that keeps ${meal.name} intact.` : `${meal.name} already has nothing that contains ${term}.` }
      return { ops }
    }

    default:
      return { reply: "What would you like to change?" }
  }
}

/** Runs the ops on an in-memory draft. Returns the candidate or the first refusal. */
function dryRun(ctx: CoachContext, source: ActiveMealDraft, ops: DraftOp[]): { ok: true; draft: ActiveMealDraft } | { ok: false; message: string; warnings: SwapWarning[]; proposal: ActiveMealDraft | null } {
  let working = source
  for (const op of ops) {
    const outcome = applyDraftOp(ctx, working, op)
    if (!outcome.applied) return { ok: false, message: outcome.message, warnings: outcome.warnings, proposal: outcome.proposal }
    working = outcome.draft
  }
  return { ok: true, draft: working }
}

function propose(turn: Extract<TurnResolution, { kind: "follow_up" }>, meal: MealResultState, referent: ConversationReferent, input: ExecInput): FollowUpExec {
  const { ctx, activeDraft, now } = input
  const patch: StatePatch = { referent, lastResolved: { intent: turn.intent, args: turn.args }, candidateReferents: [] }
  const plan = planOps(turn, meal, ctx)
  if ("reply" in plan) return base({ route: "followup_propose", reply: plan.reply, patch, safetyBlocked: plan.safetyBlocked ?? false, hints: plan.safetyBlocked ? ["something else?", "macros?"] : [], envelopeIntent: "EDIT_ACTIVE_DRAFT" })

  const source = draftForMeal(meal, ctx, activeDraft)
  let ops = plan.ops
  let lead = ""
  let result = dryRun(ctx, source, ops)
  // A swap that trips the calorie/protein guard: propose the first fitting variant (reduce portion, add protein...) and say so; "accept anyway" is the last resort.
  if (!result.ok && ops.length === 1 && ops[0].type === "swap" && result.warnings.length > 0) {
    const swap = ops[0]
    const refusal = result.message
    const fits = result.warnings.flatMap((warning) => warning.actions).sort((a, b) => Number(a.fit === "force") - Number(b.fit === "force"))
    for (const action of fits) {
      const attempt = dryRun(ctx, source, [{ ...swap, fit: action.fit }])
      if (attempt.ok) {
        ops = [{ ...swap, fit: action.fit }]
        result = attempt
        lead = `${refusal} To keep it workable I'd ${action.label.toLowerCase()}. `
        break
      }
    }
  }
  if (!result.ok) {
    const usesActive = source.id === activeDraft?.id
    return base({ route: "followup_propose", reply: result.message, patch, proposal: usesActive ? result.proposal : null, warnings: usesActive ? result.warnings : [], envelopeIntent: "EDIT_ACTIVE_DRAFT", toolCalls: [{ name: "draft_editor", ok: false }], draftTarget: usesActive && result.proposal ? "ACTIVE" : "NONE" })
  }

  const before = totalsFor(meal.items)
  const after = result.draft.nutrition
  const changes = diffItems(meal.items, itemsOf(result.draft))
  if (changes.length === 0) return base({ route: "followup_propose", reply: `That wouldn't change anything in ${meal.name}.`, patch, envelopeIntent: "EDIT_ACTIVE_DRAFT" })

  const ceiling = meal.id === activeDraft?.id ? activeDraft.constraints.calorieCeiling : source.constraints.calorieCeiling
  const over = ceiling !== null && after.calories > ceiling && after.calories > before.calories ? ` Heads-up: that's above your ${r(ceiling)} kcal target.` : ""
  const expiresAt = new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString()
  const proposal: MealModificationProposal = {
    sourceMealResultId: meal.id,
    proposedChanges: changes,
    resultingIngredients: result.draft.ingredients.map((item) => ({ name: item.name, grams: r(item.grams) })),
    resultingMacros: after,
    currentMacros: before,
    rationale: [],
    requiresConfirmation: true,
    expiresAt,
  }
  return base({
    route: "followup_proposal",
    reply: `${lead}Here's a proposal for ${meal.name}: ${changes.join("; ")}. That would make it ${r(after.calories)} kcal and ${r(after.protein)}g protein (it's ${r(before.calories)} kcal and ${r(before.protein)}g now).${over} Nothing changes until you confirm — apply it?`,
    blocks: [{ type: "MODIFICATION_PROPOSAL", mealName: meal.name, changes, before, after, expiresAt }],
    hints: ["yes", "no", "macros?"],
    patch: { ...patch, pendingProposal: { sourceMealResultId: meal.id, ops, baseKey: mealKey(meal.items), expiresAt } },
    modificationProposal: proposal,
    toolCalls: [{ name: "draft_editor", ok: true }],
    envelopeIntent: "EDIT_ACTIVE_DRAFT",
  })
}

/** The user's yes/no on a visible proposal. Accepting re-validates freshness and guards, then uses the existing draft editor. */
export function decideProposal(turn: Extract<TurnResolution, { kind: "proposal_decision" }>, input: ExecInput): FollowUpExec {
  const { ctx, activeDraft, state, now } = input
  const { proposal } = turn
  const meal = knownMeals(isFollowUpLive(state, now) ? state : null, activeDraft ? mealFromDraft(activeDraft) : null).find((m) => m.id === proposal.sourceMealResultId)

  if (!turn.accept) return base({ route: "proposal_rejected", reply: `No problem — I left ${meal?.name ?? "the meal"} as it was. Nothing changed.`, patch: { pendingProposal: null }, envelopeIntent: "EDIT_ACTIVE_DRAFT" })
  if (turn.stale || !meal || mealKey(meal.items) !== proposal.baseKey)
    return base({ route: "proposal_stale", reply: "That proposal is out of date — the meal changed or the proposal expired — so I didn't apply anything. Ask again and I'll redo it with the current numbers.", patch: { pendingProposal: null }, envelopeIntent: "EDIT_ACTIVE_DRAFT" })

  const pool = new Set(guardedPool(ctx.guards, null).map((item) => item.id))
  const ids = proposal.ops.flatMap((op) => (op.type === "swap" ? [op.to] : op.type === "add" ? [op.ingredientId] : []))
  if (ids.some((id) => !pool.has(id))) return base({ route: "proposal_blocked", reply: blockedReply("that ingredient", "use"), patch: { pendingProposal: null }, safetyBlocked: true, envelopeIntent: "EDIT_ACTIVE_DRAFT" })

  const inPlace = activeDraft?.id === meal.id
  const source = inPlace ? activeDraft! : draftForMeal(meal, ctx, null, { fresh: true })
  const result = dryRun(ctx, source, proposal.ops)
  if (!result.ok) return base({ route: "proposal_failed", reply: `I couldn't apply that: ${result.message}`, patch: { pendingProposal: null }, envelopeIntent: "EDIT_ACTIVE_DRAFT", toolCalls: [{ name: "draft_editor", ok: false }] })

  const draft = result.draft
  return base({
    route: "proposal_applied",
    reply: `Done — ${draft.name} is now ${r(draft.nutrition.calories)} kcal and ${r(draft.nutrition.protein)}g protein (${itemText(itemsOf(draft))}). You can undo it from the draft, and nothing is logged until you confirm.`,
    action: inPlace ? "UPDATE_MEAL_DRAFT" : "CREATE_MEAL_DRAFT",
    draftTarget: inPlace ? "ACTIVE" : "NEW",
    mealDraft: draft,
    hints: ["macros?", "log this meal"],
    patch: { pendingProposal: null, referent: draftReferent(draft), upsertMeals: [mealFromDraft(draft)], newReferent: !inPlace, candidateReferents: [] },
    toolCalls: [{ name: "draft_editor", ok: true }],
    envelopeIntent: "EDIT_ACTIVE_DRAFT",
  })
}

/* =========================================================
   OPTIONS, COMPARISON, CORRECTION, UNDO
========================================================= */

function select(meal: MealResultState, referent: ConversationReferent, turn: Extract<TurnResolution, { kind: "follow_up" }>, input: ExecInput): FollowUpExec {
  const { ctx, activeDraft } = input
  const macros = totalsFor(meal.items)
  const activate = activeDraft?.id !== meal.id
  const draft = activate ? draftForMeal(meal, ctx, null) : null
  return base({
    route: "followup_select",
    reply: `${meal.name} it is — ${macroText(macros)}. Want the ingredients, or any changes?`,
    action: activate ? "CREATE_MEAL_DRAFT" : "NONE",
    draftTarget: activate ? "NEW" : "NONE",
    mealDraft: draft,
    hints: ["ingredients?", "why this one?", "cheaper?"],
    patch: { referent: draft ? draftReferent(draft) : referent, upsertMeals: draft ? [mealFromDraft(draft)] : [], newReferent: true, candidateReferents: [], lastResolved: { intent: turn.intent, args: turn.args } },
  })
}

function compare(input: ExecInput): FollowUpExec {
  const { state, activeDraft, now } = input
  const live = isFollowUpLive(state, now) ? state : null
  const meals = knownMeals(live, activeDraft ? mealFromDraft(activeDraft) : null)
  const options = live?.presentedOptions?.options ?? []
  const rows = options.flatMap((option) => {
    const meal = meals.find((m) => m.id === option.id)
    return meal ? [{ id: meal.id, label: meal.name, ...totalsFor(meal.items) }] : []
  })
  if (rows.length < 2) return base({ route: "followup_compare", reply: rows[0] ? `I only have ${rows[0].label} on the table right now — want me to build another option to compare?` : "There's nothing to compare yet. Want me to build a couple of options?", hints: [] })
  const best = [...rows].sort((a, b) => b.protein - a.protein)[0]
  return base({
    route: "followup_compare",
    reply: `${rows.map((row, i) => `${i + 1}. ${row.label}: ${r(row.calories)} kcal, ${r(row.protein)}g protein`).join(" · ")}. ${best.label} has the most protein.`,
    blocks: [{ type: "MEAL_COMPARISON", rows: rows.map((row) => ({ id: row.id, label: row.label, calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat })) }],
    hints: ["first one", "second one"],
    patch: {},
  })
}

function correct(turn: Extract<TurnResolution, { kind: "follow_up" }>, target: TargetResolution, input: ExecInput): FollowUpExec {
  const { state, now } = input
  const live = isFollowUpLive(state, now) ? state : null
  const previous = live?.lastResolved
  if (target.kind === "meal" && turn.args.nameText) {
    const corrected = { ...turn, intent: previous?.intent ?? ("SHOW_MACROS" as NutritionFollowUpIntent), args: previous?.args ?? ({} as FollowUpArgs) }
    if (!previous) return base({ route: "followup_correct", reply: `Got it — ${target.meal.name}. What would you like: the ingredients, the macros, or a change?`, hints: ["ingredients?", "macros?", "cheaper?"], patch: { referent: target.referent, newReferent: true, candidateReferents: [] } })
    const rerun = corrected.intent === "CORRECT_PREVIOUS_RESOLUTION" ? null : runIntent(corrected, { kind: "meal", meal: target.meal, referent: target.referent, confidence: "HIGH", via: "explicit" }, input)
    if (!rerun) return base({ route: "followup_correct", reply: `Got it — ${target.meal.name}.`, patch: { referent: target.referent, newReferent: true } })
    return { ...rerun, reply: `Got it — ${target.meal.name}. ${rerun.reply}`, patch: { ...rerun.patch, referent: target.referent, newReferent: true } }
  }
  // "Not that one": repair by asking among the OTHER known meals, then continue the original ask.
  const wrongId = target.kind === "meal" ? target.meal.id : null
  const others = knownMeals(live, input.activeDraft ? mealFromDraft(input.activeDraft) : null).filter((meal) => meal.id !== wrongId)
  if (others.length === 0) return base({ route: "followup_correct", reply: "Sorry about that — which meal did you mean? Tell me its name, or I can build a new one.", hints: [] })
  const synthetic = { ...turn, intent: previous?.intent ?? ("SHOW_MACROS" as NutritionFollowUpIntent), args: previous?.args ?? ({} as FollowUpArgs) }
  return clarification(synthetic, { kind: "clarify", candidates: others, reason: "ambiguous" }, input)
}

function undo(turn: Extract<TurnResolution, { kind: "follow_up" }>, input: ExecInput): FollowUpExec {
  const { ctx, activeDraft, state, now } = input
  const live = isFollowUpLive(state, now) ? state : null
  if (live?.pendingProposal) return base({ route: "followup_undo", reply: "Dropped that proposal — nothing changed.", patch: { pendingProposal: null }, envelopeIntent: "EDIT_ACTIVE_DRAFT" })
  if (!activeDraft || activeDraft.historyIndex <= 0) return base({ route: "followup_undo", reply: "There's nothing to undo yet — the meal is still as it was first built.", envelopeIntent: "EDIT_ACTIVE_DRAFT" })
  const op: DraftOp = turn.intent === "REVERT_TO_ORIGINAL" ? { type: "restore", version: activeDraft.history[0].version } : { type: "undo" }
  const outcome = applyDraftOp(ctx, activeDraft, op)
  return base({
    route: "followup_undo",
    reply: outcome.applied ? `Done — ${outcome.draft.name} is back to ${r(outcome.draft.nutrition.calories)} kcal and ${r(outcome.draft.nutrition.protein)}g protein.` : outcome.message,
    action: outcome.applied ? "UPDATE_MEAL_DRAFT" : "NONE",
    draftTarget: "ACTIVE",
    mealDraft: outcome.applied ? outcome.draft : null,
    patch: outcome.applied ? { upsertMeals: [mealFromDraft(outcome.draft)], referent: draftReferent(outcome.draft) } : {},
    toolCalls: [{ name: "draft_editor", ok: outcome.applied }],
    envelopeIntent: "EDIT_ACTIVE_DRAFT",
  })
}

/* =========================================================
   ENTRY POINT
========================================================= */

function runIntent(turn: Extract<TurnResolution, { kind: "follow_up" }>, target: Extract<TargetResolution, { kind: "meal" }>, input: ExecInput): FollowUpExec {
  switch (turn.resolution.responseMode) {
    case "PROPOSE_MODIFICATION":
      return propose(turn, target.meal, target.referent, input)
    default:
      return turn.intent === "SELECT_PREVIOUS_OPTION" ? select(target.meal, target.referent, turn, input) : readOnly(turn, target.meal, target.referent, input)
  }
}

export function executeFollowUp(turn: Extract<TurnResolution, { kind: "follow_up" }>, input: ExecInput): FollowUpExec {
  if (turn.intent === "UNDO_LAST_PROPOSAL" || turn.intent === "REVERT_TO_ORIGINAL") return undo(turn, input)
  if (turn.intent === "COMPARE_PREVIOUS_OPTIONS") return compare(input)
  if (turn.intent === "CORRECT_PREVIOUS_RESOLUTION") return correct(turn, turn.target, input)
  if (turn.target.kind === "clarify") return clarification(turn, turn.target, input)
  return runIntent(turn, turn.target, input)
}

/** Builds the presented-options context + OPTION_LIST block when the engine offered alternatives alongside the recommendation. */
export function presentOptions(main: ActiveMealDraft, alternatives: ActiveMealDraft[], now: Date): { choice: PendingChoiceContext; meals: MealResultState[]; block: StructuredBlock } | null {
  const shown = alternatives.filter((alt, index, all) => alt.name !== main.name && all.findIndex((other) => other.name === alt.name) === index).slice(0, 2)
  if (shown.length === 0) return null
  const all = [main, ...shown]
  return {
    choice: { options: all.map((draft) => ({ id: draft.id, label: draft.name })), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + CHOICE_TTL_MS).toISOString() },
    meals: all.map((draft) => mealFromDraft(draft)),
    block: { type: "OPTION_LIST", options: all.map((draft) => ({ id: draft.id, label: draft.name, calories: draft.nutrition.calories, protein: draft.nutrition.protein })) },
  }
}

export { matchMeals, nextFollowUpState }
