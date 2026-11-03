import { describe, expect, it } from "vitest";
import { formatSessionClock, formatSessionDateTime } from "../session-time";

// The 2026-10-28 audit session: started 09:14 UTC.
const STARTED = "2026-10-28T09:14:31.631208+00:00";

describe("session time formatting follows the athlete time zone", () => {
  it.each([
    ["Asia/Singapore", "05:14 pm", "28 oct 2026, 05:14 pm"],
    ["Asia/Ho_Chi_Minh", "04:14 pm", "28 oct 2026, 04:14 pm"],
    ["America/Los_Angeles", "02:14 am", "28 oct 2026, 02:14 am"],
  ])("%s", (tz, clock, full) => {
    expect(formatSessionClock(STARTED, tz)?.toLowerCase()).toBe(clock);
    expect(formatSessionDateTime(STARTED, tz).toLowerCase()).toBe(full);
  });

  it("player clock and completed page agree for the same timestamp and zone", () => {
    for (const tz of ["Asia/Singapore", "Asia/Ho_Chi_Minh", "America/Los_Angeles"]) {
      expect(formatSessionDateTime(STARTED, tz)).toContain(formatSessionClock(STARTED, tz)!);
    }
  });

  it("crosses the date line in Los Angeles", () => {
    expect(formatSessionDateTime("2026-10-28T02:00:00Z", "America/Los_Angeles")).toMatch(/^27 Oct 2026/);
  });

  it("keeps the missing and invalid cases", () => {
    expect(formatSessionDateTime(null, "Asia/Singapore")).toBe("Not recorded");
    expect(formatSessionDateTime("nope", "Asia/Singapore")).toBe("Invalid date");
    expect(formatSessionClock(null, "Asia/Singapore")).toBeNull();
  });
});
