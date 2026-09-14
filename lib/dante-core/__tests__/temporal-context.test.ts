import { describe, expect, it } from "vitest";

import { buildDanteTemporalContext, formatDanteTemporalContext } from "@/lib/dante-core/temporal-context";

/**
 * Covers the "Dante says the wrong current time" bug fix (Tests A, B, E):
 * a deterministic, server-computed temporal context — never something
 * the model calculates or guesses — built from the SAME
 * profiles.timezone convention lib/training/load-today-session.ts uses
 * for "today".
 */
describe("buildDanteTemporalContext", () => {
  it("returns the correct LOCAL date/time for a user near local midnight in Asia/Singapore (Test A)", () => {
    // UTC 2026-09-13T16:37:00Z is 2026-09-14T00:37 in Singapore (UTC+8).
    const now = new Date("2026-09-13T16:37:00.000Z");

    const context = buildDanteTemporalContext(now, "Asia/Singapore");

    expect(context).toEqual({
      timezone: "Asia/Singapore",
      localDate: "2026-09-14",
      localTime: "00:37",
      localDateTime: "2026-09-14 00:37",
      utcDateTime: "2026-09-13T16:37:00.000Z",
    });
  });

  it("uses the user's local calendar date even when it differs from the UTC date (Test B)", () => {
    const now = new Date("2026-09-13T23:30:00.000Z"); // still Sept 13 in UTC

    const utcContext = buildDanteTemporalContext(now, "UTC");
    const singaporeContext = buildDanteTemporalContext(now, "Asia/Singapore");

    expect(utcContext?.localDate).toBe("2026-09-13");
    expect(singaporeContext?.localDate).toBe("2026-09-14");
  });

  it("never fabricates a local time when the timezone is missing (Test E)", () => {
    const now = new Date("2026-09-13T16:37:00.000Z");

    expect(buildDanteTemporalContext(now, null)).toBeNull();
    expect(buildDanteTemporalContext(now, undefined)).toBeNull();
  });

  it("never fabricates a local time for an invalid/corrupted timezone value (Test E)", () => {
    const now = new Date("2026-09-13T16:37:00.000Z");

    expect(buildDanteTemporalContext(now, "Not/A_Real_Zone")).toBeNull();
  });
});

describe("formatDanteTemporalContext", () => {
  it("marks the block authoritative and forbids the model from recalculating it", () => {
    const context = buildDanteTemporalContext(new Date("2026-09-13T16:37:00.000Z"), "Asia/Singapore");

    const block = formatDanteTemporalContext(context);

    expect(block).toContain("Timezone: Asia/Singapore");
    expect(block).toContain("Local date: 2026-09-14");
    expect(block).toContain("Local time: 00:37");
    expect(block).toContain("Never calculate, estimate, or override it");
  });

  it("tells the model the local time zone is unavailable rather than presenting UTC as local (Test E)", () => {
    const block = formatDanteTemporalContext(null);

    expect(block).toContain("not available");
    expect(block).not.toContain("Timezone:");
    expect(block).not.toContain("Local date:");
    expect(block).not.toContain("Local time:");
    // May still mention UTC as part of the instruction not to fake it —
    // it must never present UTC as if it were the resolved local time.
    expect(block.toLowerCase()).toContain("rather than");
  });
});
