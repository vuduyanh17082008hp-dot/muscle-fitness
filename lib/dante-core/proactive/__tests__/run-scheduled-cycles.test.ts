import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dante-core/orchestrator/run-cycle-for-user", () => ({
  runDanteCycleForUser: vi.fn(),
}));

import { runDanteCycleForUser } from "@/lib/dante-core/orchestrator/run-cycle-for-user";
import { runScheduledDanteCycles } from "@/lib/dante-core/proactive/run-scheduled-cycles";

const mockedRunCycle = vi.mocked(runDanteCycleForUser);

type Profile = { user_id: string };
type RoleRow = { user_id: string; role: string | null };

function createFakeAdminClient(profiles: Profile[], roles: RoleRow[]) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: profiles, error: null }),
            }),
          }),
        };
      }

      if (table === "user_roles") {
        return {
          select: () => ({
            in: async () => ({ data: roles, error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  } as unknown as Parameters<typeof runScheduledDanteCycles>[0];
}

describe("runScheduledDanteCycles", () => {
  beforeEach(() => {
    mockedRunCycle.mockReset();
  });

  it("runs a cycle for every onboarded client user and reports counts", async () => {
    const client = createFakeAdminClient(
      [{ user_id: "client-1" }, { user_id: "client-2" }],
      [
        { user_id: "client-1", role: "client" },
        { user_id: "client-2", role: null },
      ],
    );

    mockedRunCycle.mockImplementation(async (_supabase, userId) => ({
      changes: [],
      gatedActions: userId === "client-1"
        ? [
            {
              action: { domain: "training", reason: "", evidence: [], limits: null, provenance: "test", payload: { type: "recovery_action", suggestion: "x" } } as never,
              autonomyDecision: "auto",
              scenariosConsidered: null,
              budgetAllowed: true,
              budgetReason: null,
            },
          ]
        : [],
      decisionCode: "NO_CHANGE",
      confidence: null,
      warnings: [],
    }));

    const summary = await runScheduledDanteCycles(client, "morning");

    expect(summary.userCount).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(mockedRunCycle).toHaveBeenCalledTimes(2);
    const client1Result = summary.results.find((r) => r.userId === "client-1");
    expect(client1Result).toMatchObject({ ok: true, autoAppliedCount: 1 });
  });

  it("excludes non-client roles (coach/business/admin accounts)", async () => {
    const client = createFakeAdminClient(
      [{ user_id: "coach-1" }, { user_id: "client-1" }],
      [
        { user_id: "coach-1", role: "coach" },
        { user_id: "client-1", role: "client" },
      ],
    );

    mockedRunCycle.mockResolvedValue({
      changes: [],
      gatedActions: [],
      decisionCode: "NO_CHANGE",
      confidence: null,
      warnings: [],
    });

    const summary = await runScheduledDanteCycles(client, "evening");

    expect(summary.userCount).toBe(1);
    expect(mockedRunCycle).toHaveBeenCalledTimes(1);
    expect(mockedRunCycle).toHaveBeenCalledWith(client, "client-1");
  });

  it("one user's failure does not abort the batch", async () => {
    const client = createFakeAdminClient(
      [{ user_id: "client-1" }, { user_id: "client-2" }],
      [
        { user_id: "client-1", role: "client" },
        { user_id: "client-2", role: "client" },
      ],
    );

    mockedRunCycle.mockImplementation(async (_supabase, userId) => {
      if (userId === "client-1") throw new Error("boom");
      return { changes: [], gatedActions: [], decisionCode: "NO_CHANGE", confidence: null, warnings: [] };
    });

    const summary = await runScheduledDanteCycles(client, "manual");

    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    const failedResult = summary.results.find((r) => r.userId === "client-1");
    expect(failedResult).toMatchObject({ ok: false, error: "boom" });
  });

  it("returns an empty summary with no throw when there are no onboarded profiles", async () => {
    const client = createFakeAdminClient([], []);

    const summary = await runScheduledDanteCycles(client, "morning");

    expect(summary.userCount).toBe(0);
    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toBe(0);
    expect(mockedRunCycle).not.toHaveBeenCalled();
  });
});
