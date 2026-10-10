import { describe, expect, it } from "vitest";

import { loadCalendarRange } from "@/lib/daily-plan/load-calendar-range";

type Session = {
  id: string;
  user_id: string;
  name: string;
  scheduled_for: string;
  duration_minutes: number;
  session_state: string;
};

function fakeSupabase(timezone: string | null, sessions: Session[] = []) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: timezone ? { timezone } : null, error: null }),
            }),
          }),
        };
      }

      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return query;
        },
        not: () => query,
        gte: (column: string, value: string) => {
          filters[`gte:${column}`] = value;
          return query;
        },
        lte: (column: string, value: string) => {
          filters[`lte:${column}`] = value;
          return query;
        },
        order: () => query,
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          const data =
            table === "workout_sessions"
              ? sessions.filter(
                  (row) =>
                    row.user_id === filters.user_id &&
                    row.scheduled_for >= filters["gte:scheduled_for"] &&
                    row.scheduled_for <= filters["lte:scheduled_for"],
                )
              : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

describe("loadCalendarRange", () => {
  it("uses the profile-local date and maps workout instants to that local day", async () => {
    const now = new Date("2026-10-06T16:30:00.000Z");
    const client = fakeSupabase("Asia/Singapore", [{
      id: "session-1",
      user_id: "user-1",
      name: "Push",
      scheduled_for: "2026-10-06T17:00:00.000Z",
      duration_minutes: 45,
      session_state: "not_started",
    }]);

    const days = await loadCalendarRange(client as never, "user-1", now);

    expect(days.find((day) => day.isToday)?.date).toBe("2026-10-07");
    expect(days.find((day) => day.date === "2026-10-07")?.actions).toHaveLength(1);
  });

  it("uses UTC when the profile timezone is absent", async () => {
    const days = await loadCalendarRange(
      fakeSupabase(null) as never,
      "user-1",
      new Date("2026-10-06T16:30:00.000Z"),
    );

    expect(days).toEqual([{ date: "2026-10-06", isToday: true, actions: [] }]);
  });

  it("queries correct UTC bounds across a local month boundary", async () => {
    const client = fakeSupabase("Asia/Singapore", [{
      id: "session-1",
      user_id: "user-1",
      name: "Month boundary",
      scheduled_for: "2026-09-30T16:30:00.000Z",
      duration_minutes: 45,
      session_state: "not_started",
    }]);

    const days = await loadCalendarRange(
      client as never,
      "user-1",
      new Date("2026-09-30T16:30:00.000Z"),
      { daysBefore: 0, daysAfter: 1 },
    );

    expect(days.find((day) => day.date === "2026-10-01")?.actions).toHaveLength(1);
  });
});
