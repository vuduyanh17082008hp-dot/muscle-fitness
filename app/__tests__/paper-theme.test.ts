import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isPaperRoute } from "@/lib/paper-theme";

const css = readFileSync(join(process.cwd(), "app/paper-theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const GATE = ':root:has([data-theme="paper"])';

const tokens = new Map<string, string>();
for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!tokens.has(name)) tokens.set(name, value.trim());

function hex(name: string): string {
  let value = tokens.get(name);
  for (let i = 0; value?.startsWith("var("); i++) value = tokens.get(value.slice(4, -1));
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour: ${value}`);
  return value;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["--paper", "--paper-2", "--paper-white"];

describe("Iron & Paper theme", () => {
  it("gates every rule behind the paper marker, so routes without it keep the dark system", () => {
    const selectors = [...css.matchAll(/([^{};]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) expect(selector, selector).toContain(GATE);
  });

  it.each(["--iron", "--iron-2", "--iron-muted", "--dante-ink", "--rust", "--danger-ink", "--success-ink", "--info-ink"])(
    "%s text clears 4.5:1 on every paper surface",
    (ink) => {
      for (const surface of SURFACES) expect(contrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("keeps iron legible on the lime action fill and Dante ink on its lavender card", () => {
    expect(contrast("--iron", "--lime")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("--iron", "--lime-hover")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("--dante-ink", "--dante-fill")).toBeGreaterThanOrEqual(4.5);
  });

  it("gives form-control and warning-fill boundaries at least 3:1", () => {
    for (const surface of SURFACES) {
      expect(contrast("--paper-input-border", surface), surface).toBeGreaterThanOrEqual(3);
      expect(contrast("--rust-fill", surface), surface).toBeGreaterThanOrEqual(3);
      expect(contrast("--iron", surface), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it("maps every dark-theme text shade of the neutral and sunset scales to readable paper ink", () => {
    for (const scale of ["slate", "gray", "zinc", "neutral", "stone", "amber", "orange"]) {
      for (const shade of [50, 100, 200, 300, 400]) {
        for (const surface of SURFACES) {
          expect(contrast(`--color-${scale}-${shade}`, surface), `${scale}-${shade} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    for (const scale of ["slate", "gray", "zinc", "neutral", "stone"]) {
      expect(contrast(`--color-${scale}-500`, "--paper-2")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(`--color-${scale}-600`, "--paper-2")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("turns text-white into iron ink and never leaves lime as a text colour", () => {
    expect(tokens.get("--color-white")).toBe("var(--iron)");
    expect(css).toMatch(/\.text-mf-glass-brand,[\s\S]*?\{\s*color: var\(--iron\);/);
  });
});

describe("isPaperRoute", () => {
  const routes = ["/dashboard", "/dashboard/recovery/*"];

  it("matches exact entries only exactly", () => {
    expect(isPaperRoute("/dashboard", routes)).toBe(true);
    expect(isPaperRoute("/dashboard/nutrition", routes)).toBe(false);
  });

  it("matches a subtree entry and its children, not lookalike siblings", () => {
    expect(isPaperRoute("/dashboard/recovery", routes)).toBe(true);
    expect(isPaperRoute("/dashboard/recovery/history", routes)).toBe(true);
    expect(isPaperRoute("/dashboard/recovery-old", routes)).toBe(false);
  });
});
