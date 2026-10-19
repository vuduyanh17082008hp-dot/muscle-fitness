import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tool that writes "\b" through a non-raw string leaves a 0x08 byte in the source. Inside a regex literal that is a
 * literal backspace, so the pattern silently never matches (found in four files, including a vacuous test assertion).
 */
const ROOTS = ["app", "lib", "components"];
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(?:ts|tsx|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("source hygiene", () => {
  it("no source file contains a control character", () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) => CONTROL.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
