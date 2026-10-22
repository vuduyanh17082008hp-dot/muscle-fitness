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
  if (REJECTED_BEFORE_WRITE.has(response.status) && data?.ok === false) {
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
 * Upper bound on how long one save can still be running server-side (the
 * platform function timeout is 300 s). Past it, a key with no row will never
 * get one — the only point where absence proves "not written".
 */
export const SAVE_SETTLE_MS = 5 * 60_000

export function classifyRecheck(
  sentAt: number,
  check: { entry: FoodLogEntry | null } | null,
  now = Date.now(),
): "saved" | "not_written" | "unknown" {
  if (check?.entry) return "saved"
  if (check && now - sentAt > SAVE_SETTLE_MS) return "not_written"
  return "unknown"
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
