import type { FoodLogEntry } from "./types"

/**
 * What one food-log write is KNOWN to have done. "unknown" is not a failure:
 * the request may have committed and only the response was lost.
 */
export type SaveItemResult =
  | { status: "saved"; entry: FoodLogEntry }
  | { status: "failed"; error: string }
  | { status: "unknown"; error: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export const UNCONFIRMED_SAVE_MESSAGE =
  "The connection dropped before the server confirmed this save, so it may already be logged."

// /api/nutrition/log only answers these before it touches the table — proof of no write.
const REJECTED_BEFORE_WRITE = new Set([400, 401, 403, 413])

export async function postFoodLog(body: { idempotencyKey: string }, fetchImpl: FetchLike = fetch): Promise<SaveItemResult> {
  let response: Response
  try {
    response = await fetchImpl("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { status: "unknown", error: UNCONFIRMED_SAVE_MESSAGE }
  }

  const data = await response.json().catch(() => null)
  if (response.ok && data?.ok && data.entry) return { status: "saved", entry: data.entry as FoodLogEntry }
  // notWritten: the server saw the database reject the insert (rolled back) — a confirmed failure.
  if (data?.ok === false && (REJECTED_BEFORE_WRITE.has(response.status) || data.notWritten === true)) {
    return { status: "failed", error: data.error ?? "Unable to save this food." }
  }
  return { status: "unknown", error: UNCONFIRMED_SAVE_MESSAGE }
}

/**
 * Read-only check of whether a write with this key committed for the signed-in
 * user. `null` means the check itself failed — still unknown. A missing row is
 * `{ entry: null }`, which does NOT prove the original request can't still land.
 */
export async function lookupFoodLogByKey(
  idempotencyKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ entry: FoodLogEntry | null } | null> {
  try {
    const response = await fetchImpl(`/api/nutrition/log?idempotencyKey=${encodeURIComponent(idempotencyKey)}`)
    const data = await response.json()
    return response.ok && data.ok ? { entry: (data.entry ?? null) as FoodLogEntry | null } : null
  } catch {
    return null
  }
}

/** POST, and if the outcome is unknown, one immediate read-only readback by the same key. */
export async function saveFoodLogWithReconcile(
  body: { idempotencyKey: string },
  fetchImpl: FetchLike = fetch,
): Promise<SaveItemResult> {
  const result = await postFoodLog(body, fetchImpl)
  if (result.status !== "unknown") return result
  const check = await lookupFoodLogByKey(body.idempotencyKey, fetchImpl)
  return check?.entry ? { status: "saved", entry: check.entry } : result
}

/**
 * Age after which a still-unconfirmed save is stale: longer than a request can
 * still be in flight (Vercel's 300 s function limit plus the database statement
 * timeout). A stale key whose readback SUCCEEDS and finds no row is "not found":
 * shown separately, and the user may dismiss it. It is never dropped
 * automatically — a row that shows up later still settles it as saved.
 */
export const PENDING_STALE_MS = 10 * 60_000

export function isStalePending(sentAt: number, now = Date.now()): boolean {
  return now - sentAt > PENDING_STALE_MS
}

/**
 * Read-only re-check of pending keys by their ORIGINAL key — never re-sends a
 * write. `saved` holds only keys whose row was read back. `notFound` holds
 * stale keys whose readback succeeded with no row (a failed readback never
 * counts). Both of those and every other key stay in storage until the caller
 * forgets them. `checkFailed` means at least one readback itself failed.
 */
export async function recheckPendingSaves(
  pending: Array<{ key: string; sentAt: number }>,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<{ saved: Set<string>; notFound: Set<string>; checkFailed: boolean }> {
  const checks = await Promise.all(pending.map((item) => lookupFoodLogByKey(item.key, fetchImpl)))
  return {
    saved: new Set(pending.filter((_, index) => checks[index]?.entry).map((item) => item.key)),
    notFound: new Set(
      pending.filter((item, index) => checks[index] !== null && checks[index]?.entry === null && isStalePending(item.sentAt, now)).map((item) => item.key),
    ),
    checkFailed: checks.some((check) => check === null),
  }
}

/**
 * Sent-but-unconfirmed saves, kept per user in sessionStorage so a refresh
 * mid-save still re-checks by the ORIGINAL key. Holds only the key, its log
 * date and send time — no food data, no tokens.
 */
export type PendingSave = { key: string; logDate: string; sentAt: number }

const pendingStorageKey = (userId: string) => `mf:food-log-pending:${userId}`

function browserSession(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function readPendingSaves(userId: string, storage = browserSession()): PendingSave[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(pendingStorageKey(userId)) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((p): p is PendingSave => typeof p?.key === "string" && typeof p?.logDate === "string" && typeof p?.sentAt === "number")
      : []
  } catch {
    return []
  }
}

export function writePendingSaves(userId: string, saves: PendingSave[], storage = browserSession()) {
  try {
    if (saves.length > 0) storage?.setItem(pendingStorageKey(userId), JSON.stringify(saves))
    else storage?.removeItem(pendingStorageKey(userId))
  } catch {
    // Storage blocked: in-memory tracking still applies for this mount.
  }
}

export function forgetPendingSaves(userId: string, keys: Set<string>, storage = browserSession()) {
  writePendingSaves(userId, readPendingSaves(userId, storage).filter((p) => !keys.has(p.key)), storage)
}

/**
 * The Dashboard's view of one day's unconfirmed saves: re-checks them
 * read-only, forgets only the ones read back, and returns what's left.
 * Never writes a food log and never prunes other days (the tracker owns that).
 */
export async function reconcileDayPendingSaves(
  userId: string,
  logDate: string,
  fetchImpl: FetchLike = fetch,
  storage = browserSession(),
): Promise<{ unresolved: PendingSave[]; notFound: PendingSave[]; savedAny: boolean; checkFailed: boolean }> {
  const day = readPendingSaves(userId, storage).filter((p) => p.logDate === logDate)
  if (day.length === 0) return { unresolved: [], notFound: [], savedAny: false, checkFailed: false }
  const { saved, notFound, checkFailed } = await recheckPendingSaves(day, fetchImpl)
  if (saved.size > 0) forgetPendingSaves(userId, saved, storage)
  return {
    unresolved: day.filter((p) => !saved.has(p.key) && !notFound.has(p.key)),
    notFound: day.filter((p) => notFound.has(p.key)),
    savedAny: saved.size > 0,
    checkFailed,
  }
}

type Keyed = { idempotencyKey?: string }

/** What a multi-item save actually did — never collapsed into one success flag. */
export type MultiOutcome<T extends Keyed> = {
  saved: T[]
  failed: Array<{ food: T; error: string }>
  unknown: Array<{ food: T; error: string }>
}

/** Folds one batch's per-item results into the outcome; items saved by earlier batches stay saved. */
export function mergeMultiOutcome<T extends Keyed>(previousSaved: T[], foods: T[], results: SaveItemResult[]): MultiOutcome<T> {
  const outcome: MultiOutcome<T> = { saved: [...previousSaved], failed: [], unknown: [] }
  foods.forEach((food, index) => {
    const result = results[index] ?? { status: "unknown", error: UNCONFIRMED_SAVE_MESSAGE }
    if (result.status === "saved") outcome.saved.push(food)
    else outcome[result.status].push({ food, error: result.error })
  })
  return outcome
}

export function isCompleteOutcome(outcome: MultiOutcome<Keyed>): boolean {
  return outcome.failed.length === 0 && outcome.unknown.length === 0
}

export function describeMultiOutcome(outcome: MultiOutcome<Keyed>): { title: string; detail: string; dismissLabel: string } {
  const total = outcome.saved.length + outcome.failed.length + outcome.unknown.length
  const retry = "Retrying reuses each item's original save key, so it can't create duplicates."

  if (outcome.unknown.length > 0) {
    return {
      title: `Save not confirmed for ${outcome.unknown.length} of ${total} item${total === 1 ? "" : "s"}`,
      detail: `Items marked "Not confirmed" may already be in today's log — today's totals will be re-checked against the server. ${retry}`,
      dismissLabel: "Close — re-check totals",
    }
  }
  if (outcome.saved.length > 0) {
    return {
      title: `Partially saved — ${outcome.saved.length} of ${total} items added`,
      detail: `Today's totals include only the items marked saved. ${retry}`,
      dismissLabel: "Done — keep saved items only",
    }
  }
  return { title: "Nothing was saved", detail: `Today's totals are unchanged. ${retry}`, dismissLabel: "Discard" }
}
