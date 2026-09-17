import { beforeEach, describe, expect, it, vi } from "vitest";

const nextRuntime = vi.hoisted(() => ({
  callbacks: [] as Array<() => void | Promise<void>>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => void | Promise<void>) => {
      nextRuntime.callbacks.push(callback);
    }),
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/athlete-state/build-athlete-state", () => ({ buildAthleteState: vi.fn() }));
vi.mock("@/lib/training/load-training-context", () => ({ loadTrainingContext: vi.fn() }));
vi.mock("@/lib/training/load-today-session", () => ({ loadTodaySession: vi.fn() }));
vi.mock("@/lib/dante-core/daily-decision-engine", () => ({ buildDailyDecision: vi.fn() }));
vi.mock("@/lib/dante-core/adaptive-program-engine", () => ({ buildAdaptiveProgram: vi.fn() }));
vi.mock("@/lib/dante-core/program-adaptation-log", () => ({ logProgramAdaptations: vi.fn() }));
vi.mock("@/lib/dante-core/performance-forecast", () => ({ buildPerformanceForecast: vi.fn() }));
vi.mock("@/lib/dante-core/shadow/shadow-runtime", () => ({ observeDailyDecisionInShadow: vi.fn() }));

import { GET } from "@/app/api/dante/daily-decision/route";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { loadTodaySession } from "@/lib/training/load-today-session";
import { buildDailyDecision } from "@/lib/dante-core/daily-decision-engine";
import { buildAdaptiveProgram } from "@/lib/dante-core/adaptive-program-engine";
import { logProgramAdaptations } from "@/lib/dante-core/program-adaptation-log";
import { buildPerformanceForecast } from "@/lib/dante-core/performance-forecast";
import { observeDailyDecisionInShadow } from "@/lib/dante-core/shadow/shadow-runtime";
import type { MetaAction, ShadowDecision } from "@/lib/dante-core/shadow/types";

const productionDecision = {
  recommendation: "Proceed with the safe production recommendation.",
  decision: {
    decisionCode: "proceed_as_planned" as const,
    sessionId: "session-1",
    affectedExercises: [],
    warnings: [],
  },
  why: ["Production evidence."],
  dataUsed: { readinessScore: 80 },
  confidence: "high" as const,
  sources: [],
};

function shadowDecision(action: MetaAction): ShadowDecision {
  return {
    userId: "user-a",
    action,
    selectedStrategyId: action === "USE" ? "strategy-a" : null,
    alternativeStrategyIds: action === "EXPLORE" ? ["strategy-a", "strategy-b"] : [],
    questionTargets: action === "ASK" ? ["sleep_hours"] : [],
    retrievalContext: action === "RETRIEVE" ? "normal_conditions" : null,
    reasonCodes: [action],
    promotionLevel: "SHADOW",
    confidence: 0.5,
    createdAt: "2026-09-17T00:00:00.000Z",
  };
}

async function callRoute() {
  const response = await GET(new Request("http://localhost/api/dante/daily-decision"));
  return { response, json: await response.json() };
}

describe("daily-decision shadow-to-production isolation", () => {
  beforeEach(() => {
    nextRuntime.callbacks.length = 0;
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "user-a" } }, error: null }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(buildAthleteState).mockResolvedValue({ generatedAt: "2026-09-17T00:00:00.000Z" } as never);
    vi.mocked(loadTrainingContext).mockResolvedValue({} as never);
    vi.mocked(loadTodaySession).mockResolvedValue({ id: "session-1" } as never);
    vi.mocked(buildDailyDecision).mockReturnValue({
      decision: structuredClone(productionDecision),
      proposedActions: [],
    });
    vi.mocked(buildAdaptiveProgram).mockReturnValue([]);
    vi.mocked(buildPerformanceForecast).mockReturnValue({ status: "stable" } as never);
    vi.mocked(logProgramAdaptations).mockResolvedValue(undefined);
  });

  it.each(["ABSTAIN", "WAIT", "ASK", "RETRIEVE", "EXPLORE"] as const)(
    "keeps the production response unchanged when shadow chooses %s",
    async (action) => {
      vi.mocked(observeDailyDecisionInShadow).mockResolvedValue(shadowDecision(action));

      const { response, json } = await callRoute();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        decision: productionDecision,
        proposedActions: [],
        programAdaptations: [],
        forecast: { status: "stable" },
      });
      expect(observeDailyDecisionInShadow).not.toHaveBeenCalled();
      expect(nextRuntime.callbacks).toHaveLength(1);

      await nextRuntime.callbacks[0]!();
      expect(observeDailyDecisionInShadow).toHaveBeenCalledTimes(1);
    },
  );

  it("serializes production before even a mutating shadow defect can run", async () => {
    vi.mocked(observeDailyDecisionInShadow).mockImplementation(async (input) => {
      input.productionDecision.recommendation = "shadow mutation attempt";
      return shadowDecision("ABSTAIN");
    });

    const { json } = await callRoute();
    await nextRuntime.callbacks[0]!();

    expect(json.decision.recommendation).toBe(productionDecision.recommendation);
  });

  it("returns production normally when the shadow module throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(observeDailyDecisionInShadow).mockRejectedValue(new Error("shadow database unavailable"));

    const { response, json } = await callRoute();
    await expect(nextRuntime.callbacks[0]!()).resolves.toBeUndefined();

    expect(response.status).toBe(200);
    expect(json.decision).toEqual(productionDecision);
    expect(warn).toHaveBeenCalledWith(
      "[DANTE PHASE3] Shadow observation failed without affecting production",
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("returns production normally when post-response scheduling itself fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error("request context unavailable");
    });

    const { response, json } = await callRoute();

    expect(response.status).toBe(200);
    expect(json.decision).toEqual(productionDecision);
    expect(observeDailyDecisionInShadow).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[DANTE PHASE3] Shadow observation could not be scheduled",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
