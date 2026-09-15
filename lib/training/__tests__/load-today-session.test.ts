import { describe, expect, it } from "vitest";

import { loadTodaySession, localDateTimeParts, localDayRangeUtc } from "@/lib/training/load-today-session";

/**
 * Covers the "No session scheduled today" persistence bug: the reader
 * previously bucketed `scheduled_for` into a naive UTC calendar day
 * (`now.toISOString().slice(0, 10)`), which disagrees with the user's
 * LOCAL calendar day for any time zone ahead of UTC (e.g. Asia/Singapore,
 * UTC+8) during the hours after local midnight but before the UTC date
 * rolls over. These tests run against a fake but behaviorally accurate
 * Supabase client (same approach as
 * lib/dante-core/actions/__tests__/apply-action.test.ts).
 */

type FakeSessionRow = {
  user_id: string;
  id: string;
  name: string | null;
  scheduled_for: string;
  duration_minutes: number | null;
  session_state: string | null;
};

function createFakeSupabase(options: {
  timezoneByUser?: Map<string, string>;
  sessions: FakeSessionRow[];
  onProfilesQuery?: () => void;
}) {
  const timezoneByUser = options.timezoneByUser ?? new Map<string, string>();
  const sessions = options.sessions;

  return {
    from(table: string) {
      if (table === "profiles") {
        options.onProfilesQuery?.();

        return {
          select: () => ({
            eq: (_col: string, userId: string) => ({
              maybeSingle: async () => ({
                data: timezoneByUser.has(userId)
                  ? { timezone: timezoneByUser.get(userId) }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "workout_sessions") {
        return {
          select: () => ({
            eq: (_col: string, userId: string) => ({
              gte: (_col2: string, startIso: string) => ({
                lte: (_col3: string, endIso: string) => ({
                  order: () => ({
                    limit: async () => {
                      const matches = sessions
                        .filter(
                          (row) =>
                            row.user_id === userId &&
                            row.scheduled_for >= startIso &&
                            row.scheduled_for <= endIso,
                        )
                        .sort((a, b) => (a.scheduled_for < b.scheduled_for ? -1 : 1));

                      return { data: matches.slice(0, 1), error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "workout_session_exercises") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    },
  };
}

const USER_A = "user-aaaa";
const USER_B = "user-bbbb";

describe("localDayRangeUtc", () => {
  it("shifts the local calendar day forward for a timezone ahead of UTC (Test F)", () => {
    // UTC 2026-09-13T20:00:00Z is already 2026-09-14T04:00 in Singapore (UTC+8).
    const now = new Date("2026-09-13T20:00:00.000Z");
    const { startIso, endIso } = localDayRangeUtc(now, "Asia/Singapore");

    expect(startIso).toBe("2026-09-13T16:00:00.000Z");
    expect(endIso).toBe("2026-09-14T15:59:59.999Z");
  });

  it("falls back to a plain UTC day when the timezone is UTC", () => {
    const now = new Date("2026-09-13T05:00:00.000Z");
    const { startIso, endIso } = localDayRangeUtc(now, "UTC");

    expect(startIso).toBe("2026-09-13T00:00:00.000Z");
    expect(endIso).toBe("2026-09-13T23:59:59.999Z");
  });
});

describe("loadTodaySession", () => {
  it("returns a session persisted for local-today (Test B)", async () => {
    const now = new Date("2026-09-13T05:00:00.000Z");

    const supabase = createFakeSupabase({
      timezoneByUser: new Map([[USER_A, "UTC"]]),
      sessions: [
        {
          user_id: USER_A,
          id: "session-today",
          name: "Push Day",
          scheduled_for: "2026-09-13T09:00:00.000Z",
          duration_minutes: 60,
          session_state: "not_started",
        },
      ],
    });

    const result = await loadTodaySession(supabase as never, USER_A, now);

    expect(result?.id).toBe("session-today");
  });

  it("never returns another user's session, even if scheduled for the same instant (Test D)", async () => {
    const now = new Date("2026-09-13T05:00:00.000Z");

    const supabase = createFakeSupabase({
      timezoneByUser: new Map([[USER_A, "UTC"]]),
      sessions: [
        {
          user_id: USER_B,
          id: "someone-elses-session",
          name: "Leg Day",
          scheduled_for: "2026-09-13T09:00:00.000Z",
          duration_minutes: 60,
          session_state: "not_started",
        },
      ],
    });

    const result = await loadTodaySession(supabase as never, USER_A, now);

    expect(result).toBeNull();
  });

  it("does not treat yesterday's or tomorrow's session as today's (Test E)", async () => {
    const now = new Date("2026-09-13T05:00:00.000Z");

    const supabase = createFakeSupabase({
      timezoneByUser: new Map([[USER_A, "UTC"]]),
      sessions: [
        {
          user_id: USER_A,
          id: "yesterday-session",
          name: "Yesterday",
          scheduled_for: "2026-09-12T09:00:00.000Z",
          duration_minutes: 60,
          session_state: "not_started",
        },
        {
          user_id: USER_A,
          id: "tomorrow-session",
          name: "Tomorrow",
          scheduled_for: "2026-09-14T09:00:00.000Z",
          duration_minutes: 60,
          session_state: "not_started",
        },
      ],
    });

    const result = await loadTodaySession(supabase as never, USER_A, now);

    expect(result).toBeNull();
  });

  it("finds a session scheduled just after local midnight, before the UTC date rolls over (Test F)", async () => {
    // Real-world regression: a Singapore (UTC+8) user starts a workout at
    // 2026-09-14 01:00 local time. In UTC that instant is still
    // 2026-09-13T17:00:00Z — the previous UTC calendar day. The naive
    // UTC-slice reader, queried later the same local day (still UTC
    // 2026-09-13 for the first few hours), would miss it entirely once the
    // server's `now` window and the session's actual stored instant landed
    // on different UTC dates.
    const sessionScheduledFor = "2026-09-13T17:00:00.000Z"; // 2026-09-14 01:00 SGT
    const laterSameLocalDay = new Date("2026-09-13T20:00:00.000Z"); // 2026-09-14 04:00 SGT

    const supabase = createFakeSupabase({
      timezoneByUser: new Map([[USER_A, "Asia/Singapore"]]),
      sessions: [
        {
          user_id: USER_A,
          id: "post-midnight-session",
          name: "Early Push",
          scheduled_for: sessionScheduledFor,
          duration_minutes: 45,
          session_state: "in_progress",
        },
      ],
    });

    const result = await loadTodaySession(supabase as never, USER_A, laterSameLocalDay);

    expect(result?.id).toBe("post-midnight-session");
  });

  it("defaults to UTC when the profile row or timezone is missing", async () => {
    const now = new Date("2026-09-13T05:00:00.000Z");

    const supabase = createFakeSupabase({
      timezoneByUser: new Map(),
      sessions: [
        {
          user_id: USER_A,
          id: "session-today",
          name: "Push Day",
          scheduled_for: "2026-09-13T09:00:00.000Z",
          duration_minutes: 60,
          session_state: "not_started",
        },
      ],
    });

    const result = await loadTodaySession(supabase as never, USER_A, now);

    expect(result?.id).toBe("session-today");
  });

  it("does not re-fetch profiles.timezone when the caller already knows it (Test H)", async () => {
    const now = new Date("2026-09-13T20:00:00.000Z"); // 2026-09-14 04:00 SGT
    let profilesQueries = 0;

    const supabase = createFakeSupabase({
      sessions: [
        {
          user_id: USER_A,
          id: "session-today",
          name: "Push Day",
          scheduled_for: "2026-09-13T17:00:00.000Z", // 2026-09-14 01:00 SGT
          duration_minutes: 60,
          session_state: "not_started",
        },
      ],
      onProfilesQuery: () => {
        profilesQueries += 1;
      },
    });

    const result = await loadTodaySession(supabase as never, USER_A, now, "Asia/Singapore");

    expect(result?.id).toBe("session-today");
    expect(profilesQueries).toBe(0);
  });
});

describe("localDateTimeParts", () => {
  it("agrees with localDayRangeUtc on which calendar day is 'today' (Test D)", () => {
    // 2026-09-13T20:00:00Z is 2026-09-14T04:00 in Singapore (UTC+8) — the
    // same instant used by the localDayRangeUtc test above.
    const now = new Date("2026-09-13T20:00:00.000Z");

    const { localDate, localTime } = localDateTimeParts(now, "Asia/Singapore");
    const { startIso } = localDayRangeUtc(now, "Asia/Singapore");

    expect(localDate).toBe("2026-09-14");
    expect(localTime).toBe("04:00");
    // The local day's UTC start boundary must fall on the same local date.
    expect(new Date(startIso).getTime()).toBeLessThanOrEqual(now.getTime());
  });
});


it.each([
  ["2026-03-08T17:00:00Z", "2026-03-08T05:00:00.000Z", "2026-03-09T03:59:59.999Z"],
  ["2026-11-01T17:00:00Z", "2026-11-01T04:00:00.000Z", "2026-11-02T04:59:59.999Z"],
])("uses both midnight offsets on DST transition %s", (now, startIso, endIso) => {
  expect(localDayRangeUtc(new Date(now), "America/New_York")).toEqual({ startIso, endIso });
});
