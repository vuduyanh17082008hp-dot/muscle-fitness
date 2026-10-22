import { describe, expect, it } from "vitest"

import {
  classifyRecheck,
  readPendingSaves,
  SAVE_SETTLE_MS,
  writePendingSaves,
  describeMultiOutcome,
  isCompleteOutcome,
  lookupFoodLogByKey,
  mergeMultiOutcome,
  postFoodLog,
  saveFoodLogWithReconcile,
  type SaveItemResult,
} from "../client-save"

const KEY_A = "11111111-1111-4111-8111-111111111111"
const KEY_B = "22222222-2222-4222-8222-222222222222"

type Row = { id: string; userId: string; key: string; foodName: string; calories: number }

/**
 * Stand-in for /api/nutrition/log with the real server's contract: unique
 * (user_id, idempotency_key), replay returns the committed row, lookups are
 * own-rows-only. Faults are injected per call.
 */
function fakeServer(userId = "user-1") {
  const rows: Row[] = []
  const faults: Array<"lose-response" | "drop-before" | "500" | "html-502" | "lookup-fail"> = []
  let postCount = 0

  const commit = (body: { idempotencyKey: string; foodName: string; calories?: number }) => {
    const existing = rows.find((r) => r.userId === userId && r.key === body.idempotencyKey)
    if (existing) return existing
    const row = { id: `row-${rows.length + 1}`, userId, key: body.idempotencyKey, foodName: body.foodName, calories: body.calories ?? 100 }
    rows.push(row)
    return row
  }
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status })

  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const fault = faults.shift()
    if (init?.method === "POST") {
      postCount++
      const body = JSON.parse(String(init.body))
      if (fault === "drop-before") throw new TypeError("fetch failed")
      if (!body.foodName) return json(400, { ok: false, error: "Invalid food log entry." })
      if (fault === "500") return json(500, { ok: false, error: "Nutrition data couldn't be saved." })
      const row = commit(body)
      if (fault === "lose-response") throw new TypeError("network connection was lost")
      if (fault === "html-502") return new Response("<html>Bad gateway</html>", { status: 502 })
      return json(200, { ok: true, entry: { id: row.id, foodName: row.foodName, calories: row.calories } })
    }
    const key = new URL(url, "http://x").searchParams.get("idempotencyKey")
    if (fault === "lookup-fail") throw new TypeError("fetch failed")
    const row = rows.find((r) => r.userId === userId && r.key === key)
    return json(200, { ok: true, entry: row ? { id: row.id, foodName: row.foodName, calories: row.calories } : null })
  }

  return { rows, faults, fetchImpl, posts: () => postCount, rowsFor: (key: string) => rows.filter((r) => r.key === key).length }
}

const food = (key: string, foodName = "Rice") => ({ idempotencyKey: key, foodName, calories: 200 })

describe("postFoodLog classification", () => {
  it("A. single-item success is saved with the server's row", async () => {
    const server = fakeServer()
    const result = await postFoodLog(food(KEY_A), server.fetchImpl)
    expect(result).toMatchObject({ status: "saved", entry: { id: "row-1" } })
  })

  it("B. server validation rejection (400) is a confirmed failure — no row", async () => {
    const server = fakeServer()
    const result = await postFoodLog(food(KEY_A, ""), server.fetchImpl)
    expect(result.status).toBe("failed")
    expect(server.rows).toHaveLength(0)
  })

  it("C. commit then lost response is UNKNOWN, never failed", async () => {
    const server = fakeServer()
    server.faults.push("lose-response")
    const result = await postFoodLog(food(KEY_A), server.fetchImpl)
    expect(result.status).toBe("unknown")
    expect(server.rowsFor(KEY_A)).toBe(1)
  })

  it("a 5xx or a non-JSON gateway page is UNKNOWN (the write may have run)", async () => {
    const server = fakeServer()
    server.faults.push("500")
    expect((await postFoodLog(food(KEY_A), server.fetchImpl)).status).toBe("unknown")
    server.faults.push("html-502")
    expect((await postFoodLog(food(KEY_B), server.fetchImpl)).status).toBe("unknown")
    expect(server.rowsFor(KEY_B)).toBe(1)
  })
})

