import { describe, expect, it } from "vitest";
import { matchComponentTemplate } from "@/lib/hawkerlens/component-matching";
import { DISH_TEMPLATES } from "@/lib/hawkerlens/dishes";

describe("matchComponentTemplate", () => {
  it("matches a short generic name to the right chicken_rice component", () => {
    const templates = DISH_TEMPLATES.chicken_rice.components;

    expect(matchComponentTemplate("chicken", templates)?.name).toBe(
      "Poached chicken with skin",
    );
    expect(matchComponentTemplate("rice", templates)?.name).toBe(
      "Hainanese-style oily rice",
    );
    expect(matchComponentTemplate("chili sauce", templates)?.name).toBe("Chili sauce");
    expect(matchComponentTemplate("cucumber", templates)?.name).toBe("Cucumber garnish");
  });

  it("returns null when nothing overlaps", () => {
    const templates = DISH_TEMPLATES.chicken_rice.components;
    expect(matchComponentTemplate("spaghetti bolognese", templates)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(matchComponentTemplate("", DISH_TEMPLATES.laksa.components)).toBeNull();
  });

  it("picks the best of multiple plausible matches by token overlap", () => {
    const templates = DISH_TEMPLATES.nasi_lemak.components;
    expect(matchComponentTemplate("fried egg", templates)?.name).toBe("Fried egg");
    expect(matchComponentTemplate("fried anchovies and peanuts", templates)?.name).toBe(
      "Fried anchovies & peanuts",
    );
  });
});
