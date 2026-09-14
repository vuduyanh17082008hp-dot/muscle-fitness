import "server-only";

import { localDateTimeParts } from "@/lib/training/load-today-session";

/**
 * Dante's deterministic current-time grounding (bug fix: Dante was
 * previously given NO time context at all in either the legacy
 * prompt-stuffed path or the agentic tool loop, so a direct "what
 * time is it?" question was answered purely from the model's own
 * guess — never a real clock read. This is computed ONCE per turn
 * from the request's own `now` and the SAME `profiles.timezone`
 * convention `lib/training/load-today-session.ts` already uses for
 * "today" — never a second, incompatible timezone system, and never
 * silently presented as the user's local time when unavailable.
 */
export type DanteTemporalContext = {
  timezone: string;
  localDate: string;
  localTime: string;
  localDateTime: string;
  utcDateTime: string;
};

/**
 * Returns null — never a fabricated/guessed local time — when no
 * valid IANA timezone is available (missing profile field, or a
 * corrupted value `Intl` rejects).
 */
export function buildDanteTemporalContext(now: Date, timezone: string | null | undefined): DanteTemporalContext | null {
  if (!timezone) return null;

  try {
    // Validates the zone name up front — Intl throws on an invalid
    // IANA identifier, which localDateTimeParts' own offset lookup
    // would otherwise silently swallow into a 0 (UTC) offset.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return null;
  }

  const { localDate, localTime } = localDateTimeParts(now, timezone);

  return {
    timezone,
    localDate,
    localTime,
    localDateTime: `${localDate} ${localTime}`,
    utcDateTime: now.toISOString(),
  };
}

/**
 * The exact prompt block handed to the model. Deliberately compact
 * (spec: "do not unnecessarily include large date/time objects or
 * duplicated fields") and explicit that this is authoritative —
 * the model must never calculate, estimate, or override it, and must
 * never present UTC as the user's local time unless asked for UTC.
 */
export function formatDanteTemporalContext(context: DanteTemporalContext | null): string {
  if (!context) {
    return `============================================================
CURRENT TEMPORAL CONTEXT
============================================================

The user's local timezone is not available right now. Do not state,
guess, or imply a current local date/time. If asked what time or day
it is, say the local time zone isn't available yet rather than
answering with a guess or with UTC as if it were local time.`;
  }

  return `============================================================
CURRENT TEMPORAL CONTEXT
============================================================

Timezone: ${context.timezone}
Local date: ${context.localDate}
Local time: ${context.localTime}

This is the ONLY authoritative source for the current date/time.
Never calculate, estimate, or override it — not from training data,
conversation text, database records, or prior messages. Only mention
UTC if the user explicitly asks for UTC.`;
}
