import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppEvent, AppEventType } from "@/lib/events/types";
import { recomputeDailyIntelligence } from "@/lib/dante-core/daily-intelligence";

/**
 * emitEvent() (spec Part B §14).
 *
 * Two things happen, in order:
 *   1. The event is appended to app_events — a real, queryable audit
 *      trail (used by the closed-loop demo and, eventually, any
 *      analytics that wants "what actually happened and when").
 *   2. IF this event type can change today's Dante Daily Intelligence
 *      snapshot, it's recomputed right now and cached
 *      (dante_daily_intelligence) — not on every future dashboard
 *      render. This is the "recompute after meaningful events, avoid
 *      constant unnecessary recomputation" balance the spec asks for.
 *
 * Failure to write the event or recompute intelligence is logged, not
 * thrown — emitting an event must never block or fail the calling
 * mutation (a food log write succeeding is more important than the
 * event log write succeeding).
 */

const RECOMPUTE_TRIGGERS: Set<AppEventType> = new Set([
  "WORKOUT_COMPLETED",
  "SET_ANALYZED",
  "FOOD_LOGGED",
  "RECOVERY_UPDATED",
  "CHECKIN_COMPLETED",
  // BODYWEIGHT_UPDATED deliberately excluded: it doesn't feed into
  // readiness/training-focus/nutrition-adherence as currently
  // modeled (daily-intelligence.ts), so recomputing on it would be
  // exactly the "unnecessary recomputation" the spec warns against.
]);

export async function emitEvent<T extends AppEventType>(
  supabase: SupabaseClient,
  event: AppEvent<T>,
): Promise<void> {
  try {
    const { error } = await supabase.from("app_events").insert({
      user_id: event.userId,
      event_type: event.type,
      payload: event.payload,
    });

    if (error) {
      console.error("[EVENTS] failed to record event", event.type, error);
    }
  } catch (error) {
    console.error("[EVENTS] emitEvent threw", event.type, error);
  }

  if (!RECOMPUTE_TRIGGERS.has(event.type)) {
    return;
  }

  try {
    await recomputeDailyIntelligence(supabase, event.userId, event.type);
  } catch (error) {
    console.error("[EVENTS] recomputeDailyIntelligence failed for", event.type, error);
  }
}
