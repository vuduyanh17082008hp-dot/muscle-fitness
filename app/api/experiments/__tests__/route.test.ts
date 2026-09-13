import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/experiments/build-experiment-result", () => ({
  buildExperimentResultFor: vi.fn().mockResolvedValue({
    recommendation: "stub",
    decision: {},
    why: [],
    dataUsed: {},
    confidence: "low",
    sources: [],
  }),
}));

import { createClient } from "@/lib/supabase/server";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

type Row = {
  id: string;
  user_id: string;
  question: string;
  exposure_type: string;
  outcome_type: string;
  window_days: number;
  status: string;
  created_at: string;
};

function createFakeSupabase() {
  const rows: Row[] = [];
  let nextId = 1;

  function client(authenticatedUserId: string) {
    return {
      auth: { getUser: async () => ({ data: { user: { id: authenticatedUserId } }, error: null }) },
      from(table: string) {
        if (table !== "experiments") throw new Error(`Unexpected table: ${table}`);

        return {
          insert: (values: Partial<Row>) => ({
            select: () => ({
              single: async () => {
                const row: Row = {
                  id: `exp-${nextId++}`,
                  user_id: values.user_id as string,
                  question: values.question as string,
                  exposure_type: values.exposure_type as string,
                  outcome_type: values.outcome_type as string,
                  window_days: values.window_days as number,
                  status: "active",
                  created_at: new Date().toISOString(),
                };
                rows.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (_c1: string, userId: string) => ({
              eq: (_c2: string, status: string) => ({
                order: async () => ({
                  data: rows.filter((r) => r.user_id === userId && r.status === status),
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };
  }

  return { client, rows };
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/experiments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("POST /api/experiments", () => {
  it("creates a valid experiment for the authenticated user", async () => {
    const { client, rows } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client(USER_ID) as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({ question: "Does late caffeine affect my sleep?", exposureType: "late_caffeine", outcomeType: "sleep_hours" }),
    );

    expect(response.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_ID);
  });

  it("rejects an unknown exposure type", async () => {
    const { client } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client(USER_ID) as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({ question: "Q", exposureType: "not_a_real_type", outcomeType: "sleep_hours" }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    } as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({ question: "Q", exposureType: "late_caffeine", outcomeType: "sleep_hours" }),
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /api/experiments", () => {
  it("only lists the authenticated user's own experiments (isolation)", async () => {
    const { client } = createFakeSupabase();
    const { POST, GET } = await import("../route");

    vi.mocked(createClient).mockResolvedValueOnce(client(USER_ID) as never);
    await POST(postJson({ question: "Owner's question", exposureType: "late_caffeine", outcomeType: "sleep_hours" }));

    vi.mocked(createClient).mockResolvedValueOnce(client(OTHER_USER_ID) as never);
    const response = await GET();
    const body = await response.json();

    expect(body.experiments).toHaveLength(0);
  });

  it("includes a freshly-computed result alongside each experiment", async () => {
    const { client } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValueOnce(client(USER_ID) as never);

    const { POST } = await import("../route");
    await POST(postJson({ question: "Q", exposureType: "late_caffeine", outcomeType: "sleep_hours" }));

    vi.mocked(createClient).mockResolvedValueOnce(client(USER_ID) as never);
    const { GET } = await import("../route");
    const response = await GET();
    const body = await response.json();

    expect(body.experiments).toHaveLength(1);
    expect(body.experiments[0].result).not.toBeNull();
  });
});
