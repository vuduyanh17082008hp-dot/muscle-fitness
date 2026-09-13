import { describe, expect, it, vi } from "vitest";

/**
 * Route-handler tests for /api/dante/memory (GET/PATCH/DELETE) —
 * covers CRUD, validation, and user isolation (the RLS guarantee
 * simulated the same way as the recovery check-in route's tests).
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

type MemoryRow = {
  user_id: string;
  preferred_exercises: string[];
  disliked_exercises: string[];
  weak_point_priorities: string[];
  coaching_preference: string | null;
  updated_at: string;
};

function createFakeSupabase(options: { authenticatedUserId: string | null; seedRows?: MemoryRow[] }) {
  const store = new Map<string, MemoryRow>();
  for (const row of options.seedRows ?? []) {
    store.set(row.user_id, row);
  }

  return {
    store,
    client: {
      auth: {
        getUser: async () => ({
          data: { user: options.authenticatedUserId ? { id: options.authenticatedUserId } : null },
        }),
      },
      from(table: string) {
        if (table !== "dante_memory") {
          throw new Error(`Unexpected table queried in test fake: ${table}`);
        }

        return {
          select() {
            let userIdFilter: string | null = null;

            const builder = {
              eq(column: string, value: string) {
                if (column === "user_id") userIdFilter = value;
                return builder;
              },
              async maybeSingle() {
                if (userIdFilter === null) return { data: null, error: null };
                return { data: store.get(userIdFilter) ?? null, error: null };
              },
              async delete_placeholder() {
                return { data: null, error: null };
              },
            };

            return builder;
          },

          upsert(values: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    const userId = values.user_id as string;

                    // Simulates `WITH CHECK (auth.uid() = user_id)`.
                    if (userId !== options.authenticatedUserId) {
                      return {
                        data: null,
                        error: { message: "new row violates row-level security policy", code: "42501" },
                      };
                    }

                    const existing = store.get(userId);
                    const merged: MemoryRow = {
                      user_id: userId,
                      preferred_exercises: (values.preferred_exercises as string[] | undefined) ??
                        existing?.preferred_exercises ??
                        [],
                      disliked_exercises: (values.disliked_exercises as string[] | undefined) ??
                        existing?.disliked_exercises ??
                        [],
                      weak_point_priorities: (values.weak_point_priorities as string[] | undefined) ??
                        existing?.weak_point_priorities ??
                        [],
                      coaching_preference:
                        "coaching_preference" in values
                          ? (values.coaching_preference as string | null)
                          : (existing?.coaching_preference ?? null),
                      updated_at: new Date().toISOString(),
                    };

                    store.set(userId, merged);
                    return { data: merged, error: null };
                  },
                };
              },
            };
          },

          delete() {
            return {
              async eq(column: string, value: string) {
                if (column === "user_id") {
                  if (value !== options.authenticatedUserId) {
                    return { error: { message: "row-level security policy", code: "42501" } };
                  }
                  store.delete(value);
                }
                return { error: null };
              },
            };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("GET /api/dante/memory", () => {
  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("../route");
    const fake = createFakeSupabase({ authenticatedUserId: null });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns empty defaults for a user with no memory row yet (new user)", async () => {
    const { GET } = await import("../route");
    const fake = createFakeSupabase({ authenticatedUserId: "user-1" });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.memory).toEqual({
      preferredExercises: [],
      dislikedExercises: [],
      weakPointPriorities: [],
      coachingPreference: null,
      updatedAt: null,
    });
  });

  it("returns another user's real data without leaking user-1's (isolation)", async () => {
    const { GET } = await import("../route");
    const fake = createFakeSupabase({
      authenticatedUserId: "user-2",
      seedRows: [
        {
          user_id: "user-1",
          preferred_exercises: ["Bench Press"],
          disliked_exercises: [],
          weak_point_priorities: [],
          coaching_preference: null,
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await GET();
    const body = await response.json();

    expect(body.memory.preferredExercises).toEqual([]);
  });
});

describe("PATCH /api/dante/memory", () => {
  it("rejects an invalid coachingPreference value", async () => {
    const { PATCH } = await import("../route");
    const fake = createFakeSupabase({ authenticatedUserId: "user-1" });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await PATCH(
      new Request("http://localhost/api/dante/memory", {
        method: "PATCH",
        body: JSON.stringify({ coachingPreference: "aggressive" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a weakPointPriorities value that isn't a canonical muscle", async () => {
    const { PATCH } = await import("../route");
    const fake = createFakeSupabase({ authenticatedUserId: "user-1" });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await PATCH(
      new Request("http://localhost/api/dante/memory", {
        method: "PATCH",
        body: JSON.stringify({ weakPointPriorities: ["not_a_real_muscle"] }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("saves valid preferences and echoes them back", async () => {
    const { PATCH } = await import("../route");
    const fake = createFakeSupabase({ authenticatedUserId: "user-1" });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await PATCH(
      new Request("http://localhost/api/dante/memory", {
        method: "PATCH",
        body: JSON.stringify({
          preferredExercises: ["Romanian Deadlift"],
          weakPointPriorities: ["chest"],
          coachingPreference: "direct",
        }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.memory.preferredExercises).toEqual(["Romanian Deadlift"]);
    expect(body.memory.weakPointPriorities).toEqual(["chest"]);
    expect(body.memory.coachingPreference).toBe("direct");
  });

  it("partial update never clobbers fields it did not include", async () => {
    const { PATCH } = await import("../route");
    const fake = createFakeSupabase({
      authenticatedUserId: "user-1",
      seedRows: [
        {
          user_id: "user-1",
          preferred_exercises: ["Bench Press"],
          disliked_exercises: ["Burpees"],
          weak_point_priorities: [],
          coaching_preference: "encouraging",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await PATCH(
      new Request("http://localhost/api/dante/memory", {
        method: "PATCH",
        body: JSON.stringify({ preferredExercises: ["Bench Press", "Squat"] }),
      }),
    );

    const body = await response.json();
    expect(body.memory.dislikedExercises).toEqual(["Burpees"]);
    expect(body.memory.coachingPreference).toBe("encouraging");
    expect(body.memory.preferredExercises).toEqual(["Bench Press", "Squat"]);
  });
});

describe("DELETE /api/dante/memory", () => {
  it("clears the user's own memory", async () => {
    const { DELETE } = await import("../route");
    const fake = createFakeSupabase({
      authenticatedUserId: "user-1",
      seedRows: [
        {
          user_id: "user-1",
          preferred_exercises: ["Bench Press"],
          disliked_exercises: [],
          weak_point_priorities: [],
          coaching_preference: null,
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(fake.store.has("user-1")).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    const { DELETE } = await import("../route");
    const fake = createFakeSupabase({ authenticatedUserId: null });
    vi.mocked(createClient).mockResolvedValue(fake.client);

    const response = await DELETE();
    expect(response.status).toBe(401);
  });
});
