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
