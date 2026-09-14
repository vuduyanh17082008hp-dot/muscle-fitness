import { afterEach, describe, expect, it, vi } from "vitest";

import { MuscleWikiProvider } from "@/lib/workouts/providers/musclewiki-provider";

describe("MuscleWikiProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports unavailable when no API key is configured (Test A)", () => {
    vi.stubEnv("MUSCLEWIKI_API_KEY", "");
    expect(new MuscleWikiProvider().isAvailable()).toBe(false);
  });

  it("reports available when a real key is configured", () => {
    vi.stubEnv("MUSCLEWIKI_API_KEY", "test-key-123");
    expect(new MuscleWikiProvider().isAvailable()).toBe(true);
  });

  it("search() never throws and returns an empty list even without a key (Test B)", async () => {
    vi.stubEnv("MUSCLEWIKI_API_KEY", "");
    await expect(new MuscleWikiProvider().search("bench")).resolves.toEqual([]);
  });

  it("getById() never throws and returns null even without a key", async () => {
    vi.stubEnv("MUSCLEWIKI_API_KEY", "");
    await expect(new MuscleWikiProvider().getById("anything")).resolves.toBeNull();
  });
});
