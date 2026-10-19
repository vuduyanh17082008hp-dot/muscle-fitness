/**
 * AI-R1E.1: best-effort persistence of Dante's validated post-context signals. Never throws, never blocks the reply for long,
 * and nothing in the response depends on it. Logs enums/counts/error categories only (no prompt, chat, Athlete State or secrets).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logToolEvent } from "@/lib/dante-core/tools/observability";
import { persistCoachSignals, withdrawDisclosureSignals } from "./coach-signal-store";
import type { CoachId, CoachSignal } from "./coordination";
import { buildDisclosureSignals, retractedDisclosureTypes, toUserScopeRef } from "./dante-runtime";
import type { ContextWorkingSet } from "./performance-core/context-working-set";

export async function persistDanteSignals(args: {
  userId: string;
  signals: CoachSignal[];
  /** Service-role client factory (lib/supabase/admin.ts). Called lazily so a missing key degrades here, not in the route. */
  getClient: () => SupabaseClient;
  timeoutMs?: number;
}): Promise<void> {
  // Only validated ACTIVE signals; safety-blocked/empty turns produce none, so there is nothing to write.
  const signals = args.signals.filter((s) => s.lifecycle === "ACTIVE" && !s.riskFlag);
  if (signals.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcomes = await Promise.race([
      persistCoachSignals(args.getClient(), args.userId, signals),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), args.timeoutMs ?? 3000);
      }),
    ]);
    if (!outcomes) {
      logToolEvent("DANTE_SIGNAL_PERSISTENCE", { stage: "signal persistence failed", errorCategory: "timeout" });
      return;
    }
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length) {
      const first = failed[0];
      logToolEvent("DANTE_SIGNAL_PERSISTENCE", {
        stage: "signal persistence failed",
        errorCategory: first.ok ? "unknown" : first.reason,
        fields: { attempted: outcomes.length, failed: failed.length },
      });
    }
  } catch {
    logToolEvent("DANTE_SIGNAL_PERSISTENCE", { stage: "signal persistence failed", errorCategory: "exception" });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One turn's user disclosures, from either coach: withdraw what the user retracted in this message, then publish what they
 * newly stated. Best effort and bounded like persistDanteSignals; the reply never depends on it. Returns true when the
 * shared safety context may have changed (callers use it to refresh dependent surfaces).
 */
export async function syncDisclosureSignals(args: {
  userId: string;
  source: CoachId;
  context: ContextWorkingSet;
  message: string;
  timezone?: string | null;
  now: Date;
  getClient: () => SupabaseClient;
}): Promise<boolean> {
  const retracted = retractedDisclosureTypes(args.message);
  const signals = buildDisclosureSignals({ userScope: toUserScopeRef(args.userId), context: args.context, timezone: args.timezone, source: args.source }, args.now);
  if (retracted.length === 0 && signals.length === 0) return false;
  try {
    if (retracted.length > 0 && !(await withdrawDisclosureSignals(args.getClient(), args.userId, retracted))) {
      logToolEvent("DANTE_SIGNAL_PERSISTENCE", { stage: "disclosure withdrawal failed", errorCategory: "db" });
    }
  } catch {
    logToolEvent("DANTE_SIGNAL_PERSISTENCE", { stage: "disclosure withdrawal failed", errorCategory: "exception" });
  }
  await persistDanteSignals({ userId: args.userId, signals, getClient: args.getClient });
  return true;
}
