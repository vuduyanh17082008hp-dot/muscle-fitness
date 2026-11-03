import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadDailyDecision } from "@/lib/dante-core/server/load-daily-decision";

export type TrainingHold = "recovery" | "unverified";

/**
 * The server-side form of the training hold the UI already shows (loadDailyDecision → trainingHold): the same canonical
 * decision, evaluated again at the mutation boundary so a stale tab, a no-JS submit or a crafted request cannot start or
 * add training while the Daily Brief holds it. No new policy. Fails closed: if the decision cannot be read, the hold is
 * "unverified", exactly as the UI treats an unreadable check-in.
 */
export async function currentTrainingHold(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<TrainingHold | null> {
  try {
    return (await loadDailyDecision(supabase, userId, now)).hold;
  } catch {
    return "unverified";
  }
}

export const TRAINING_HOLD_MESSAGE: Record<TrainingHold, string> = {
  recovery: "Training is on hold today because your check-in flagged pain or illness. Recovery comes first — no session was started.",
  unverified: "Today's pain/illness check-in couldn't be confirmed, so no session was started. Check in on Recovery first.",
};
