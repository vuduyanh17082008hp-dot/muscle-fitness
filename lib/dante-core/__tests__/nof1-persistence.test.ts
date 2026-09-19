import { describe, expect, it, vi } from "vitest";

import {
  loadLatestFailedNof1Proposal,
  persistAcceptedNof1Experiment,
} from "@/lib/dante-core/nof1-engine/persistence";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "11111111-1111-4111-8111-111111111111";

const row = {
  id: EXPERIMENT_ID,
  user_id: USER_ID,
  hypothesis: "More sleep improves comparable-session performance.",
  rationale: "Sleep and volume changed together.",
  controlled_variables: ["training volume"],
  variable_under_test: "sleep duration",
  primary_outcome: "RPE / comparable performance",
  secondary_outcomes: [],
  experiment_window: {
    start: "2026-09-18T00:00:00.000Z",
    end: "2026-09-25T00:00:00.000Z",
    durationDays: 7,
  },
  confounders: [],
  status: "ACTIVE",
  user_confirmed: true,
  protocol_adherence: null,
  conclusion: null,
  template_id: "SLEEP_VS_VOLUME",
  created_at: "2026-09-18T00:00:00.000Z",
  completed_at: null,
};

function queryResult(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

const acceptInput = {
  hypothesis: row.hypothesis,
  rationale: row.rationale,
  controlledVariables: ["training volume"],
  variableUnderTest: "sleep duration",
  primaryOutcome: "RPE / comparable performance",
  secondaryOutcomes: [],
  experimentWindow: row.experiment_window,
  templateId: "SLEEP_VS_VOLUME" as const,
  createdAt: row.created_at,
};

describe("nof1 — persistence", () => {
  it("persists confirmed activation as ACTIVE with the authenticated user id", async () => {
    const activeLookup = queryResult({ data: null, error: null });
    const insert = vi.fn((payload: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({ data: { ...row, ...payload }, error: null }),
      }),
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: () => activeLookup,
        insert,
      })),
    };

    const result = await persistAcceptedNof1Experiment(supabase as never, USER_ID, acceptInput);
    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      status: "ACTIVE",
      user_confirmed: true,
      variable_under_test: "sleep duration",
    }));
    if (result.success) {
      expect(result.data.id).toBe(EXPERIMENT_ID);
      expect(result.data.status).toBe("ACTIVE");
      expect(result.data.userConfirmed).toBe(true);
    }
  });

  it("returns the real missing-table failure and never reports ACTIVE", async () => {
    const missing = { data: null, error: { code: "PGRST205", message: "table missing" } };
    const activeLookup = queryResult(missing);
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => missing }),
    }));
    const supabase = {
      from: vi.fn(() => ({ select: () => activeLookup, insert })),
    };

    const result = await persistAcceptedNof1Experiment(supabase as never, USER_ID, acceptInput);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/PGRST205|table is unavailable/i);
  });

  it("restores only the authenticated user's latest failed activation", async () => {
    const failedAction = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "failed",
      args: acceptInput,
      result: { error: "PGRST205" },
      created_at: "2026-09-18T00:01:00.000Z",
    };
    const query = queryResult({ data: failedAction, error: null });
    const supabase = { from: vi.fn(() => ({ select: () => query })) };

    const restored = await loadLatestFailedNof1Proposal(supabase as never, USER_ID);
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("tool_name", "accept_nof1_experiment");
    expect(restored).toMatchObject({
      status: "ACTIVATION_FAILED",
      variableUnderTest: "sleep duration",
      controlledVariables: ["training volume"],
      userConfirmed: true,
      activationError: "PGRST205",
    });
  });

  it("does not resurrect an older failure after a later action supersedes it", async () => {
    const latestExecuted = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "executed",
      args: acceptInput,
      result: { experimentId: EXPERIMENT_ID },
      created_at: "2026-09-18T00:02:00.000Z",
    };
    const query = queryResult({ data: latestExecuted, error: null });
    const supabase = { from: vi.fn(() => ({ select: () => query })) };
    expect(await loadLatestFailedNof1Proposal(supabase as never, USER_ID)).toBeNull();
  });
});
