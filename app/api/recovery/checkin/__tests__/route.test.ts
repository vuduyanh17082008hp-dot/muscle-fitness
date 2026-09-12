import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-handler tests for POST /api/recovery/checkin — the exact
 * endpoint the schema-drift repair fixed (it was 500ing with
 * "Could not find the table 'public.recovery_checkins'").
 *
 * `emitEvent` is mocked because it fans out into Dante's entire
 * daily-intelligence pipeline (readiness, nutrition, training focus,
 * an LLM call) — a separate module with its own test coverage
 * (lib/dante-core/__tests__/). Mocking it here keeps this suite
 * focused on what THIS route is actually responsible for: auth,
 * validation, and the recovery_checkins upsert. Everything else
 * (recovery_checkins table interaction, the real zod schema, the
 * real computeRecoveryScore) runs for real against a fake but
 * behaviorally accurate Supabase client — not a suite that mocks
 * everything and proves nothing.
 */

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";

type FakeRow = {
  id: string;
  user_id: string;
  checkin_date: string;
  [key: string]: unknown;
};

/**
 * A minimal, behaviorally-accurate stand-in for the real Postgres
 * table: supports the exact chain the route calls
 * (select/eq/neq/order/limit, and upsert/select/single with an
 * onConflict-style merge), and simulates the RLS `WITH CHECK
 * (auth.uid() = user_id)` policy by rejecting any upsert whose
 * `user_id` doesn't match the authenticated session — the same
 * guarantee the real policy (supabase/migrations/
 * 20260912090000_recovery_checkins.sql) provides.
 */
function createFakeSupabase(options: {
  authenticatedUserId: string | null;
  seedRows?: FakeRow[];
}) {
  const store = new Map<string, FakeRow>();
  for (const row of options.seedRows ?? []) {
    store.set(`${row.user_id}:${row.checkin_date}`, row);
  }

  let nextId = 1;

  return {
    store,
    client: {
      auth: {
        getUser: async () => ({
          data: {
            user: options.authenticatedUserId ? { id: options.authenticatedUserId } : null,
          },
        }),
      },
      from(table: string) {
        if (table !== "recovery_checkins") {
          throw new Error(`Unexpected table queried in test fake: ${table}`);
        }

        return {
          select() {
            let userIdFilter: string | null = null;
            let excludedDate: string | null = null;

            const builder = {
              eq(column: string, value: string) {
                if (column === "user_id") userIdFilter = value;
                return builder;
              },
              neq(column: string, value: string) {
                if (column === "checkin_date") excludedDate = value;
                return builder;
              },
              order() {
                return builder;
              },
              limit() {
                const rows = Array.from(store.values()).filter(
                  (row) =>
                    row.user_id === userIdFilter && row.checkin_date !== excludedDate,
                );
                return Promise.resolve({ data: rows, error: null });
              },
            };

            return builder;
          },
          upsert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    // RLS simulation: a write whose row wouldn't
                    // satisfy `auth.uid() = user_id` is rejected by
                    // Postgres, not silently allowed.
                    if (payload.user_id !== options.authenticatedUserId) {
                      return {
                        data: null,
                        error: {
                          code: "42501",
                          message: "new row violates row-level security policy",
                        },
                      };
                    }

                    const key = `${payload.user_id}:${payload.checkin_date}`;
                    const existing = store.get(key);

                    const merged: FakeRow = {
                      id: existing?.id ?? `generated-${nextId++}`,
                      created_at: existing?.created_at ?? new Date().toISOString(),
                      ...existing,
                      ...payload,
                      user_id: payload.user_id as string,
                      checkin_date: payload.checkin_date as string,
                    } as FakeRow;

                    store.set(key, merged);
                    return { data: merged, error: null };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    sleepHours: 7.5,
    sleepQuality: 7,
    stress: 4,
    fatigue: 4,
    soreness: 3,
    mood: 7,
    readiness: 7,
    restingHr: 58,
    steps: 8000,
    painIllness: "no",
    notes: "Felt good today.",
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/recovery/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.mocked(emitEvent).mockClear();
});

describe("POST /api/recovery/checkin — Test 1: valid check-in", () => {
  it("succeeds for an authenticated user with a full valid payload", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload()));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.checkin.user_id).toBe(USER_A);
  });
});

