import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration-level tests for POST /api/setvision/results, focused on
 * the technique-memory wiring added this pass: it must fire when this
 * analysis becomes the "latest" one, and — mission requirement — a
 * failure anywhere in that best-effort path must never take down the
 * SetVision save response itself (test 10: missing/partial data does
 * not crash).
 */

const ANALYSIS_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "user-1";

const baseAnalysis = {
  exercise: "squat",
  exerciseClassification: { exercise: "squat", confidence: 0.9, signals: [] },
  reps: 5,
  romConsistency: 0.8,
  averageEccentricTime: 1.2,
  averageConcentricTime: 1.1,
  velocity: { calibrated: false, unit: "torso-lengths/s", perRep: [], mean: null, peak: null, final: null, velocityLoss: null },
  technique: { romConsistency: 0.8, tempoConsistency: 0.75, barPathConsistency: null, asymmetryDeg: null },
  confidence: 0.85,
  perRep: { rom: [], tempo: [] },
  limitations: [],
};

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/setvision/load-setvision-context", () => ({ loadSetVisionContext: vi.fn() }));
vi.mock("@/lib/dante-core/memory-hierarchy/record-technique-evidence", () => ({
  recordTechniqueEvidenceFromDeviations: vi.fn(async () => ({ recorded: true, signalsProcessed: [] })),
}));

import { createClient } from "@/lib/supabase/server";
import { loadSetVisionContext } from "@/lib/setvision/load-setvision-context";
import { recordTechniqueEvidenceFromDeviations } from "@/lib/dante-core/memory-hierarchy/record-technique-evidence";

const mockedCreateClient = vi.mocked(createClient);
const mockedLoadSetVisionContext = vi.mocked(loadSetVisionContext);
const mockedRecordTechniqueEvidence = vi.mocked(recordTechniqueEvidenceFromDeviations);

function createFakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: ANALYSIS_ID, analyzed_at: "2026-09-14T00:00:00.000Z" }, error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeRequest(body: unknown) {
  return new Request("https://example.com/api/setvision/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/setvision/results — technique memory wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateClient.mockResolvedValue(createFakeSupabase() as any);
  });

  it("records technique evidence when this analysis is the latest one", async () => {
    mockedLoadSetVisionContext.mockResolvedValue({
      available: true,
      latest: { id: ANALYSIS_ID, exercise: "squat", reps: 5, rom_consistency: 0.8, tempo_consistency: 0.75, velocity_loss: null, confidence: 0.85, analyzed_at: "2026-09-14T00:00:00.000Z" },
      analysesLast30Days: 4,
      romConsistencyDeviation: { current: 0.8, baseline: 0.9, delta: -0.1, sampleCount: 5, confidence: 0.4 },
      tempoConsistencyDeviation: { current: 0.75, baseline: 0.75, delta: 0, sampleCount: 5, confidence: 0.4 },
    });

    const { POST } = await import("@/app/api/setvision/results/route");
    const response = await POST(makeRequest({ analysis: baseAnalysis }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockedRecordTechniqueEvidence).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      ANALYSIS_ID,
      "squat",
      expect.objectContaining({ rom_consistency: expect.anything(), tempo_consistency: expect.anything() }),
    );
  });

  it("does NOT record technique evidence when a different analysis is now the latest (avoids re-scoring stale data)", async () => {
    mockedLoadSetVisionContext.mockResolvedValue({
      available: true,
      latest: { id: "some-other-analysis-id", exercise: "squat", reps: 5, rom_consistency: 0.7, tempo_consistency: 0.7, velocity_loss: null, confidence: 0.8, analyzed_at: "2026-09-14T00:05:00.000Z" },
      analysesLast30Days: 5,
      romConsistencyDeviation: null,
      tempoConsistencyDeviation: null,
    });

    const { POST } = await import("@/app/api/setvision/results/route");
    const response = await POST(makeRequest({ analysis: baseAnalysis }));

    expect(response.status).toBe(200);
    expect(mockedRecordTechniqueEvidence).not.toHaveBeenCalled();
  });

  it("still returns a successful save even when technique-memory recording throws (test 10: missing/partial data does not crash)", async () => {
    mockedLoadSetVisionContext.mockRejectedValue(new Error("boom"));

    const { POST } = await import("@/app/api/setvision/results/route");
    const response = await POST(makeRequest({ analysis: baseAnalysis }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, id: ANALYSIS_ID });
  });

  it("still returns a successful save even when recordTechniqueEvidenceFromDeviations itself throws", async () => {
    mockedLoadSetVisionContext.mockResolvedValue({
      available: true,
      latest: { id: ANALYSIS_ID, exercise: "squat", reps: 5, rom_consistency: 0.8, tempo_consistency: 0.75, velocity_loss: null, confidence: 0.85, analyzed_at: "2026-09-14T00:00:00.000Z" },
      analysesLast30Days: 4,
      romConsistencyDeviation: null,
      tempoConsistencyDeviation: null,
    });
    mockedRecordTechniqueEvidence.mockRejectedValue(new Error("db unavailable"));

    const { POST } = await import("@/app/api/setvision/results/route");
    const response = await POST(makeRequest({ analysis: baseAnalysis }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
