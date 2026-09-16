import { describe, expect, it } from "vitest";

import { sanitizeHrvMs, sanitizeRestingHeartRateBpm } from "@/lib/wearables/sanitize";

describe("wearable signal sanitization", () => {
  it("treats HRV null and non-finite values as missing", () => {
    expect(sanitizeHrvMs(null)).toBeNull();
    expect(sanitizeHrvMs(undefined)).toBeNull();
    expect(sanitizeHrvMs(Number.NaN)).toBeNull();
    expect(sanitizeHrvMs(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("treats HRV = 0 and negative / absurd readings as missing, not zero-baseline fuel", () => {
    expect(sanitizeHrvMs(0)).toBeNull();
    expect(sanitizeHrvMs(-5)).toBeNull();
    expect(sanitizeHrvMs(500)).toBeNull();
    expect(sanitizeHrvMs(62)).toBe(62);
  });

  it("rejects resting HR outside a physiologically plausible consumer-wearable band", () => {
    expect(sanitizeRestingHeartRateBpm(0)).toBeNull();
    expect(sanitizeRestingHeartRateBpm(10)).toBeNull();
    expect(sanitizeRestingHeartRateBpm(240)).toBeNull();
    expect(sanitizeRestingHeartRateBpm(58)).toBe(58);
  });
});