describe("reconciliation by original idempotency key", () => {
  it("C. lost response → readback finds the committed row → saved, without a second POST", async () => {
    const server = fakeServer()
    server.faults.push("lose-response")
    const result = await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    expect(result).toMatchObject({ status: "saved", entry: { id: "row-1" } })
    expect(server.posts()).toBe(1)
    expect(server.rowsFor(KEY_A)).toBe(1)
  })

  it("dropped before the server saw it → readback finds nothing → stays UNKNOWN (absence isn't proof)", async () => {
    const server = fakeServer()
    server.faults.push("drop-before")
    const result = await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    expect(result.status).toBe("unknown")
    expect(server.rows).toHaveLength(0)
  })

  it("N. reconciliation query fails → stays UNKNOWN", async () => {
    const server = fakeServer()
    server.faults.push("lose-response", "lookup-fail")
    expect((await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)).status).toBe("unknown")
    expect(await lookupFoodLogByKey(KEY_A, async () => { throw new TypeError("down") })).toBeNull()
  })

  it("O. reconciliation later recovers → the row is confirmed", async () => {
    const server = fakeServer()
    server.faults.push("lose-response", "lookup-fail")
    await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    expect(await lookupFoodLogByKey(KEY_A, server.fetchImpl)).toMatchObject({ entry: { id: "row-1" } })
  })

  it("D/L. retry after a lost response reuses the key → server replays, still one row", async () => {
    const server = fakeServer()
    server.faults.push("lose-response", "lookup-fail")
    await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    const retry = await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    expect(retry).toMatchObject({ status: "saved", entry: { id: "row-1" } })
    expect(server.rowsFor(KEY_A)).toBe(1)
  })

  it("M. two near-concurrent retries of one logical item → one row, both saved with the same id", async () => {
    const server = fakeServer()
    const [a, b] = await Promise.all([postFoodLog(food(KEY_A), server.fetchImpl), postFoodLog(food(KEY_A), server.fetchImpl)])
    expect([a, b].map((r) => r.status === "saved" && r.entry.id)).toEqual(["row-1", "row-1"])
    expect(server.rowsFor(KEY_A)).toBe(1)
  })

  it("no cross-user reuse: another user's lookup of the same key finds nothing", async () => {
    const owner = fakeServer("user-1")
    await postFoodLog(food(KEY_A), owner.fetchImpl)
    const intruder = fakeServer("user-2")
    intruder.rows.push(...owner.rows)
    expect(await lookupFoodLogByKey(KEY_A, intruder.fetchImpl)).toEqual({ entry: null })
  })
})

describe("refresh / re-entry: pending saves survive the page and settle by key", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    } as unknown as Storage & { data: Map<string, string> }
  }

  it("G. a key written before sending is still there on the next load, scoped to its user", () => {
    const storage = memoryStorage()
    writePendingSaves("user-1", [{ key: KEY_A, logDate: "2026-10-22", sentAt: 1 }], storage)
    expect(readPendingSaves("user-1", storage)).toEqual([{ key: KEY_A, logDate: "2026-10-22", sentAt: 1 }])
    expect(readPendingSaves("user-2", storage)).toEqual([])
  })

  it("stores only key / date / time — no food data", () => {
    const storage = memoryStorage()
    writePendingSaves("user-1", [{ key: KEY_A, logDate: "2026-10-22", sentAt: 1 }], storage)
    expect([...storage.data.values()].join()).not.toMatch(/foodName|calories|token/i)
    writePendingSaves("user-1", [], storage)
    expect(storage.data.size).toBe(0)
  })

  it("corrupt or blocked storage degrades to 'nothing pending', never throws", () => {
    const storage = memoryStorage()
    storage.setItem("mf:food-log-pending:user-1", "{not json")
    expect(readPendingSaves("user-1", storage)).toEqual([])
    const blocked = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") }, removeItem: () => {} } as unknown as Storage
    expect(readPendingSaves("user-1", blocked)).toEqual([])
    expect(() => writePendingSaves("user-1", [{ key: KEY_A, logDate: "d", sentAt: 1 }], blocked)).not.toThrow()
  })

  it("recheck: row found → saved; missing within the settle window → still unknown; missing after it → not written", () => {
    const sentAt = 1_000_000
    expect(classifyRecheck(sentAt, { entry: { id: "row-1" } as never }, sentAt + 10)).toBe("saved")
    expect(classifyRecheck(sentAt, { entry: null }, sentAt + 10_000)).toBe("unknown")
    expect(classifyRecheck(sentAt, { entry: null }, sentAt + SAVE_SETTLE_MS + 1)).toBe("not_written")
    expect(classifyRecheck(sentAt, null, sentAt + SAVE_SETTLE_MS + 1)).toBe("unknown") // a failed check never settles
  })
})

