import { describe, expect, it } from "vitest";
import { resolveBodyWeight, withUserStatedWeight } from "@/lib/athlete-state/resolve-body-weight";

/** H0 cluster E — USER_CORRECTION > fresh weigh-in > profile > stale weigh-in; axes kept separate. */
const NOW = new Date("2026-10-16T08:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe("resolveBodyWeight", () => {
  it("today's weigh-in (75) outranks the profile (80)", () => {
    const state = resolveBodyWeight({ weighIns: [{ kg: 80, date: daysAgo(60) }, { kg: 75, date: daysAgo(0) }], profileKg: 80, now: NOW });
    expect(state.current).toMatchObject({ valueKg: 75, origin: "WEIGH_IN", freshness: "FRESH", ageDays: 0 });
    expect(state.rule).toMatch(/Use 75 kg — the latest weigh-in/);
  });
  it("only a 90-day-old weigh-in: dated, STALE, never called current", () => {
    const state = resolveBodyWeight({ weighIns: [{ kg: 92, date: daysAgo(90) }], now: NOW });
    expect(state.current).toMatchObject({ valueKg: 92, freshness: "STALE", ageDays: 90 });
    expect(state.rule).toMatch(/never "your current weight is"/);
  });
  it("the profile outranks a stale weigh-in but is UNDATED, never 'up to date'", () => {
    const state = resolveBodyWeight({ weighIns: [{ kg: 92, date: daysAgo(120) }], profileKg: 85, now: NOW });
    expect(state.current).toMatchObject({ valueKg: 85, origin: "PROFILE", freshness: "UNDATED" });
    expect(state.rule).toMatch(/never call it current, recent or up to date/);
    expect(state.alsoKnown[0]).toMatchObject({ valueKg: 92, temporal: "HISTORICAL" });
  });
  it("a correction in this chat outranks everything and says the profile was not updated", () => {
    const base = resolveBodyWeight({ weighIns: [{ kg: 75, date: daysAgo(1) }], profileKg: 80, now: NOW });
    const state = withUserStatedWeight(base, 60, NOW);
    expect(state.current).toMatchObject({ valueKg: 60, origin: "USER_CORRECTION" });
    expect(state.rule).toMatch(/Do not claim the profile was updated/);
    expect(state.alsoKnown.map((entry) => entry.valueKg)).toEqual(expect.arrayContaining([75, 80]));
  });
  it("nothing known: unavailable, no assumed value", () => {
    expect(resolveBodyWeight({ now: NOW })).toMatchObject({ available: false, current: null });
  });
});
