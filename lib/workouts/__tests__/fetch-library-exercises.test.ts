import { describe, expect, it, vi } from "vitest";

import {
  EXERCISES_ENDPOINT,
  fetchLibraryExercises,
} from "@/lib/workouts/fetch-library-exercises";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("fetchLibraryExercises (WF-02)", () => {
  it("requests canonical /api/exercises and maps rows", async () => {
    const f = vi.fn(() =>
      json({
        exercises: [
          { id: "1", name: "Bench Press", slug: "bench", muscle_group: "Chest", equipment: "Barbell", difficulty: "advanced" },
          { id: "2", name: "  " },
        ],
      }),
    );

    const out = await fetchLibraryExercises(f as unknown as typeof fetch);

    expect(EXERCISES_ENDPOINT).toBe("/api/exercises");
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith("/api/exercises");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Bench Press", primaryMuscle: "Chest", difficulty: "advanced", secondaryMuscles: [] });
  });

  it("throws (no silent empty list) on HTTP failure", async () => {
    const f = vi.fn(() => json({ error: "x" }, 500));
    await expect(fetchLibraryExercises(f as unknown as typeof fetch)).rejects.toThrow(/500/);
  });

  it("throws on malformed payload", async () => {
    const f = vi.fn(() => json({}));
    await expect(fetchLibraryExercises(f as unknown as typeof fetch)).rejects.toThrow(/malformed/);
  });
});
