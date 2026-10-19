import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { loadActiveCoachSignalsForDomain } from "@/lib/intelligence/coach-signal-store"
import { ALLERGEN_GUARD, GEMMA_CLEARANCE, type GemmaDirective } from "@/lib/intelligence/gemma-consumer"

const DISCLOSURE_READ_MS = 2000

/**
 * Allergies the user disclosed in either coach chat (coach_signals USER_DISCLOSED_AVOID_ALLERGEN_*, same user, active, not
 * withdrawn) → meal-engine guard terms. A disclosed allergy is enforced like a stored one on every surface that builds this
 * context: suggestion cards, drafts, the log proposal and the confirmed write. null = the read failed (callers fail closed).
 */
export async function loadDisclosedAllergens(supabase: SupabaseClient, userId: string, now: Date): Promise<string[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const signals = await Promise.race([
    loadActiveCoachSignalsForDomain(supabase, { userId, targetDomain: "NUTRITION", clearance: GEMMA_CLEARANCE, now }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), DISCLOSURE_READ_MS)
    }),
  ]).finally(() => clearTimeout(timer))
  if (!signals) return null
  return [
    ...new Set(
      signals.flatMap((signal) =>
        signal.signalType.startsWith("USER_DISCLOSED_") ? signal.implications.flatMap((implication) => ALLERGEN_GUARD[implication.value as GemmaDirective] ?? []) : [],
      ),
    ),
  ]
}
