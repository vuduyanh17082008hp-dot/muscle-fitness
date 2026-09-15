import { describe, expect, it } from "vitest";
import { getSafeNext } from "../safe-next";

describe("getSafeNext", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)"])("rejects external redirect %j", (next) => {
    expect(getSafeNext(next)).toBe("/dashboard");
  });

  it.each(["/onboarding?edit=1", "/training", "/dashboard/workouts?day=2#session"])("preserves authenticated destination %s", (next) => {
    expect(getSafeNext(next)).toBe(next);
  });
});
