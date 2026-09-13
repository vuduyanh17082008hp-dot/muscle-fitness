import { describe, expect, it } from "vitest";

import {
  checkConsecutiveAutoAdaptations,
  checkCooldown,
  checkCycleBudget,
  checkNotificationBudget,
} from "@/lib/dante-core/autonomy/budgets";
import { ACTION_BUDGET_CONFIG } from "@/lib/dante-core/autonomy/config";

describe("checkCooldown", () => {
  it("allows the first-ever action (no prior timestamp)", () => {
    expect(checkCooldown(null).allowed).toBe(true);
  });

  it("blocks a repeat within the cooldown window", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const lastApplied = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const result = checkCooldown(lastApplied, now);
    expect(result.allowed).toBe(false);
  });

  it("allows a repeat once the cooldown window has fully elapsed", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const lastApplied = new Date(
      now.getTime() - (ACTION_BUDGET_CONFIG.cooldownHours + 1) * 60 * 60 * 1000,
    ).toISOString();
    const result = checkCooldown(lastApplied, now);
    expect(result.allowed).toBe(true);
  });
});

describe("checkCycleBudget", () => {
  it("allows actions below the per-cycle cap", () => {
    expect(checkCycleBudget(0).allowed).toBe(true);
    expect(checkCycleBudget(ACTION_BUDGET_CONFIG.maxActionsPerCycle - 1).allowed).toBe(true);
  });

  it("blocks once the per-cycle cap is reached", () => {
    expect(checkCycleBudget(ACTION_BUDGET_CONFIG.maxActionsPerCycle).allowed).toBe(false);
  });
});

describe("checkConsecutiveAutoAdaptations", () => {
  it("allows auto-adaptation below the consecutive limit", () => {
    expect(checkConsecutiveAutoAdaptations(0).allowed).toBe(true);
  });

  it("forces a confirm once too many consecutive auto-adaptations have happened — becoming smarter should mean less noise, not more", () => {
    expect(checkConsecutiveAutoAdaptations(ACTION_BUDGET_CONFIG.maxConsecutiveAutoAdaptations).allowed).toBe(
      false,
    );
  });
});

describe("checkNotificationBudget", () => {
  it("blocks once the daily notification budget is used up", () => {
    expect(checkNotificationBudget(ACTION_BUDGET_CONFIG.notificationBudgetPerDay).allowed).toBe(false);
    expect(checkNotificationBudget(0).allowed).toBe(true);
  });
});
