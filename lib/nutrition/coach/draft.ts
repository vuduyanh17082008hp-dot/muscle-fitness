import { compareToOriginal } from "./claims"
import { suggestAdditions, suggestProteinIceCreamThickener } from "./gaps"
import { getIngredient, requireIngredient } from "./ingredients"
import { assessConfidence, cookMinutesFor, priceFor, roundGrams, scaleItems, totalsFor, validateMeal } from "./macros"
import { buildFromSelection, guardedPool, mealName } from "./optimizer"
import type {
  ActiveMealDraft,
  ContextSnapshot,
  CoachContext,
  CravingInfo,
  DraftItem,
  DraftStatus,
  DraftVersion,
  MealConstraints,
  MealDraftSource,
  OptimizerMode,
  ScalingMode,
} from "./types"

/* =========================================================
   CONTEXT SNAPSHOT + STALE DETECTION
========================================================= */

export const STALE_CALORIE_DELTA = 75
export const STALE_PROTEIN_DELTA = 10

export function makeSnapshot(input: Omit<ContextSnapshot, "contextVersion">): ContextSnapshot {
  return {
    ...input,
    contextVersion: [input.localDate, input.goal ?? "none", Math.round(input.caloriesTarget), Math.round(input.proteinTarget), Math.round(input.caloriesConsumed), Math.round(input.proteinConsumed)].join(":"),
  }
}

/** The snapshot records what the meal was optimized against; Athlete State stays current truth. */
export function isStale(snapshot: ContextSnapshot, current: ContextSnapshot): boolean {
  return (
    snapshot.localDate !== current.localDate ||
    snapshot.goal !== current.goal ||
    Math.round(snapshot.caloriesTarget) !== Math.round(current.caloriesTarget) ||
    Math.round(snapshot.proteinTarget) !== Math.round(current.proteinTarget) ||
    Math.abs(snapshot.caloriesRemaining - current.caloriesRemaining) >= STALE_CALORIE_DELTA ||
    Math.abs(snapshot.proteinRemaining - current.proteinRemaining) >= STALE_PROTEIN_DELTA
  )
}

export const STALE_MESSAGE = "Your nutrition target has changed since this meal was created."

/** Constraints for "Build My Next Meal": remaining calories as the ceiling, remaining protein as the target. */
export function contextConstraints(snapshot: ContextSnapshot): MealConstraints | null {
  if (snapshot.caloriesRemaining < 100) return null
  return {
    calorieCeiling: Math.round(snapshot.caloriesRemaining),
    calorieCeilingStrict: false,
    calorieCeilingSource: "context",
    proteinTarget: Math.round(Math.min(60, Math.max(20, snapshot.proteinRemaining))),
    proteinTargetSource: "context",
    maxPriceSgd: null,
    maxCookMinutes: null,
    availableIds: null,
  }
}

/* =========================================================
   DRAFT ASSEMBLY — everything derived is recomputed here.
========================================================= */

export type AssembleInput = {
  ctx: CoachContext
  id?: string
  name?: string
  family: string
  source?: MealDraftSource
  mode?: OptimizerMode
  items: DraftItem[]
  constraints: MealConstraints
  scalingMode?: ScalingMode
  snapshot?: ContextSnapshot
  history?: DraftVersion[]
  historyIndex?: number
  acknowledgedContextVersion?: string | null
  craving?: CravingInfo | null
  lockedStatus?: Extract<DraftStatus, "CONFIRMED" | "LOGGED"> | null
  preparedBy?: "home" | "restaurant" | "packaged"
}

