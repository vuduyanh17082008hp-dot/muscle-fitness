import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

const USER_ID = "user-1";

type Row = { user_id: string; enabled: boolean; scenario: string | null };

function createFakeSupabase() {
  const rows = new Map<string, Row>();

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from(table: string) {
      if (table !== "user_demo_settings") throw new Error(`Unexpected table: ${table}`);

      return {
        select: () => ({
          eq: (_c: string, userId: string) => ({
            maybeSingle: async () => ({ data: rows.get(userId) ?? null, error: null }),
          }),
        }),
        upsert: async (values: Row) => {
          rows.set(values.user_id, values);
          return { error: null };
        },
      };
    },
  };

  return { client, rows };
}

function putJson(body: unknown) {
  return new Request("http://localhost/api/demo/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("GET /api/demo/settings", () => {
  it("defaults to disabled for a user with no row yet", async () => {
    const { client } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { GET } = await import("../route");
    const response = await GET();
    const body = await response.json();

    expect(body.settings).toEqual({ enabled: false, scenario: null });
    expect(body.scenarios.length).toBeGreaterThan(0);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    } as never);

    const { GET } = await import("../route");
    const response = await GET();

    expect(response.status).toBe(401);
  });
});

describe("PUT /api/demo/settings", () => {
  it("enables a valid scenario for this user only", async () => {
    const { client, rows } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { PUT } = await import("../route");
    const response = await PUT(putJson({ enabled: true, scenario: "recovered_athlete" }));

    expect(response.status).toBe(200);
    expect(rows.get(USER_ID)).toMatchObject({ enabled: true, scenario: "recovered_athlete" });
  });

  it("accepts the data-quality scenarios (partial_data, stale_data) alongside the physiological ones", async () => {
    const { client, rows } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { PUT } = await import("../route");
    const response = await PUT(putJson({ enabled: true, scenario: "stale_data" }));

    expect(response.status).toBe(200);
    expect(rows.get(USER_ID)).toMatchObject({ enabled: true, scenario: "stale_data" });
  });

  it("rejects an unknown scenario id", async () => {
    const { client } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { PUT } = await import("../route");
    const response = await PUT(putJson({ enabled: true, scenario: "not_a_scenario" }));

    expect(response.status).toBe(400);
  });

  it("rejects enabling without a scenario", async () => {
    const { client } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { PUT } = await import("../route");
    const response = await PUT(putJson({ enabled: true, scenario: null }));

    expect(response.status).toBe(400);
  });

  it("disables demo mode", async () => {
    const { client, rows } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { PUT } = await import("../route");
    await PUT(putJson({ enabled: true, scenario: "recovered_athlete" }));
    await PUT(putJson({ enabled: false, scenario: null }));

    expect(rows.get(USER_ID)).toMatchObject({ enabled: false, scenario: null });
  });
});
