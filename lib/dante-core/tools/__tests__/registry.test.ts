import { describe, expect, it } from "vitest";

import { DANTE_TOOLS, getDanteTool, listDanteToolNames } from "@/lib/dante-core/tools/registry";

/**
 * Covers Part 22 tests K (invalid tool arguments rejected before any
 * domain call) and L (unknown tool rejected) at the registry level —
 * the same guarantees lib/dante-core/tools/orchestrate.ts and
 * pending-actions.ts rely on before ever touching a domain service.
 */
describe("Dante tool registry", () => {
  it("returns undefined for an unregistered tool name (Test L)", () => {
    expect(getDanteTool("delete_everything")).toBeUndefined();
    expect(getDanteTool("")).toBeUndefined();
  });

  it("has no duplicate tool names", () => {
    const names = listDanteToolNames();
    expect(names.length).toBe(new Set(names).size);
    expect(names.length).toBeGreaterThan(0);
  });

  it("every registered tool declares a stable name, mode and risk, and every write tool requires confirmation", () => {
    for (const tool of DANTE_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(["read", "write"]).toContain(tool.mode);
      expect(["low", "medium", "high"]).toContain(tool.risk);

      if (tool.mode === "write") {
        expect(tool.requiresConfirmation).toBe(true);
        expect(typeof tool.summarize).toBe("function");
      }
    }
  });

  it("rejects an invalid log_food call before any domain call (Test K)", () => {
    const logFood = getDanteTool("log_food");
    expect(logFood).toBeDefined();

    const parsed = logFood!.inputSchema.safeParse({ mealType: "brunch" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown extra field on a strict schema", () => {
    const getTodayPlan = getDanteTool("get_today_plan");
    const parsed = getTodayPlan!.inputSchema.safeParse({ unexpected: true });
    expect(parsed.success).toBe(false);
  });
});
