import { afterEach, describe, expect, it, vi } from "vitest";

import { completeCheckinTool } from "@/lib/dante-core/tools/write/complete-checkin";
import type { ToolContext } from "@/lib/dante-core/tools/types";

afterEach(() => vi.useRealTimers());

describe("complete_checkin tool", () => {
  it("upserts against the user's local calendar date across UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T17:00:00Z"));

    let upsertedDate: string | null = null;

    const supabase = {
      from(table: string) {
        if (table !== "recovery_checkins") throw new Error(`unexpected ${table}`);
        return {
          select() {
            return {
              eq() {
                return {
                  gte() {
                    return {
                      lt() {
                        return {
                          order() {
                            return {
                              limit: async () => ({ data: [], error: null }),
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          upsert(row: { checkin_date: string }) {
            upsertedDate = row.checkin_date;
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    const context: ToolContext = {
      supabase: supabase as never,
      userId: "user-1",
      now: new Date(),
      timezone: "Asia/Singapore",
    };

    const result = await completeCheckinTool.execute(context, {
      sleepHours: 8,
      sleepQuality: 8,
      stress: 3,
      fatigue: 3,
      soreness: 3,
      mood: 8,
      readiness: 8,
      painIllness: "no",
      notes: null,
    });

    expect(result.ok).toBe(true);
    expect(upsertedDate).toBe("2026-09-15");
  });
});
