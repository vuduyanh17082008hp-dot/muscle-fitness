import { describe, expect, it } from "vitest";

import { levenshtein, resolveMuscleQuery } from "@/lib/training/muscle-search";

describe("resolveMuscleQuery", () => {
  it("resolves canonical/English aliases exactly (Test A)", () => {
    expect(resolveMuscleQuery("traps").exact).toBe("trapezius");
    expect(resolveMuscleQuery("upper trap").exact).toBe("trapezius");
    expect(resolveMuscleQuery("side delt").exact).toBe("lateral_deltoid");
    expect(resolveMuscleQuery("lats").exact).toBe("latissimus_dorsi");
  });

  it("resolves the Atlas spec's own Vietnamese examples exactly (Test B)", () => {
    expect(resolveMuscleQuery("cầu vai").exact).toBe("trapezius");
    expect(resolveMuscleQuery("cơ thang").exact).toBe("trapezius");
    expect(resolveMuscleQuery("vai giữa").exact).toBe("lateral_deltoid");
    expect(resolveMuscleQuery("xô").exact).toBe("latissimus_dorsi");
  });

  it("is case- and whitespace-insensitive (Test C)", () => {
    expect(resolveMuscleQuery("  TRAPS  ").exact).toBe("trapezius");
    expect(resolveMuscleQuery("Cầu Vai").exact).toBe("trapezius");
  });

  it("never guesses on unknown input — returns null exact with suggestions, not a fabricated match (Test D)", () => {
    const result = resolveMuscleQuery("qwertyzzz9999");
    expect(result.exact).toBeNull();
    expect(result.suggestions).toEqual([]);
  });

  it("returns an empty resolution for empty/whitespace-only input (Test E)", () => {
    expect(resolveMuscleQuery("")).toEqual({ exact: null, suggestions: [] });
    expect(resolveMuscleQuery("   ")).toEqual({ exact: null, suggestions: [] });
  });

  it("offers a close-typo suggestion instead of an exact guess (Test F)", () => {
    const result = resolveMuscleQuery("trapezuis"); // transposed letters
    expect(result.exact).toBeNull();
    expect(result.suggestions).toContain("trapezius");
  });

  it("suggestions never include the exact match itself when one exists", () => {
    const result = resolveMuscleQuery("traps");
    expect(result.suggestions).toEqual([]);
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("trapezius", "trapezius")).toBe(0);
  });

  it("counts a single substitution as distance 1", () => {
    expect(levenshtein("lats", "lits")).toBe(1);
  });

  it("handles empty strings as the length of the other string", () => {
    expect(levenshtein("", "traps")).toBe(5);
    expect(levenshtein("traps", "")).toBe(5);
  });
});
