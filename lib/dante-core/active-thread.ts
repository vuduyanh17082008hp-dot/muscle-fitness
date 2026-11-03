/**
 * One Day, One Thread — which Dante conversation every Dante surface (full page, floating panel, Nutrition page chat)
 * writes to in this tab. Client-only, sessionStorage: "" = the user started a new chat (no thread yet), null = nothing
 * remembered (fall back to today's most recent conversation, never an older day's).
 */
export const LAST_THREAD_KEY = "mf.dante.lastThread";

export function readLastThread(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_THREAD_KEY);
  } catch {
    return null;
  }
}

export function rememberThread(id: string | null) {
  try {
    window.sessionStorage.setItem(LAST_THREAD_KEY, id ?? "");
  } catch {
    // storage blocked — restore falls back to today's most recent conversation
  }
}

/** The fallback when nothing is remembered: the most recent conversation only if it was active today (local time). */
export function todaysThread(threads: Array<{ id: string; updatedAt: string }>, now = new Date()): string | null {
  const latest = threads[0];
  if (!latest) return null;
  const updated = new Date(latest.updatedAt);
  return updated.toDateString() === now.toDateString() ? latest.id : null;
}
