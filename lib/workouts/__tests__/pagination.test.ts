import { describe, expect, it } from "vitest";

import { hasMorePages, sliceForPage } from "@/lib/workouts/pagination";

describe("sliceForPage", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("returns the first `page * pageSize` items (Test A)", () => {
    expect(sliceForPage(items, 1, 12)).toEqual(items.slice(0, 12));
    expect(sliceForPage(items, 2, 12)).toEqual(items.slice(0, 24));
  });

  it("never returns more items than exist", () => {
    expect(sliceForPage(items, 5, 12)).toEqual(items);
  });

  it("clamps a page below 1 to page 1", () => {
    expect(sliceForPage(items, 0, 12)).toEqual(items.slice(0, 12));
    expect(sliceForPage(items, -3, 12)).toEqual(items.slice(0, 12));
  });
});

describe("hasMorePages", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("is true while more items remain (Test B)", () => {
    expect(hasMorePages(items, 1, 12)).toBe(true);
  });

  it("is false once every item has been shown", () => {
    expect(hasMorePages(items, 3, 12)).toBe(false);
  });
});