export function assembleDraft(input: AssembleInput): ActiveMealDraft {
  const items = input.items.map((item) => ({ ingredientId: item.ingredientId, grams: item.grams }))
  const snapshot = input.snapshot ?? input.ctx.snapshot
  const violations = validateMeal(items, input.constraints)
  const { confidence, reasons } = assessConfidence(items, { preparedBy: input.preparedBy })
  const acknowledged = input.acknowledgedContextVersion ?? null
  const stale = isStale(snapshot, input.ctx.snapshot) && acknowledged !== input.ctx.snapshot.contextVersion

  const status: DraftStatus = input.lockedStatus ?? (stale ? "STALE_CONTEXT" : violations.length === 0 ? "READY" : "DRAFT")

  const history = input.history ?? [{ version: 1, label: "Created", ingredients: items }]
  const notes: string[] = []
  if (violations.length > 0) notes.push("I couldn't satisfy every constraint simultaneously.", ...violations.map((v) => v.message))
  if (stale) notes.push(STALE_MESSAGE)

  return {
    id: input.id ?? globalThis.crypto.randomUUID(),
    name: input.name ?? mealName(items, input.family),
    family: input.family,
    source: input.source,
    mode: input.mode ?? "BALANCED",
    sessionContextSnapshot: snapshot,
    ingredients: items.map((item) => ({ ...item, name: requireIngredient(item.ingredientId).name })),
    nutrition: totalsFor(items),
    estimatedPriceSgd: priceFor(items),
    cookMinutes: cookMinutesFor(items),
    constraints: input.constraints,
    confidence,
    confidenceReasons: reasons,
    scalingMode: input.scalingMode ?? "AUTO",
    suggestions:
      input.craving?.key === "protein_ice_cream"
        ? suggestProteinIceCreamThickener(input.ctx, items)
        : suggestAdditions(input.ctx, items, input.constraints),
    history,
    historyIndex: input.historyIndex ?? history.length - 1,
    status,
    violations,
    notes,
    acknowledgedContextVersion: acknowledged,
    craving: input.craving ? { ...input.craving, comparison: compareToOriginal(input.craving.original, totalsFor(items)) } : null,
  }
}

/* =========================================================
   OPERATIONS — every edit is a deterministic recalculation.
========================================================= */

export type SwapFit = "force" | "reduce_portion" | "increase_portion" | "add_protein" | "leaner" | "other_swap"

export type DraftOp =
  | { type: "swap"; from: string; to: string; fit?: SwapFit }
  | { type: "add"; ingredientId: string; grams?: number }
  | { type: "remove"; ingredientId: string }
  | { type: "set_grams"; ingredientId: string; grams: number }
  | { type: "scale"; mode: ScalingMode; targetCalories?: number; targetProtein?: number; strict?: boolean }
  | { type: "more_protein" }
  | { type: "more_carbs" }
  | { type: "lower_calories" }
  | { type: "cheaper" }
  | { type: "faster" }
  | { type: "more_filling" }
  | { type: "tastier" }
  | { type: "use_available"; ingredientIds: string[] }
  | { type: "set_constraints"; calorieCeiling?: number | null; strict?: boolean; proteinTarget?: number | null; maxPriceSgd?: number | null; maxCookMinutes?: number | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "restore"; version: number }
  | { type: "refresh" }
  | { type: "keep" }

export type SwapWarning = {
  kind: "CALORIE_CEILING" | "PROTEIN_SHORT"
  message: string
  actions: Array<{ label: string; fit: SwapFit }>
}

export type OpOutcome = {
  applied: boolean
  message: string
  warnings: SwapWarning[]
  /** For a swap with warnings: the previewed (not applied) result. */
  proposal: ActiveMealDraft | null
}

const itemsOf = (draft: ActiveMealDraft): DraftItem[] => draft.ingredients.map(({ ingredientId, grams }) => ({ ingredientId, grams }))

function commit(ctx: CoachContext, draft: ActiveMealDraft, label: string, items: DraftItem[], patch: Partial<AssembleInput> = {}): ActiveMealDraft {
  const kept = draft.history.slice(0, draft.historyIndex + 1)
  const history = [...kept, { version: kept[kept.length - 1].version + 1, label, ingredients: items.map((i) => ({ ...i })) }]
  return assembleDraft({
    ctx,
    id: draft.id,
    name: draft.name,
    family: draft.family,
    source: draft.source,
    mode: draft.mode,
    items,
    constraints: draft.constraints,
    scalingMode: draft.scalingMode,
    snapshot: draft.sessionContextSnapshot,
    history,
    historyIndex: history.length - 1,
    acknowledgedContextVersion: draft.acknowledgedContextVersion,
    craving: draft.craving,
    ...patch,
  })
}

function jumpTo(ctx: CoachContext, draft: ActiveMealDraft, index: number): ActiveMealDraft {
  const version = draft.history[index]
  return assembleDraft({
    ctx,
    id: draft.id,
    name: draft.name,
    family: draft.family,
    source: draft.source,
    mode: draft.mode,
    items: version.ingredients,
    constraints: draft.constraints,
    scalingMode: draft.scalingMode,
    snapshot: draft.sessionContextSnapshot,
    history: draft.history,
    historyIndex: index,
    acknowledgedContextVersion: draft.acknowledgedContextVersion,
    craving: draft.craving,
  })
}

