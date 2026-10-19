import { describe, expect, it } from "vitest"

import { GET, POST } from "./route"

describe("legacy /api/food", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
  ])("returns 410 for %s and points to canonical search", async (_method, handler) => {
    const response = handler()

    expect(response.status).toBe(410)
    expect(response.headers.get("Link")).toContain("/api/nutrition/foods/search")
    expect(await response.json()).toEqual({
      ok: false,
      code: "ENDPOINT_DEPRECATED",
      error: "This food endpoint has been retired. Use /api/nutrition/foods/search.",
    })
  })
})
