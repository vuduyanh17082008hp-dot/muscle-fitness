// Session timestamps are shown in the athlete's profile time zone, never the
// server's or the browser's, so the player and the completed page agree.

function parse(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "28 Oct 2026, 05:14 pm" — the completed-session page. */
export function formatSessionDateTime(value: string | null, timeZone: string): string {
  if (!value) return "Not recorded";
  const date = parse(value);
  if (!date) return "Invalid date";
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/** "05:14 pm" — the player header. Null when there is nothing valid to show. */
export function formatSessionClock(value: string | null, timeZone: string): string | null {
  const date = parse(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}
