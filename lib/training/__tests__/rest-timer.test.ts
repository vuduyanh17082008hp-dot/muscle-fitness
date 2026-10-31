import { describe, expect, it } from "vitest";

import { restRemaining } from "@/lib/training/rest-timer";

describe("restRemaining", () => {
  const start = 1_000_000;
  const endsAt = start + 90_000;

  it("counts from the end time, rounding partial seconds up", () => {
    expect(restRemaining(endsAt, start)).toBe(90);
    expect(restRemaining(endsAt, start + 400)).toBe(90);
    expect(restRemaining(endsAt, start + 1_000)).toBe(89);
  });

  it("is correct after a long background gap (no per-tick countdown to fall behind)", () => {
    expect(restRemaining(endsAt, start + 61_200)).toBe(29);
  });

  it("stops at zero once the rest is over", () => {
    expect(restRemaining(endsAt, endsAt)).toBe(0);
    expect(restRemaining(endsAt, endsAt + 300_000)).toBe(0);
  });
});
