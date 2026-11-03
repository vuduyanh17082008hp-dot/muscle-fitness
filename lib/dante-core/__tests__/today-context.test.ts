import { describe, expect, it } from "vitest";

import { buildDanteQuickActions, buildDanteTodayContext, type TodayContextInput } from "@/lib/dante-core/today-context";

const base: TodayContextInput = {
  now: new Date("2026-11-01T09:00:00Z"),
  localDate: "2026-11-01",
  hold: null,
  training: { status: "ok", session: { id: "s1", name: "Push Day", state: "not_started" } },
  recovery: { checkinsUnavailable: false, status: "CURRENT", score: 82, recordedDate: "2026-11-01", todayUpdatedAt: "2026-11-01T07:10:00Z" },
  nutrition: {
    targets: { calories: 2400, protein: 150 },
    log: { unavailable: false, entries: 3, calories: 1210, protein: 88, lastLoggedAt: "2026-11-01T08:30:00Z" },
  },
};
const item = (input: TodayContextInput, id: string) => buildDanteTodayContext(input).items.find((i) => i.id === id)!;
const labels = (input: TodayContextInput) => buildDanteQuickActions(input).map((a) => a.label);
const prompts = (input: TodayContextInput) => buildDanteQuickActions(input).map((a) => a.prompt).join(" | ");

describe("Dante today context", () => {
  it("reports verified current data with its freshness", () => {
    expect(item(base, "recovery")).toMatchObject({ summary: "Checked in · 82/100", status: "current", asOf: "2026-11-01T07:10:00Z" });
    expect(item(base, "nutrition")).toMatchObject({ summary: "1,210 kcal · 88 g protein logged", status: "current" });
    expect(item(base, "nutrition").detail).toContain("62 g protein left");
    expect(item(base, "training")).toMatchObject({ summary: "Push Day · scheduled", href: "/dashboard/workouts/session/s1" });
  });

  it("never turns a missing check-in into recovered", () => {
    const missing = item({ ...base, recovery: { ...base.recovery!, status: "MISSING", score: null, recordedDate: null, todayUpdatedAt: null } }, "recovery");
    expect(missing.status).toBe("missing");
    expect(missing.detail).toMatch(/won't assume you're recovered/);
    const stale = item({ ...base, recovery: { ...base.recovery!, status: "STALE", score: 61, recordedDate: "2026-10-30", todayUpdatedAt: null } }, "recovery");
    expect(stale).toMatchObject({ status: "outdated", summary: "No check-in today" });
    expect(stale.detail).toMatch(/2026-10-30 \(61\/100\) — not today's readiness/);
  });

  it("distinguishes a failed read from an empty day", () => {
    expect(item({ ...base, recovery: null }, "recovery").status).toBe("unavailable");
    expect(item({ ...base, recovery: { ...base.recovery!, checkinsUnavailable: true } }, "recovery").detail).toMatch(/Not treated as clear/);
    expect(item({ ...base, nutrition: { ...base.nutrition, log: null } }, "nutrition").status).toBe("unavailable");
    expect(item({ ...base, nutrition: { ...base.nutrition, log: { ...base.nutrition.log!, unavailable: true } } }, "nutrition").summary).toMatch(/Couldn't load/);
    const empty = item({ ...base, nutrition: { ...base.nutrition, log: { ...base.nutrition.log!, entries: 0, calories: 0, protein: 0 } } }, "nutrition");
    expect(empty).toMatchObject({ status: "missing", summary: "Nothing logged today" });
    expect(item({ ...base, training: { status: "unavailable" } }, "training").status).toBe("unavailable");
  });

  it("does not compute protein left without a real target", () => {
    const noTargets = { ...base, nutrition: { ...base.nutrition, targets: null } };
    expect(item(noTargets, "nutrition").detail).toBe("No daily targets set.");
    expect(prompts(noTargets)).not.toMatch(/g of protein left/);
  });

  it("states the hold and marks a scheduled session as not cleared", () => {
    const held = buildDanteTodayContext({ ...base, hold: "recovery" });
    expect(held.holdNote).toMatch(/flagged pain or illness/);
    expect(held.items[0].detail).toMatch(/Not cleared to start/);
  });
});

describe("Dante quick actions", () => {
  it("offers a workout review only when today's workout is done", () => {
    expect(labels(base)).not.toContain("Review workout");
    const done = { ...base, training: { status: "ok" as const, session: { id: "s1", name: "Push Day", state: "completed" } } };
    expect(labels(done)).toContain("Review workout");
    expect(prompts(done)).toMatch(/Review my Push Day session/);
    expect(labels({ ...base, training: { status: "ok", session: null } })).toContain("What should I train?");
  });

  it("on a hold, nothing offers to plan, start or push training (ported safety guarantee)", () => {
    for (const hold of ["recovery", "unverified"] as const) {
      const text = prompts({ ...base, hold });
      expect(text).not.toMatch(/focus on|train hard|still train|What should I train today|middle of/);
      expect(labels({ ...base, hold })).not.toContain("Recovery advice");
    }
    expect(prompts({ ...base, hold: "recovery" })).toMatch(/flagged pain or illness/);
    expect(prompts({ ...base, hold: "unverified" })).toMatch(/couldn't be confirmed/);
  });

  it("uses real remaining protein only, and check-in help when there is no check-in", () => {
    expect(prompts(base)).toMatch(/I have 62 g of protein left today out of a 150 g target/);
    const noCheckin = { ...base, recovery: { ...base.recovery!, status: "MISSING" as const, score: null } };
    expect(labels(noCheckin)).toContain("Check-in help");
    expect(labels({ ...base, recovery: null })).not.toContain("Check-in help");
  });

  it("keeps labels short and starting with a capital, no emoji", () => {
    for (const action of buildDanteQuickActions(base)) {
      expect(action.label.length).toBeLessThanOrEqual(22);
      expect(action.label).toMatch(/^[A-Z][\w ?'’-]+$/);
    }
  });
});
