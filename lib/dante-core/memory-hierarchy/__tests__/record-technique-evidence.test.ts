import { beforeEach, describe, expect, it } from "vitest";

import { recordTechniqueEvidenceFromDeviations } from "@/lib/dante-core/memory-hierarchy/record-technique-evidence";
import type { BaselineDeviation } from "@/lib/dante-core/personal-baseline";

/**
 * Tests the write path for SetVision's longitudinal technique-learning
 * loop. Covers the mission's required scenarios: valid persistence,
 * correct user scoping, malformed-input rejection, idempotency under
 * retry, and multi-observation state accumulation (including evidence
 * DILUTING the direction that stops happening, not just reinforcing
 * the one that does).
 */

type PatternRow = {
  id: string;
  user_id: string;
  exercise: string;
  signal_type: string;
  direction: string;
  status: string;
  sample_count: number;
  notable_count: number;
  confidence: number;
  summary: string;
  first_observed_at: string;
  last_reinforced_at: string;
};

function deviation(overrides: Partial<BaselineDeviation> = {}): BaselineDeviation {
  return { current: 0.7, baseline: 0.85, delta: -0.15, sampleCount: 6, confidence: 0.5, ...overrides };
}

class FakeDatabase {
  patterns = new Map<string, PatternRow>();
  processedAnalysisIds = new Set<string>();
  userIdCallsSeen: string[] = [];
  nextId = 1;

  key(userId: string, exercise: string, signalType: string, direction: string) {
    return `${userId}:${exercise}:${signalType}:${direction}`;
  }
}