describe("POST /api/recovery/checkin — Test 2: missing optional steps", () => {
  it("succeeds when steps is omitted", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const payload: Record<string, unknown> = validPayload();
    delete payload.steps;
    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(payload));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/recovery/checkin — Test 3: missing optional notes", () => {
  it("succeeds when notes is omitted", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const payload: Record<string, unknown> = validPayload();
    delete payload.notes;
    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(payload));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/recovery/checkin — Test 4: unauthenticated request", () => {
  it("is rejected with 401 before touching the database", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: null });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload()));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(fake.store.size).toBe(0);
  });
});

describe("POST /api/recovery/checkin — Test 5: cross-user isolation", () => {
  it("never returns another user's check-in in the history/baseline lookup", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const fake = createFakeSupabase({
      authenticatedUserId: USER_A,
      seedRows: [
        { id: "b-1", user_id: USER_B, checkin_date: yesterday, recovery_score: 95 },
        { id: "b-2", user_id: USER_B, checkin_date: today, recovery_score: 10 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload()));
    const data = await response.json();

    expect(response.status).toBe(200);
    // User A's baseline must not have been influenced by User B's
    // score of 95 — if it leaked in, `baseline` would be non-null
    // with sampleSize including B's row despite A having zero prior
    // check-ins of their own.
    expect(data.result.baseline).toBeNull();
  });

  it("cannot write a row owned by another user even if a payload tried to (defense in depth beyond RLS)", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    // The route never reads a user id from the request body at all
    // (see the zod schema) — user_id always comes from
    // supabase.auth.getUser(). Confirm a body attempting to smuggle
    // one in is simply ignored, not honored.
    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload({ userId: USER_B, user_id: USER_B })));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.checkin.user_id).toBe(USER_A);
  });
});

describe("POST /api/recovery/checkin — Test 6: second same-day save", () => {
  it("updates the existing row instead of creating a duplicate", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");

    const first = await POST(jsonRequest(validPayload({ mood: 5 })));
    const firstData = await first.json();

    const second = await POST(jsonRequest(validPayload({ mood: 9 })));
    const secondData = await second.json();

    expect(fake.store.size).toBe(1); // one row per user+date, not two
    expect(firstData.checkin.id).toBe(secondData.checkin.id);
    expect(secondData.checkin.mood).toBe(9);
  });
});

describe("POST /api/recovery/checkin — Test 7: invalid ranges", () => {
  it("rejects an out-of-range slider value with a validation error, not a 500", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload({ stress: 15 })));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid check-in data.");
    expect(fake.store.size).toBe(0);
  });

  it("rejects an invalid painIllness enum value", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload({ painIllness: "severe" })));

    expect(response.status).toBe(400);
  });
});

describe("POST /api/recovery/checkin — Test 8: structured Dante context", () => {
  it("returns a structured recovery result (score/status/drivers), not a raw DB row, for Dante to consume", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    const response = await POST(jsonRequest(validPayload()));
    const data = await response.json();

    expect(data.result).toBeDefined();
    expect(typeof data.result.score).toBe("number");
    expect(data.result.status).toBeDefined();
    expect(Array.isArray(data.result.drivers)).toBe(true);
  });

  it("emits CHECKIN_COMPLETED and RECOVERY_UPDATED events so Dante's daily intelligence recomputes", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    await POST(jsonRequest(validPayload()));

    const emittedTypes = vi.mocked(emitEvent).mock.calls.map((call) => call[1].type);
    expect(emittedTypes).toContain("CHECKIN_COMPLETED");
    expect(emittedTypes).toContain("RECOVERY_UPDATED");
  });

  it("never emits events for a rejected (invalid) submission", async () => {
    const fake = createFakeSupabase({ authenticatedUserId: USER_A });
    vi.mocked(createClient).mockResolvedValue(fake.client as never);

    const { POST } = await import("@/app/api/recovery/checkin/route");
    await POST(jsonRequest(validPayload({ stress: 999 })));

    expect(emitEvent).not.toHaveBeenCalled();
  });
});