const done = (message: string, applied = true): OpOutcome => ({ applied, message, warnings: [], proposal: null })

function scaleTarget(draft: ActiveMealDraft) {
  const { constraints } = draft
  const target = constraints.calorieCeiling === null ? null : constraints.calorieCeiling * (constraints.calorieCeilingStrict ? 0.97 : 0.95)
  return { mode: "AUTO" as const, targetCalories: target, targetProtein: constraints.proteinTarget }
}

function swapItems(items: DraftItem[], fromId: string, toId: string): DraftItem[] {
  const from = items.find((item) => item.ingredientId === fromId)
  const target = requireIngredient(toId)
  const grams = from ? from.grams : target.typicalGrams
  const without = items.filter((item) => item.ingredientId !== fromId && item.ingredientId !== toId)
  const position = items.findIndex((item) => item.ingredientId === fromId)
  const next: DraftItem = { ingredientId: toId, grams: roundGrams(target, grams) }
  without.splice(position < 0 ? without.length : Math.min(position, without.length), 0, next)
  return without
}

function newViolationKinds(before: ActiveMealDraft, items: DraftItem[]) {
  const had = new Set(before.violations.map((v) => v.constraint))
  return validateMeal(items, before.constraints).filter((v) => (v.constraint === "calorieCeiling" || v.constraint === "protein") && !had.has(v.constraint))
}

function applySwap(ctx: CoachContext, draft: ActiveMealDraft, op: Extract<DraftOp, { type: "swap" }>): OpOutcome & { draft: ActiveMealDraft } {
  const fromName = getIngredient(op.from)?.shortName ?? op.from
  const pool = guardedPool(ctx.guards, draft.constraints.availableIds)
  const present = draft.ingredients.some((item) => item.ingredientId === op.from)
  if (!present) return { draft, ...done(`${fromName} isn't in this meal.`, false) }

  const wanted = op.fit === "leaner" || op.fit === "other_swap" ? pickAlternative(draft, pool, op) : op.to
  if (!wanted) return { draft, ...done("I couldn't find another swap that fits your targets.", false) }
  const toIngredient = getIngredient(wanted)
  if (!toIngredient || !pool.some((item) => item.id === wanted)) return { draft, ...done(`I can't use ${toIngredient?.shortName ?? wanted} (not available or excluded for you).`, false) }

  let items = swapItems(itemsOf(draft), op.from, wanted)
  const target = scaleTarget(draft)

  if (op.fit === "reduce_portion") items = scaleItems(items, { mode: "AUTO", targetCalories: target.targetCalories, targetProtein: null })
  if (op.fit === "increase_portion") items = scaleItems(items, { mode: "PROTEIN_ADJUST", targetProtein: draft.constraints.proteinTarget })
  if (op.fit === "add_protein") {
    const extra = suggestAdditions(ctx, items, draft.constraints).find((s) => s.necessity === "REQUIRED_FOR_TARGET")
    if (extra) items = [...items, { ingredientId: extra.ingredientId, grams: extra.grams }]
  }

  const warnings: SwapWarning[] = []
  if (!op.fit || op.fit === "other_swap" || op.fit === "leaner") {
    for (const v of newViolationKinds(draft, items)) {
      if (v.constraint === "calorieCeiling") {
        warnings.push({
          kind: "CALORIE_CEILING",
          message: `This swap would increase the meal to ${Math.round(v.actual)} kcal, above your ${Math.round(v.requested)} kcal target.`,
          actions: [{ label: "Accept anyway", fit: "force" }, { label: "Reduce portion", fit: "reduce_portion" }, { label: "Find leaner option", fit: "leaner" }],
        })
      } else {
        warnings.push({
          kind: "PROTEIN_SHORT",
          message: `This version would fall ${Math.round(v.requested - v.actual)}g short of this meal's protein target.`,
          actions: [{ label: "Add protein", fit: "add_protein" }, { label: "Increase portion", fit: "increase_portion" }, { label: "Find another swap", fit: "other_swap" }],
        })
      }
    }
  }

  const label = `Swap ${fromName} → ${toIngredient.shortName}`
  const next = commit(ctx, draft, label, items)
  if (warnings.length > 0) return { draft, applied: false, message: warnings.map((w) => w.message).join(" "), warnings, proposal: next }
  return { draft: next, ...done(`${label}. Macros recalculated: ${Math.round(next.nutrition.calories)} kcal, ${Math.round(next.nutrition.protein)}g protein.`) }
}

