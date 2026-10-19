import { vi } from "vitest"

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
