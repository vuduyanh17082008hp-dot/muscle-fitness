import { describe, expect, it } from "vitest"

import {
  isStalePending,
  PENDING_STALE_MS,
  readPendingSaves,
  reconcileDayPendingSaves,
  recheckPendingSaves,
  writePendingSaves,
  forgetPendingSaves,
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
  const faults: Array<"lose-response" | "drop-before" | "500" | "html-502" | "lookup-fail" | "db-reject"> = []
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
      if (fault === "db-reject") return json(500, { ok: false, error: "Nutrition data couldn't be saved.", notWritten: true })
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

  it("recheck: only a read-back row settles a key; a missing row stays pending at any age, labelled stale past PENDING_STALE_MS", async () => {
    const server = fakeServer()
    await postFoodLog(food(KEY_A), server.fetchImpl)
    const result = await recheckPendingSaves([{ key: KEY_A, sentAt: Date.now() }, { key: KEY_B, sentAt: Date.now() }], server.fetchImpl)
    expect([...result.saved]).toEqual([KEY_A])
    expect(result.notFound.size).toBe(0) // KEY_B is fresh: absence could still be an in-flight write
    expect(result.checkFailed).toBe(false)
    const sentAt = 1_000_000
    expect(isStalePending(sentAt, sentAt + 10_000)).toBe(false)
    expect(isStalePending(sentAt, sentAt + PENDING_STALE_MS + 1)).toBe(true)
  })
})

describe("aged pending saves (the old 300 s 'not written' inference)", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    } as unknown as Storage & { data: Map<string, string> }
  }
  const DAY = "2026-10-23"
  const LONG_AGO = Date.now() - 60 * 60_000

  it("C/D. stale with no row -> reported notFound but kept in storage; a commit landing later is then confirmed", async () => {
    const server = fakeServer()
    const storage = memoryStorage()
    writePendingSaves("user-1", [{ key: KEY_A, logDate: DAY, sentAt: LONG_AGO }], storage)

    const before = await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)
    expect(before).toEqual({ unresolved: [], notFound: [{ key: KEY_A, logDate: DAY, sentAt: LONG_AGO }], savedAny: false, checkFailed: false })
    expect(readPendingSaves("user-1", storage)).toHaveLength(1) // not silently dropped: only the user may dismiss it

    server.rows.push({ id: "row-late", userId: "user-1", key: KEY_A, foodName: "Rice", calories: 200 }) // late commit
    const after = await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)
    expect(after).toEqual({ unresolved: [], notFound: [], savedAny: true, checkFailed: false })
    expect(readPendingSaves("user-1", storage)).toEqual([])
  })

  it("fresh pending with no row stays unresolved, not notFound", async () => {
    const storage = memoryStorage()
    writePendingSaves("user-1", [{ key: KEY_A, logDate: DAY, sentAt: Date.now() }], storage)
    expect((await reconcileDayPendingSaves("user-1", DAY, fakeServer().fetchImpl, storage)).unresolved).toHaveLength(1)
  })

  it("J. readback fails → still pending, flagged; readback recovers → confirmed", async () => {
    const server = fakeServer()
    const storage = memoryStorage()
    await postFoodLog(food(KEY_A), server.fetchImpl)
    writePendingSaves("user-1", [{ key: KEY_A, logDate: DAY, sentAt: LONG_AGO }], storage)

    server.faults.push("lookup-fail")
    // a failed readback is never "not found", however old the save
    expect(await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)).toMatchObject({ notFound: [], savedAny: false, checkFailed: true })
    expect(readPendingSaves("user-1", storage)).toHaveLength(1)

    expect(await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)).toEqual({ unresolved: [], notFound: [], savedAny: true, checkFailed: false })
  })

  it("K/L. retry with the original key after the old expiry → one row, and the day's total counts it once", async () => {
    const server = fakeServer()
    server.faults.push("lose-response")
    expect((await postFoodLog(food(KEY_A), server.fetchImpl)).status).toBe("unknown")
    const retried = await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    expect(retried).toMatchObject({ status: "saved", entry: { id: "row-1" } })
    expect(server.rowsFor(KEY_A)).toBe(1)
    expect(server.rows.reduce((sum, row) => sum + row.calories, 0)).toBe(200)
  })

  it("passive reconciliation (Dashboard mount / history load) never POSTs and never touches other days or users", async () => {
    const server = fakeServer()
    const storage = memoryStorage()
    writePendingSaves("user-1", [{ key: KEY_A, logDate: DAY, sentAt: LONG_AGO }, { key: KEY_B, logDate: "2026-10-22", sentAt: LONG_AGO }], storage)
    writePendingSaves("user-2", [{ key: KEY_A, logDate: DAY, sentAt: LONG_AGO }], storage)

    await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)
    await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)
    expect(server.posts()).toBe(0)
    expect(server.rows).toHaveLength(0)
    expect(readPendingSaves("user-1", storage)).toHaveLength(2)
    expect(readPendingSaves("user-2", storage)).toHaveLength(1)
  })

  it("G. user B in the same tab sees none of user A's pending saves", async () => {
    const storage = memoryStorage()
    writePendingSaves("user-a", [{ key: KEY_A, logDate: DAY, sentAt: LONG_AGO }], storage)
    expect(await reconcileDayPendingSaves("user-b", DAY, fakeServer("user-b").fetchImpl, storage)).toEqual({ unresolved: [], notFound: [], savedAny: false, checkFailed: false })
  })

  it("H. storage unavailable → nothing known pending, no throw (a stated limitation, not a freshness claim)", async () => {
    const blocked = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") }, removeItem: () => {} } as unknown as Storage
    expect(await reconcileDayPendingSaves("user-1", DAY, fakeServer().fetchImpl, blocked)).toEqual({ unresolved: [], notFound: [], savedAny: false, checkFailed: false })
  })
})

