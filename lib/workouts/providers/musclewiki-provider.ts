import type { ExerciseProvider, ExerciseRecord } from "@/lib/workouts/providers/types";

/**
 * Optional future provider — spec §3/§24: only ever calls a real,
 * authorized MuscleWiki API, server-side only, key never exposed to
 * the browser. No such key exists or is expected to exist in this
 * environment; this is a real, typed, documented stub, NOT a scraper
 * and NOT a simulated/fake integration. `search()`/`getById()` are
 * only ever called after `isAvailable()` is checked — they return
 * empty/null rather than throwing so a caller that forgets the check
 * degrades gracefully instead of crashing.
 */
export class MuscleWikiProvider implements ExerciseProvider {
  readonly id = "musclewiki";

  isAvailable(): boolean {
    return Boolean(process.env.MUSCLEWIKI_API_KEY);
  }

  async search(query?: string): Promise<ExerciseRecord[]> {
    void query;
    return [];
  }

  async getById(id: string): Promise<ExerciseRecord | null> {
    void id;
    return null;
  }
}
