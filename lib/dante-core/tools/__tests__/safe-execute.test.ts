import { describe, expect, it, vi } from "vitest";

import { safeExecuteTool } from "@/lib/dante-core/tools/safe-execute";
import type { AnyDanteTool, ToolContext } from "@/lib/dante-core/tools/types";

/**
 * Integration audit finding (Section 13/19, Test M extended): a tool
 * is expected to return `{ ok: false, error }` for a handled failure,
 * but a shared loader it depends on (Supabase error, a rejected
 * cached promise from request-cache.ts) can still throw. Before this
 * fix, that throw propagated out of the tool loop / confirm flow
 * uncaught instead of degrading gracefully — this is exactly the kind
 * of subsystem failure that must not crash the whole Dante turn.
 */
describe("safeExecuteTool", () => {
  const context: ToolContext = { supabase: {} as never, userId: "user-1", now: new Date() };

  it("returns the tool's own ok:false result unchanged", async () => {
    const tool = {
      name: "fake",
      execute: vi.fn(async () => ({ ok: false as const, error: "handled failure" })),
    } as unknown as AnyDanteTool;

    const result = await safeExecuteTool(tool, context, {});

    expect(result).toEqual({ ok: false, error: "handled failure" });
  });

  it("returns the tool's own ok:true result unchanged", async () => {
    const tool = {
      name: "fake",
      execute: vi.fn(async () => ({ ok: true as const, data: { value: 1 } })),
    } as unknown as AnyDanteTool;

    const result = await safeExecuteTool(tool, context, {});

    expect(result).toEqual({ ok: true, data: { value: 1 } });
  });

  it("converts a thrown error into a graceful ok:false result instead of propagating", async () => {
    const tool = {
      name: "fake",
      execute: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as AnyDanteTool;

    const result = await safeExecuteTool(tool, context, {});

    expect(result).toEqual({ ok: false, error: "database unavailable" });
  });

  it("handles a non-Error throw without crashing", async () => {
    const tool = {
      name: "fake",
      execute: vi.fn(async () => {
        throw "a plain string rejection";
      }),
    } as unknown as AnyDanteTool;

    const result = await safeExecuteTool(tool, context, {});

    expect(result.ok).toBe(false);
  });
});