describe("stale pending saves after a database rejection (production 2026-11-03)", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as unknown as Storage
  }
  const DAY = "2026-11-03"
  const HOURS_AGO = Date.now() - 3 * 60 * 60_000

  it("a database rejection (notWritten) is a confirmed failure, never left pending", async () => {
    const server = fakeServer()
    server.faults.push("db-reject")
    expect(await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)).toMatchObject({ status: "failed" })
    expect(server.rows).toHaveLength(0)
  })

  it("a plain 500 without notWritten stays unknown", async () => {
    const server = fakeServer()
    server.faults.push("500")
    expect((await postFoodLog(food(KEY_A), server.fetchImpl)).status).toBe("unknown")
  })

  it("stale keys: saved one settles, absent ones become notFound, failed readbacks stay unresolved", async () => {
    const server = fakeServer()
    await postFoodLog(food(KEY_A), server.fetchImpl) // committed earlier, response lost
    const KEY_C = "33333333-3333-4333-8333-333333333333"
    const KEY_D = "44444444-4444-4444-8444-444444444444"
    const storage = memoryStorage()
    const stale = [KEY_A, KEY_B, KEY_C, KEY_D].map((key) => ({ key, logDate: DAY, sentAt: HOURS_AGO }))
    writePendingSaves("user-1", stale, storage)

    server.faults.push("lookup-fail") // lookups run in order: KEY_A's readback fails this time
    const first = await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)
    expect(first.savedAny).toBe(false)
    expect(first.checkFailed).toBe(true)
    expect(first.unresolved.map((p) => p.key)).toEqual([KEY_A])
    expect(first.notFound.map((p) => p.key)).toEqual([KEY_B, KEY_C, KEY_D])
    expect(readPendingSaves("user-1", storage)).toHaveLength(4)

    const second = await reconcileDayPendingSaves("user-1", DAY, server.fetchImpl, storage)
    expect(second.savedAny).toBe(true)
    expect(second.notFound).toHaveLength(3)
    expect(readPendingSaves("user-1", storage).map((p) => p.key)).toEqual([KEY_B, KEY_C, KEY_D])

    // user acknowledges -> forgotten; no POST was ever re-sent, no row added or removed
    forgetPendingSaves("user-1", new Set(second.notFound.map((p) => p.key)), storage)
    expect(readPendingSaves("user-1", storage)).toEqual([])
    expect(server.posts()).toBe(1)
    expect(server.rows).toHaveLength(1)
  })

  it("duplicate prevention: a retry with the original key after a lost response never doubles the row", async () => {
    const server = fakeServer()
    server.faults.push("lose-response")
    await postFoodLog(food(KEY_A), server.fetchImpl)
    const again = await saveFoodLogWithReconcile(food(KEY_A), server.fetchImpl)
    expect(again).toMatchObject({ status: "saved", entry: { id: "row-1" } })
    expect(server.rowsFor(KEY_A)).toBe(1)
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
