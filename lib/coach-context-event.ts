/** Window event fired after a coach chat turn; surfaces derived from the shared safety context (suggestion cards) re-fetch. */
export const COACH_CONTEXT_CHANGED_EVENT = "mf:coach-context-changed"
/** Fired when a coach turn starts: it may carry a new restriction, so derived cards stop presenting themselves as eligible. */
export const COACH_TURN_STARTED_EVENT = "mf:coach-turn-started"
/**
 * Fired whenever today's food log changed: by the food tracker after its entries change (coach surfaces re-read totals), and by
 * Dante after a confirmed log (the tracker re-reads its entries — router.refresh() alone never resets its client state).
 * `detail.source` lets a listener ignore its own announcements.
 */
export const FOOD_LOG_CHANGED_EVENT = "mf:food-log-changed"

export type FoodLogChangeSource = "tracker" | "dante"

export function announceFoodLogChanged(source: FoodLogChangeSource) {
  window.dispatchEvent(new CustomEvent(FOOD_LOG_CHANGED_EVENT, { detail: { source } }))
}

/** The announcer, or null for a plain Event (treated as an external change). */
export function foodLogChangeSource(event: Event): FoodLogChangeSource | null {
  const source = (event as CustomEvent<{ source?: unknown }>).detail?.source
  return source === "tracker" || source === "dante" ? source : null
}
