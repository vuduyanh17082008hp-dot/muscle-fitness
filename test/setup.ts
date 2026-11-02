import { vi } from "vitest"

// Unit tests never reach the internet. The chatbot route's literature/food adapters (PubMed, Europe PMC, MedlinePlus,
// USDA, …) time out at 7 s, longer than Vitest's 5 s, so a slow or offline network turned route tests into timeouts —
// and the timed-out test's still-running requests then leaked provider calls and state writes into the next test.
// Rejecting like a network failure is the outcome those adapters already handle. Loopback (the local Supabase test
// stacks) stays real; opt-in live runs (any *LIVE* env flag, e.g. ICH1_LIVE=1) keep the network.
const liveRun = Object.entries(process.env).some(([name, value]) => /LIVE/.test(name) && value && value !== "0")
if (!liveRun) {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const host = new URL(href).hostname
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
      throw new TypeError(`fetch failed: network disabled in unit tests (${host})`)
    }
    return realFetch(input, init)
  }) as typeof fetch
}

// Route tests unrelated to application throttling get an accepted quota check.
// Dedicated limiter tests override this mock.
vi.mock("@/lib/chatbot-rate-limit", () => ({
  checkDanteRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 9,
    retryAfterSeconds: 60,
  })),
}))

// Unit-test Supabase fakes have no coach_signals table: by default nothing was disclosed in chat. The real reader (and its
// fail-closed null) is covered by lib/nutrition/coach/__tests__/disclosed-allergens.test.ts, which unmocks it.
vi.mock("@/lib/nutrition/coach/disclosed-allergens", () => ({
  loadDisclosedAllergens: vi.fn(async () => []),
}))
