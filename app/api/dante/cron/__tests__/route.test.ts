import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-handler tests for POST /api/dante/cron — the proactive cycle
 * entry point. Covers the fail-closed auth gate (spec Part 12): no
 * secret configured, wrong secret, and missing header must all be
 * rejected identically; only the exact configured secret runs anything.
 */

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/dante-core/proactive/run-scheduled-cycles", () => ({
  runScheduledDanteCycles: vi.fn(async () => ({
    trigger: "manual",
    ranAt: "2026-09-14T00:00:00.000Z",
    userCount: 0,
    succeeded: 0,
    failed: 0,
    results: [],
  })),
}));

import { runScheduledDanteCycles } from "@/lib/dante-core/proactive/run-scheduled-cycles";

const mockedRunScheduledCycles = vi.mocked(runScheduledDanteCycles);

function makeRequest(headers: Record<string, string> = {}, body: unknown = {}) {
  return new Request("https://example.com/api/dante/cron", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/dante/cron", () => {
  const originalSecret = process.env.DANTE_CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.DANTE_CRON_SECRET;
    } else {
      process.env.DANTE_CRON_SECRET = originalSecret;
    }
  });

  it("rejects every request when DANTE_CRON_SECRET is not configured (fails closed)", async () => {
    delete process.env.DANTE_CRON_SECRET;

    const { POST } = await import("@/app/api/dante/cron/route");
    const response = await POST(makeRequest({ authorization: "Bearer anything" }));

    expect(response.status).toBe(401);
    expect(mockedRunScheduledCycles).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer token", async () => {
    process.env.DANTE_CRON_SECRET = "correct-secret";

    const { POST } = await import("@/app/api/dante/cron/route");
    const response = await POST(makeRequest({ authorization: "Bearer wrong-secret" }));

    expect(response.status).toBe(401);
    expect(mockedRunScheduledCycles).not.toHaveBeenCalled();
  });

  it("rejects a request with no authorization header", async () => {
    process.env.DANTE_CRON_SECRET = "correct-secret";

    const { POST } = await import("@/app/api/dante/cron/route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockedRunScheduledCycles).not.toHaveBeenCalled();
  });

  it("runs the scheduled cycle and returns aggregate counts only when the secret matches", async () => {
    process.env.DANTE_CRON_SECRET = "correct-secret";

    const { POST } = await import("@/app/api/dante/cron/route");
    const response = await POST(
      makeRequest({ authorization: "Bearer correct-secret" }, { trigger: "morning" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockedRunScheduledCycles).toHaveBeenCalledWith(expect.anything(), "morning");
    expect(json).toMatchObject({ ok: true, trigger: "manual", userCount: 0 });
    // Response must never carry per-user results, even though the mock returns an empty array.
    expect(json.results).toBeUndefined();
  });

  it("defaults to trigger 'manual' when an invalid trigger is supplied", async () => {
    process.env.DANTE_CRON_SECRET = "correct-secret";

    const { POST } = await import("@/app/api/dante/cron/route");
    await POST(makeRequest({ authorization: "Bearer correct-secret" }, { trigger: "not-a-real-trigger" }));

    expect(mockedRunScheduledCycles).toHaveBeenCalledWith(expect.anything(), "manual");
  });
});