function pickAlternative(draft: ActiveMealDraft, pool: ReturnType<typeof guardedPool>, op: Extract<DraftOp, { type: "swap" }>): string | null {
  const from = requireIngredient(op.from)
  const current = op.to
  const candidates = pool
    .filter((item) => item.role === from.role && item.id !== op.from && item.id !== current && !draft.ingredients.some((i) => i.ingredientId === item.id))
    .map((item) => ({ item, items: swapItems(itemsOf(draft), op.from, item.id) }))
    .filter(({ items }) => newViolationKinds(draft, items).length === 0)
    .filter(({ item }) => op.fit !== "leaner" || item.caloriesPer100g < requireIngredient(current).caloriesPer100g)
    .sort((a, b) => b.item.proteinPer100g - a.item.proteinPer100g)
  return candidates[0]?.item.id ?? null
}

export function applyDraftOp(ctx: CoachContext, draft: ActiveMealDraft, op: DraftOp): OpOutcome & { draft: ActiveMealDraft } {
  const pool = guardedPool(ctx.guards, draft.constraints.availableIds)
  const poolIds = new Set(pool.map((item) => item.id))
  const items = itemsOf(draft)
  const keep = (message: string) => ({ draft, ...done(message, false) })
  const ok = (label: string, next: DraftItem[], message?: string, patch?: Partial<AssembleInput>) => {
    const result = commit(ctx, draft, label, next, patch)
    return { draft: result, ...done(message ?? `${label}: now ${Math.round(result.nutrition.calories)} kcal, ${Math.round(result.nutrition.protein)}g protein.`) }
  }

  switch (op.type) {
    case "swap":
      return applySwap(ctx, draft, op)

    case "add": {
      const ingredient = getIngredient(op.ingredientId)
      if (!ingredient || !poolIds.has(ingredient.id)) return keep("I can't add that — it's excluded for you or I don't have verified nutrition data for it.")
      if (items.some((item) => item.ingredientId === ingredient.id)) return keep(`${ingredient.shortName} is already in this meal.`)
      const grams = roundGrams(ingredient, op.grams ?? ingredient.typicalGrams)
      return ok(`Add ${ingredient.shortName}`, [...items, { ingredientId: ingredient.id, grams }])
    }

    case "remove": {
      const target = items.find((item) => item.ingredientId === op.ingredientId)
      if (!target) return keep("That ingredient isn't in this meal.")
      if (items.length === 1) return keep("A meal needs at least one ingredient.")
      return ok(`Remove ${requireIngredient(op.ingredientId).shortName}`, items.filter((item) => item !== target))
    }

    case "set_grams": {
      const ingredient = getIngredient(op.ingredientId)
      if (!ingredient || !items.some((item) => item.ingredientId === op.ingredientId)) return keep("That ingredient isn't in this meal.")
      if (!Number.isFinite(op.grams) || op.grams <= 0) return keep("Portion must be a positive number of grams.")
      const grams = Math.min(ingredient.maxGrams * 2, Math.max(0.5, op.grams))
      return ok(`Set ${ingredient.shortName} to ${grams} g`, items.map((item) => (item.ingredientId === op.ingredientId ? { ...item, grams } : item)))
    }

    case "scale": {
      const nextConstraints = { ...draft.constraints }
      let scaled: DraftItem[]
      if (op.targetCalories !== undefined) {
        nextConstraints.calorieCeiling = op.targetCalories
        nextConstraints.calorieCeilingSource = "user"
        nextConstraints.calorieCeilingStrict = op.strict === true
        const aim = op.strict ? op.targetCalories * 0.97 : op.targetCalories
        scaled = scaleItems(items, { mode: op.mode, targetCalories: aim, targetProtein: op.mode === "PROPORTIONAL" ? null : nextConstraints.proteinTarget })
      } else {
        scaled = scaleItems(items, { mode: op.mode, targetProtein: op.targetProtein ?? nextConstraints.proteinTarget })
      }
      const result = commit(ctx, draft, `Scale (${op.mode})`, scaled, { constraints: nextConstraints, scalingMode: op.mode })
      return { draft: result, ...done(`Rescaled (${op.mode}): ${Math.round(result.nutrition.calories)} kcal, ${Math.round(result.nutrition.protein)}g protein.`) }
    }

    case "more_protein": {
      const protein = draft.nutrition.protein
      const scaled = scaleItems(items, { mode: "PROTEIN_ADJUST", targetProtein: protein + 10 })
      return ok("More protein", scaled, undefined, { scalingMode: "PROTEIN_ADJUST" })
    }

    case "more_carbs": {
      const carbCalories = items.filter((i) => requireIngredient(i.ingredientId).role === "carb").reduce((sum, i) => sum + (requireIngredient(i.ingredientId).caloriesPer100g * i.grams) / 100, 0)
      const scaled = scaleItems(items, { mode: "CARB_ADJUST", targetCalories: draft.nutrition.calories + Math.max(40, carbCalories * 0.3) })
      return ok("More carbs", scaled, undefined, { scalingMode: "CARB_ADJUST" })
    }

    case "lower_calories": {
      const scaled = scaleItems(items, { mode: "AUTO", targetCalories: draft.nutrition.calories * 0.85, targetProtein: draft.constraints.proteinTarget ?? draft.nutrition.protein })
      return ok("Lower calories", scaled, undefined, { scalingMode: "AUTO" })
    }

    case "cheaper": {
      const current = items.find((i) => requireIngredient(i.ingredientId).role === "protein")
      if (!current) return keep("There's no protein ingredient to make cheaper.")
      const from = requireIngredient(current.ingredientId)
      const perProtein = (i: typeof from) => i.priceEstimateSgd / Math.max(1, i.proteinPer100g)
      const cheaper = pool
        .filter((i) => i.role === "protein" && i.id !== from.id && !items.some((x) => x.ingredientId === i.id) && perProtein(i) < perProtein(from))
        .sort((a, b) => perProtein(a) - perProtein(b))[0]
      if (!cheaper) return keep(`${from.shortName} is already the cheapest protein I can use here.`)
      const grams = (current.grams * from.proteinPer100g) / cheaper.proteinPer100g
      const swapped = swapItems(items, from.id, cheaper.id).map((i) => (i.ingredientId === cheaper.id ? { ...i, grams: roundGrams(cheaper, grams) } : i))
      return ok(`Cheaper: ${from.shortName} → ${cheaper.shortName}`, swapped, `Swapped ${from.shortName} for ${cheaper.shortName} at matching protein — about S$${priceFor(swapped).toFixed(2)} (estimate).`)
    }

    case "faster": {
      const slowest = [...items].sort((a, b) => requireIngredient(b.ingredientId).cookMinutes - requireIngredient(a.ingredientId).cookMinutes)[0]
      const from = requireIngredient(slowest.ingredientId)
      const quicker = pool
        .filter((i) => i.role === from.role && i.cookMinutes < from.cookMinutes && !items.some((x) => x.ingredientId === i.id))
        .sort((a, b) => a.cookMinutes - b.cookMinutes || Math.abs(a.caloriesPer100g - from.caloriesPer100g) - Math.abs(b.caloriesPer100g - from.caloriesPer100g))[0]
      if (!quicker || from.cookMinutes <= 5) return keep("This is already about as quick as I can make it with verified ingredients.")
      const grams = (slowest.grams * from.caloriesPer100g) / quicker.caloriesPer100g
      const swapped = swapItems(items, from.id, quicker.id).map((i) => (i.ingredientId === quicker.id ? { ...i, grams: roundGrams(quicker, grams) } : i))
      return ok(`Faster: ${from.shortName} → ${quicker.shortName}`, swapped)
    }

    case "more_filling": {
      const room = draft.constraints.calorieCeiling === null ? Infinity : draft.constraints.calorieCeiling - draft.nutrition.calories
      const existing = items.find((i) => requireIngredient(i.ingredientId).role === "volume")
      if (existing) {
        const ingredient = requireIngredient(existing.ingredientId)
        const grams = roundGrams(ingredient, existing.grams * 1.5)
        if (grams === existing.grams) return keep("The volume is already at its practical maximum.")
        return ok(`More ${ingredient.shortName}`, items.map((i) => (i === existing ? { ...i, grams } : i)), `Added more ${ingredient.shortName} for volume — only a few extra calories.`)
      }
      const volume = pool.find((i) => i.role === "volume" && (i.caloriesPer100g * i.typicalGrams) / 100 <= room)
      if (!volume) return keep("There isn't calorie room left to add volume.")
      return ok(`Add ${volume.shortName}`, [...items, { ingredientId: volume.id, grams: volume.typicalGrams }], `Added ${volume.shortName} for volume.`)
    }

    case "tastier": {
      const picks = draft.suggestions.filter((s) => s.necessity === "OPTIONAL_QUALITY_UPGRADE").slice(0, 2)
      if (picks.length === 0) return keep("This meal already has a good flavor and texture balance — tell me what you'd like more of (sweeter, crunchier, spicier).")
      return ok(`Make it tastier`, [...items, ...picks.map((s) => ({ ingredientId: s.ingredientId, grams: s.grams }))], `Added ${picks.map((s) => requireIngredient(s.ingredientId).shortName).join(" and ")} for ${picks.map((s) => s.purpose).join(" and ")}.`)
    }

    case "use_available": {
      const ids = op.ingredientIds.filter((id) => getIngredient(id))
      const constraints = { ...draft.constraints, availableIds: ids }
      const result = buildFromSelection(ctx, constraints, ids, draft.mode)
      if (result.status === "NO_CANDIDATE") return keep(result.reason)
      const best = result.status === "OK" ? result.best : result.closest
      const next = commit(ctx, draft, "Use only what I have", best.items, { constraints })
      return { draft: next, ...done(`Rebuilt from only your foods: ${Math.round(next.nutrition.calories)} kcal, ${Math.round(next.nutrition.protein)}g protein.`) }
    }

    case "set_constraints": {
      const c = { ...draft.constraints }
      if (op.calorieCeiling !== undefined) {
        c.calorieCeiling = op.calorieCeiling
        c.calorieCeilingSource = "user"
        c.calorieCeilingStrict = op.strict ?? c.calorieCeilingStrict
      }
      if (op.proteinTarget !== undefined) {
        c.proteinTarget = op.proteinTarget
        c.proteinTargetSource = "user"
      }
      if (op.maxPriceSgd !== undefined) c.maxPriceSgd = op.maxPriceSgd
      if (op.maxCookMinutes !== undefined) c.maxCookMinutes = op.maxCookMinutes
      const scaled = scaleItems(items, { mode: "AUTO", targetCalories: c.calorieCeiling === null ? null : c.calorieCeiling * (c.calorieCeilingStrict ? 0.97 : 0.95), targetProtein: c.proteinTarget })
      const next = commit(ctx, draft, "Updated constraints", scaled, { constraints: c })
      return { draft: next, ...done(`Updated: ${Math.round(next.nutrition.calories)} kcal, ${Math.round(next.nutrition.protein)}g protein.`) }
    }

    case "undo": {
      if (draft.historyIndex <= 0) return keep("Nothing to undo.")
      return { draft: jumpTo(ctx, draft, draft.historyIndex - 1), ...done(`Undid "${draft.history[draft.historyIndex].label}".`) }
    }

    case "redo": {
      if (draft.historyIndex >= draft.history.length - 1) return keep("Nothing to redo.")
      return { draft: jumpTo(ctx, draft, draft.historyIndex + 1), ...done(`Redid "${draft.history[draft.historyIndex + 1].label}".`) }
    }

    case "restore": {
      const index = draft.history.findIndex((v) => v.version === op.version)
      if (index < 0) return keep("That version no longer exists.")
      return { draft: jumpTo(ctx, draft, index), ...done(`Restored version ${op.version}.`) }
    }

    case "refresh": {
      const fresh = contextConstraints(ctx.snapshot)
      const c = { ...draft.constraints }
      if (fresh) {
        if (c.calorieCeilingSource === "context") c.calorieCeiling = fresh.calorieCeiling
        if (c.proteinTargetSource === "context") c.proteinTarget = fresh.proteinTarget
      }
      const scaled = scaleItems(items, { mode: "AUTO", targetCalories: c.calorieCeiling === null ? null : c.calorieCeiling * 0.95, targetProtein: c.proteinTarget })
      const next = commit(ctx, draft, "Refreshed for current targets", scaled, { constraints: c, snapshot: ctx.snapshot, acknowledgedContextVersion: null })
      return { draft: next, ...done(`Refreshed against your current targets: ${Math.round(next.nutrition.calories)} kcal, ${Math.round(next.nutrition.protein)}g protein.`) }
    }

    case "keep": {
      const next = assembleDraft({ ctx, id: draft.id, name: draft.name, family: draft.family, source: draft.source, mode: draft.mode, items, constraints: draft.constraints, scalingMode: draft.scalingMode, snapshot: draft.sessionContextSnapshot, history: draft.history, historyIndex: draft.historyIndex, acknowledgedContextVersion: ctx.snapshot.contextVersion, craving: draft.craving })
      return { draft: next, ...done("Keeping the current draft as it is.") }
    }
  }
}
