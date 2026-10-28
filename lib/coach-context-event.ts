/** Window event fired after a coach chat turn; surfaces derived from the shared safety context (suggestion cards) re-fetch. */
export const COACH_CONTEXT_CHANGED_EVENT = "mf:coach-context-changed"
/** Fired when a coach turn starts: it may carry a new restriction, so derived cards stop presenting themselves as eligible. */
export const COACH_TURN_STARTED_EVENT = "mf:coach-turn-started"
/** Fired by the food tracker after its entries change (save, edit, delete, reload): coach surfaces re-read today's totals. */
export const FOOD_LOG_CHANGED_EVENT = "mf:food-log-changed"
