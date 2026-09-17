import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

const sources = vi.hoisted(() => ({
  shadow: vi.fn(),
  validation: vi.fn(),
}));

vi.mock("@/lib/dante-core/shadow/persistence", () => ({ loadRecentShadowEvents: sources.shadow }));
vi.mock("@/lib/dante-core/validation/persistence", () => ({ loadValidationEvents: sources.validation }));

import { buildValidationDashboard } from "@/lib/dante-core/validation/dashboard";

function fakeSupabase(): SupabaseClient {
  return {
    from(table: string) {
      const rows = table === "dante_observations"
        ? [
            { id: "oa", user_id: "athlete-a", context_key: "x", intervention_type: "no_change", outcome: "maintained", provenance: "engine", observed_at: "2026-09-01T00:00:00.000Z" },
            { id: "ob", user_id: "athlete-b", context_key: "x", intervention_type: "no_change", outcome: "maintained", provenance: "engine", observed_at: "2026-09-01T00:00:00.000Z" },
          ]
        : [
            { id: "pa", user_id: "athlete-a", context_key: "x", intervention_type: "no_change", tier: "pattern", status: "active", sample_count: 3, confidence: 0.5, first_observed_at: "2026-09-01T00:00:00.000Z", last_reinforced_at: "2026-09-02T00:00:00.000Z" },
            { id: "pb", user_id: "athlete-b", context_key: "x", intervention_type: "no_change", tier: "pattern", status: "active", sample_count: 3, confidence: 0.5, first_observed_at: "2026-09-01T00:00:00.000Z", last_reinforced_at: "2026-09-02T00:00:00.000Z" },
          ];
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: rows, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("Phase 4 dashboard client isolation", () => {
  it("drops foreign rows even if an upstream source returns them", async () => {
    sources.shadow.mockResolvedValue([
      { id: "sa", userId: "athlete-a", eventType: "SHADOW_DECISION", recommendationId: "ra", contextSignature: null, productionDecision: {}, shadowDecision: null, expectedOutcome: null, actualOutcome: null, uncertaintyProfile: null, driftState: null, stabilityState: null, reasonCodes: [], metadata: {}, occurredAt: "2026-09-01T00:00:00.000Z" },
      { id: "sb", userId: "athlete-b", eventType: "SHADOW_DECISION", recommendationId: "rb", contextSignature: null, productionDecision: {}, shadowDecision: null, expectedOutcome: null, actualOutcome: null, uncertaintyProfile: null, driftState: null, stabilityState: null, reasonCodes: [], metadata: {}, occurredAt: "2026-09-01T00:00:00.000Z" },
    ]);
    sources.validation.mockResolvedValue([
      { id: "va", userId: "athlete-a", eventType: "RECOMMENDATION_TRACE", recommendationId: "ra", parentEventId: null, contextSignature: null, payload: {}, provenance: {}, occurredAt: "2026-09-01T00:00:00.000Z" },
      { id: "vb", userId: "athlete-b", eventType: "RECOMMENDATION_TRACE", recommendationId: "rb", parentEventId: null, contextSignature: null, payload: {}, provenance: {}, occurredAt: "2026-09-01T00:00:00.000Z" },
    ]);
    const dashboard = await buildValidationDashboard(fakeSupabase(), "athlete-a", new Date("2026-09-01T12:00:00.000Z"));
    expect(dashboard.shadowEvents.every((event) => event.userId === "athlete-a")).toBe(true);
    expect(dashboard.validationEvents.every((event) => event.userId === "athlete-a")).toBe(true);
    expect(dashboard.observations.every((event) => event.user_id === "athlete-a")).toBe(true);
    expect(dashboard.patterns.every((event) => event.user_id === "athlete-a")).toBe(true);
  });
});
