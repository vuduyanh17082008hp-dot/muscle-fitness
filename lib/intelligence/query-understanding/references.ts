import { extractExercises, extractFoods, extractMuscles, extractPreparation, extractQuantities } from "./entities";
import { normalizeQueryText } from "./text";
import type { EntityOrigin, FrameContext, HistoryTurn, QueryEntity } from "./types";

/**
 * Reference priority (spec §6):
 *   1 current-turn explicit  2 active task/draft  3 immediately previous turn
 *   4 recent history (bounded)  5 Athlete State  6 UNKNOWN
 * History is bounded on purpose: arbitrary stale entities from a long conversation are never pulled in.
 */
export const MAX_LOOKBACK_TURNS = 6;
/** Turns within this distance count as "immediately previous". */
const PREVIOUS_TURN_WINDOW = 2;

export interface ResolvedReferences {
  entities: QueryEntity[];
  resolvedFromHistory: boolean;
  previousEntityRefs: string[];
  unresolvedReferences: string[];
  /** More than one food the follow-up could mean (the user's own words). The turn must ask, never pick. */
  ambiguousFoods?: string[];
  /** Quantity inherited from history ("same but Atlantic cod?" keeps the earlier 200 g). */
  carriedQuantity?: QueryEntity;
  /** Raw/cooked basis inherited with the food ("raw cod" → "what about 150 g?" is still raw, never silently cooked). */
  carriedPreparation?: string;
}

function recentTurns(history: HistoryTurn[] | undefined): Array<{ turn: HistoryTurn; distance: number }> {
  if (!history?.length) return [];
  // Newest first, bounded.
  return history.slice(-MAX_LOOKBACK_TURNS).reverse().map((turn, i) => ({ turn, distance: i + 1 }));
}

function originFor(distance: number): EntityOrigin {
  return distance <= PREVIOUS_TURN_WINDOW ? "PREVIOUS_TURN" : "RECENT_HISTORY";
}

type FoodReferent = { entity: QueryEntity; distance: number; preparation?: string } | { ambiguous: string[] };

/**
 * The one food a follow-up ("150 g of that") can mean, or the candidates when it could mean more than one. Never a guess:
 * two foods in the latest food-naming user turn, or a different food in the user turn right before it, are both plausible.
 * A food is only resolved from an assistant turn when that turn named exactly one food.
 */
function foodFromTurns(history: HistoryTurn[] | undefined): FoodReferent | null {
  const turns = recentTurns(history);
  const prepOf = (text: string) => {
    const prep = extractPreparation(normalizeQueryText(text));
    return prep ? { preparation: prep.method ?? prep.state } : {};
  };
  const named = turns
    .filter(({ turn }) => turn.role === "user")
    .map(({ turn, distance }) => ({ turn, distance, foods: extractFoods(normalizeQueryText(turn.text), originFor(distance)) }))
    .filter(({ foods }) => foods.length > 0);
  const [latest, earlier] = named;
  if (latest) {
    const candidates = [...(earlier && earlier.distance - latest.distance <= 2 ? earlier.foods : []), ...latest.foods];
    const distinct = [...new Map(candidates.map((f) => [f.base ?? f.value, f.surface])).values()];
    if (distinct.length > 1) return { ambiguous: distinct };
    return { entity: latest.foods[latest.foods.length - 1], distance: latest.distance, ...prepOf(latest.turn.text) };
  }
  for (const { turn, distance } of turns) {
    const foods = extractFoods(normalizeQueryText(turn.text), originFor(distance));
    const distinct = new Set(foods.map((f) => f.base));
    if (turn.role === "assistant" && distinct.size === 1) return { entity: foods[0], distance, ...prepOf(turn.text) };
  }
  return null;
}

function exerciseFromTurns(history: HistoryTurn[] | undefined): { entity: QueryEntity; distance: number } | null {
  for (const { turn, distance } of recentTurns(history)) {
    const text = normalizeQueryText(turn.text);
    const ex = extractExercises(text, originFor(distance));
    if (ex.length > 0) return { entity: ex[ex.length - 1], distance };
    // "legs"/"leg day" implies a lower-body session reference, not a specific lift.
    const muscles = extractMuscles(text, originFor(distance));
    if (muscles.length > 0 && turn.role === "user") return { entity: muscles[muscles.length - 1], distance };
  }
  return null;
}

function quantityFromTurns(history: HistoryTurn[] | undefined): QueryEntity | null {
  for (const { turn, distance } of recentTurns(history)) {
    if (turn.role !== "user") continue;
    const q = extractQuantities(normalizeQueryText(turn.text)).entities[0];
    if (q) return { ...q, origin: originFor(distance) };
  }
  return null;
}