function createFakeSupabase(db: FakeDatabase) {
  return {
    from(table: string) {
      if (table === "setvision_analyses") {
        return {
          update: (values: { technique_pattern_processed_at: string }) => ({
            eq: (col1: string, userIdOrAnalysisId: string) => ({
              eq: (col2: string, second: string) => ({
                is: (col3: string, _val: null) => ({
                  select: async (_cols: string) => {
                    // Determine analysisId/userId regardless of eq() call order used by the implementation.
                    const analysisId = col1 === "id" ? userIdOrAnalysisId : second;
                    const userId = col1 === "user_id" ? userIdOrAnalysisId : second;
                    db.userIdCallsSeen.push(userId);

                    if (db.processedAnalysisIds.has(analysisId)) {
                      return { data: [], error: null };
                    }

                    db.processedAnalysisIds.add(analysisId);
                    void values;
                    void col3;
                    return { data: [{ id: analysisId }], error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }

      if (table === "dante_technique_patterns") {
        return {
          select: () => ({
            eq: (col1: string, v1: string) => ({
              eq: (col2: string, v2: string) => ({
                eq: (col3: string, v3: string) => ({
                  eq: (col4: string, v4: string) => ({
                    maybeSingle: async () => {
                      const fields: Record<string, string> = { [col1]: v1, [col2]: v2, [col3]: v3, [col4]: v4 };
                      db.userIdCallsSeen.push(fields.user_id);
                      const key = db.key(fields.user_id, fields.exercise, fields.signal_type, fields.direction);
                      return { data: db.patterns.get(key) ?? null, error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
          insert: (row: Omit<PatternRow, "id">) => {
            db.userIdCallsSeen.push(row.user_id);
            const id = `pattern-${db.nextId++}`;
            const key = db.key(row.user_id, row.exercise, row.signal_type, row.direction);
            db.patterns.set(key, { id, ...row });
            return Promise.resolve({ error: null });
          },
          update: (values: Partial<PatternRow>) => ({
            eq: (_col1: string, id: string) => ({
              eq: (_col2: string, userId: string) => {
                db.userIdCallsSeen.push(userId);
                const existingEntry = [...db.patterns.entries()].find(([, row]) => row.id === id);
                if (existingEntry) {
                  db.patterns.set(existingEntry[0], { ...existingEntry[1], ...values });
                }
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const USER_ID = "user-1";
const NOW = new Date("2026-09-14T12:00:00.000Z");

describe("recordTechniqueEvidenceFromDeviations", () => {
  let db: FakeDatabase;

  beforeEach(() => {
    db = new FakeDatabase();
  });

  it("persists a new pattern row on the first evidence-worthy analysis (test 1: valid persistence)", async () => {
    const supabase = createFakeSupabase(db);

    const result = await recordTechniqueEvidenceFromDeviations(
      supabase,
      USER_ID,
      "analysis-1",
      "squat",
      { rom_consistency: deviation({ delta: -0.15 }) },
      NOW,
    );

    expect(result).toMatchObject({ recorded: true, signalsProcessed: ["rom_consistency"] });

    const belowRow = db.patterns.get(db.key(USER_ID, "squat", "rom_consistency", "below_baseline"));
    expect(belowRow).toMatchObject({ sample_count: 1, notable_count: 1, user_id: USER_ID });

    const aboveRow = db.patterns.get(db.key(USER_ID, "squat", "rom_consistency", "above_baseline"));
    expect(aboveRow).toMatchObject({ sample_count: 1, notable_count: 0 });
  });

  it("scopes every read and write to the calling user (test 2/3/9: user isolation)", async () => {
    const supabase = createFakeSupabase(db);

    await recordTechniqueEvidenceFromDeviations(
      supabase,
      USER_ID,
      "analysis-1",
      "bench_press",
      { tempo_consistency: deviation({ delta: 0.2 }) },
      NOW,
    );

    expect(db.userIdCallsSeen.length).toBeGreaterThan(0);
    expect(db.userIdCallsSeen.every((id) => id === USER_ID)).toBe(true);
  });

  it("rejects malformed deviations without writing anything (test 4: malformed input)", async () => {
    const supabase = createFakeSupabase(db);

    const result = await recordTechniqueEvidenceFromDeviations(
      supabase,
      USER_ID,
      "analysis-1",
      "deadlift",
      {
        rom_consistency: deviation({ delta: Number.NaN }),
        tempo_consistency: deviation({ baseline: null, delta: null, confidence: 0 }),
      },
      NOW,
    );

    expect(result).toMatchObject({ recorded: true, signalsProcessed: [] });
    expect(db.patterns.size).toBe(0);
  });

  it("does not persist anything when no deviations are supplied", async () => {
    const supabase = createFakeSupabase(db);

    const result = await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, "analysis-1", "squat", {}, NOW);

    expect(result).toMatchObject({ recorded: true, signalsProcessed: [] });
    expect(db.patterns.size).toBe(0);
  });

  it("a retried call for the same analysisId is a no-op (test 5: idempotency)", async () => {
    const supabase = createFakeSupabase(db);
    const deviations = { rom_consistency: deviation({ delta: -0.2 }) };

    const first = await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, "analysis-1", "squat", deviations, NOW);
    const second = await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, "analysis-1", "squat", deviations, NOW);

    expect(first.recorded).toBe(true);
    expect(second).toMatchObject({ recorded: false, reason: "already_processed" });

    const belowRow = db.patterns.get(db.key(USER_ID, "squat", "rom_consistency", "below_baseline"));
    expect(belowRow?.sample_count).toBe(1);
  });

  it("multiple DIFFERENT analyses correctly accumulate sample/notable counts (test 6: longitudinal state)", async () => {
    const supabase = createFakeSupabase(db);

    await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, "analysis-1", "squat", { rom_consistency: deviation({ delta: -0.15 }) }, NOW);
    await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, "analysis-2", "squat", { rom_consistency: deviation({ delta: -0.2 }) }, NOW);
    await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, "analysis-3", "squat", { rom_consistency: deviation({ delta: 0.02 }) }, NOW); // still evaluable, but |0.02| is under the notable threshold either direction

    const belowRow = db.patterns.get(db.key(USER_ID, "squat", "rom_consistency", "below_baseline"))!;
    expect(belowRow.sample_count).toBe(3);
    expect(belowRow.notable_count).toBe(2);
    expect(belowRow.confidence).toBeGreaterThan(0);

    const aboveRow = db.patterns.get(db.key(USER_ID, "squat", "rom_consistency", "above_baseline"))!;
    expect(aboveRow.sample_count).toBe(3);
    expect(aboveRow.notable_count).toBe(0);
  });

  it("evidence that stops recurring dilutes an existing direction's confidence rather than leaving it stale", async () => {
    const supabase = createFakeSupabase(db);

    // Eight notable below-baseline analyses saturate the sample-size weight
    // term (computePatternConfidence's IDEAL_SAMPLE_SIZE) at a perfect
    // ratio, so confidence here is already at its ceiling for this evidence.
    for (let i = 0; i < 8; i += 1) {
      await recordTechniqueEvidenceFromDeviations(supabase, USER_ID, `a${i}`, "bench_press", { tempo_consistency: deviation({ delta: -0.15 }) }, NOW);
    }

    const confidenceAfterEight = db.patterns.get(db.key(USER_ID, "bench_press", "tempo_consistency", "below_baseline"))!.confidence;

    // ...then four more sessions in a row show no below-baseline deviation
    // at all. Sample-size weight is already saturated, so this can only
    // dilute the ratio — an unambiguous, isolated confidence decrease.
    for (let i = 0; i < 4; i += 1) {
      await recordTechniqueEvidenceFromDeviations(
        supabase,
        USER_ID,
        `b${i}`,
        "bench_press",
        { tempo_consistency: deviation({ delta: 0.15 }) },
        NOW,
      );
    }

    const confidenceAfterTwelve = db.patterns.get(db.key(USER_ID, "bench_press", "tempo_consistency", "below_baseline"))!.confidence;
    expect(confidenceAfterTwelve).toBeLessThan(confidenceAfterEight);
  });
});
