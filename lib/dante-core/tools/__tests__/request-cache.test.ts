import { describe, expect, it, vi } from "vitest";

import { cached, createToolRequestCache } from "@/lib/dante-core/tools/request-cache";
import type { ToolContext } from "@/lib/dante-core/tools/types";

/**
 * Integration audit finding (Section 6/15, Test Q): within one Dante
 * turn, multiple tool calls across different rounds independently
 * re-ran the SAME shared loader (buildAthleteState,
 * loadTodaySession, ...). `cached()` is the fix — same key within one
 * ToolContext reuses the in-flight/resolved promise instead of
 * re-querying Supabase.
 */
describe("cached()", () => {
  it("only calls the loader once for the same key within one context", async () => {
    const loader = vi.fn(async () => ({ value: 42 }));
    const context: ToolContext = { supabase: {} as never, userId: "user-1", now: new Date(), cache: createToolRequestCache() };

    const first = await cached(context, "athleteState", loader);
    const second = await cached(context, "athleteState", loader);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent callers awaited via Promise.all, not just sequential ones", async () => {
    const loader = vi.fn(async () => ({ value: "shared" }));
    const context: ToolContext = { supabase: {} as never, userId: "user-1", now: new Date(), cache: createToolRequestCache() };

    const [a, b] = await Promise.all([cached(context, "recoveryContext", loader), cached(context, "recoveryContext", loader)]);

    expect(a).toBe(b);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not share a cache entry across different keys", async () => {
    const loaderA = vi.fn(async () => "a");
    const loaderB = vi.fn(async () => "b");
    const context: ToolContext = { supabase: {} as never, userId: "user-1", now: new Date(), cache: createToolRequestCache() };

    await cached(context, "keyA", loaderA);
    await cached(context, "keyB", loaderB);

    expect(loaderA).toHaveBeenCalledTimes(1);
    expect(loaderB).toHaveBeenCalledTimes(1);
  });

  it("falls back to calling the loader directly when no cache is present (correctness never depends on it)", async () => {
    const loader = vi.fn(async () => "value");
    const context: ToolContext = { supabase: {} as never, userId: "user-1", now: new Date() };

    await cached(context, "athleteState", loader);
    await cached(context, "athleteState", loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache across two different contexts (no cross-request leakage)", async () => {
    const loader = vi.fn(async () => "value");
    const contextA: ToolContext = { supabase: {} as never, userId: "user-1", now: new Date(), cache: createToolRequestCache() };
    const contextB: ToolContext = { supabase: {} as never, userId: "user-2", now: new Date(), cache: createToolRequestCache() };

    await cached(contextA, "athleteState", loader);
    await cached(contextB, "athleteState", loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