describe("multi-item outcome", () => {
  const saved = (id: string): SaveItemResult => ({ status: "saved", entry: { id } as never })
  const failed: SaveItemResult = { status: "failed", error: "rejected" }
  const unknown: SaveItemResult = { status: "unknown", error: "lost" }
  const items = [food(KEY_A, "Rice"), food(KEY_B, "Chicken")]

  it("H. first saved, second failed → partial, not complete", () => {
    const outcome = mergeMultiOutcome([], items, [saved("1"), failed])
    expect(isCompleteOutcome(outcome)).toBe(false)
    expect(describeMultiOutcome(outcome).title).toBe("Partially saved — 1 of 2 items added")
  })

  it("I. first failed, second saved → partial with the right item failed", () => {
    const outcome = mergeMultiOutcome([], items, [failed, saved("2")])
    expect(outcome.failed.map((f) => f.food.foodName)).toEqual(["Rice"])
    expect(outcome.saved.map((f) => f.foodName)).toEqual(["Chicken"])
  })

  it("J. one saved, one unknown → says 'not confirmed', never 'Nothing was saved' or complete", () => {
    const outcome = mergeMultiOutcome([], items, [saved("1"), unknown])
    const copy = describeMultiOutcome(outcome)
    expect(isCompleteOutcome(outcome)).toBe(false)
    expect(copy.title).toBe("Save not confirmed for 1 of 2 items")
    expect(copy.detail).toMatch(/may already be in today's log/)
    expect(`${copy.title} ${copy.detail} ${copy.dismissLabel}`).not.toMatch(/Nothing was saved|unchanged/)
  })

  it("E/F. all unknown (lost single item) → no 'Nothing was saved' / 'totals unchanged' claim", () => {
    const outcome = mergeMultiOutcome([], [items[0]], [unknown])
    const copy = describeMultiOutcome(outcome)
    expect(`${copy.title} ${copy.detail}`).not.toMatch(/Nothing was saved|unchanged/)
    expect(copy.dismissLabel).toMatch(/re-check/i)
  })

  it("K. all confirmed failed → 'Nothing was saved' is allowed", () => {
    const outcome = mergeMultiOutcome([], items, [failed, failed])
    expect(describeMultiOutcome(outcome).title).toBe("Nothing was saved")
  })

  it("retry of the remaining item keeps earlier saves and completes", () => {
    const first = mergeMultiOutcome([], items, [saved("1"), unknown])
    const retried = mergeMultiOutcome(first.saved, first.unknown.map((u) => u.food), [saved("2")])
    expect(isCompleteOutcome(retried)).toBe(true)
    expect(retried.saved.map((f) => f.idempotencyKey)).toEqual([KEY_A, KEY_B])
  })

  it("a missing result is treated as unknown, not as failed", () => {
    const outcome = mergeMultiOutcome([], items, [saved("1")])
    expect(outcome.unknown.map((u) => u.food.foodName)).toEqual(["Chicken"])
  })
})