const FOLLOWUP_FOOD_CUE = /(?<![\p{L}])(?:what about|how about|and|same|give me|macros?|calories|protein|carbs|fat|it|that|this|those|them|thì sao|còn|vậy|thế|sao)(?![\p{L}])/iu;
const FOLLOWUP_EXERCISE_CUE = /(?<![\p{L}])(?:why|it|that|this|push|today|tomorrow|instead|again|vì sao|tại sao|hôm nay|ngày mai|nay)(?![\p{L}])/iu;

export interface ReferenceNeeds {
  food: boolean;
  exercise: boolean;
}

/** Decide which reference kinds the current turn depends on, then resolve them in priority order. */
export function resolveConversationReferences(
  normalized: string,
  current: QueryEntity[],
  needs: ReferenceNeeds,
  ctx: FrameContext,
): ResolvedReferences {
  const out: ResolvedReferences = { entities: [], resolvedFromHistory: false, previousEntityRefs: [], unresolvedReferences: [] };
  const has = (kind: QueryEntity["kind"]) => current.some((e) => e.kind === kind);
  const prep = extractPreparation(normalized);

  if (needs.food && !has("FOOD")) {
    const fromTask = ctx.activeTask?.foods?.length ? ctx.activeTask.foods[ctx.activeTask.foods.length - 1] : null;
    const fromHistory = foodFromTurns(ctx.history);
    if (fromTask) {
      const hit = extractFoods(normalizeQueryText(fromTask), "ACTIVE_TASK")[0];
      if (hit) out.entities.push(hit);
    }
    if (out.entities.length === 0 && fromHistory) {
      if ("ambiguous" in fromHistory) out.ambiguousFoods = fromHistory.ambiguous;
      else {
        out.entities.push(fromHistory.entity);
        if (!prep && fromHistory.preparation) out.carriedPreparation = fromHistory.preparation;
      }
    }
    if (out.entities.length === 0 && !out.ambiguousFoods && ctx.athleteState?.lastFood) {
      const hit = extractFoods(normalizeQueryText(ctx.athleteState.lastFood), "ATHLETE_STATE")[0];
      if (hit) out.entities.push(hit);
    }
    if (out.entities.length === 0) out.unresolvedReferences.push("food");
  }

  // A preparation/"same" follow-up ("same but grilled?", "same but Atlantic cod?") inherits the earlier quantity.
  const hasFoodNow = has("FOOD") || out.entities.some((e) => e.kind === "FOOD");
  if (needs.food && hasFoodNow && !has("QUANTITY") && (prep || /(?<![\p{L}])same(?![\p{L}])/iu.test(normalized))) {
    const q = quantityFromTurns(ctx.history);
    if (q) out.carriedQuantity = q;
  }

  if (needs.exercise && !has("EXERCISE") && !has("MUSCLE_GROUP")) {
    if (ctx.activeTask?.exercise) {
      const hit = extractExercises(normalizeQueryText(ctx.activeTask.exercise), "ACTIVE_TASK")[0];
      if (hit) out.entities.push(hit);
    }
    if (out.entities.length === 0) {
      const fromHistory = exerciseFromTurns(ctx.history);
      if (fromHistory) out.entities.push(fromHistory.entity);
    }
    if (out.entities.length === 0 && ctx.athleteState?.scheduledExercise) {
      const hit = extractExercises(normalizeQueryText(ctx.athleteState.scheduledExercise), "ATHLETE_STATE")[0];
      if (hit) out.entities.push(hit);
    }
    if (!out.entities.some((e) => e.kind === "EXERCISE" || e.kind === "MUSCLE_GROUP")) out.unresolvedReferences.push("exercise");
  }

  out.resolvedFromHistory = out.entities.some((e) => e.origin !== "CURRENT_TURN") || Boolean(out.carriedQuantity);
  out.previousEntityRefs = [...out.entities, ...(out.carriedQuantity ? [out.carriedQuantity] : [])].map((e) => `${e.kind}:${e.value}`);
  return out;
}

export function looksLikeFoodFollowUp(normalized: string): boolean {
  return FOLLOWUP_FOOD_CUE.test(normalized);
}
export function looksLikeExerciseFollowUp(normalized: string): boolean {
  return FOLLOWUP_EXERCISE_CUE.test(normalized);
}

/** True when a food was named in the bounded history or the active task (used to read "same but X" as a food follow-up). */
export function historyMentionsFood(ctx: FrameContext): boolean {
  if (ctx.activeTask?.foods?.length) return true;
  return foodFromTurns(ctx.history) !== null;
}
