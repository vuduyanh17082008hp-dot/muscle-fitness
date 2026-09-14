import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the hydration mismatch that broke
 * /dashboard/training-intelligence (TrainingIntelligencePage ->
 * MuscleMapClient -> MuscleDetailPanel).
 *
 * Root cause: lib/useIsDesktop.ts used a `useState(() => ...)` lazy
 * initializer that read `window.matchMedia(...)` directly. That
 * returns `false` on the server (no `window`) but the REAL viewport
 * result on the client's first/hydration render (the same tick
 * `window` becomes available) — a structural markup mismatch for any
 * caller that branches JSX on the value, as MuscleDetailPanel's
 * desktop-vs-BottomSheet branch does.
 *
 * There is no React component-rendering test infrastructure in this
 * repo (vitest.config.ts runs `environment: "node"`, and neither
 * jsdom/happy-dom nor @testing-library/react is installed) — adding
 * one is a testing-infra decision beyond the scope of this fix. This
 * is therefore a static-source guard rather than a rendered-hydration
 * simulation: it scans the render path's own source for the exact
 * bug shape (a useState/useRef lazy initializer touching a
 * browser-only global) rather than proving the DOM matches at
 * runtime. It would have failed against the pre-fix
 * lib/useIsDesktop.ts, and will fail again if the pattern returns
 * anywhere in this file list.
 */

const MUSCLE_INTELLIGENCE_RENDER_PATH = [
  "lib/useIsDesktop.ts",
  "components/training/muscle-map/MuscleDetailPanel.tsx",
  "components/training/muscle-map/MuscleMapClient.tsx",
  "components/training/muscle-map/ExercisePicker.tsx",
  "components/training/muscle-map/ExerciseEmphasisPanel.tsx",
  "components/training/muscle-map/MuscleSearchBar.tsx",
  "app/dashboard/training-intelligence/page.tsx",
];

const BROWSER_ONLY_GLOBAL = /\b(window|document|navigator|localStorage|sessionStorage)\b/;

/** How far past `useState(() =>` / `useRef(() =>` to look for a browser global — generous enough for a real initializer expression, tight enough not to spill into unrelated later code. */
const INITIALIZER_SCAN_WINDOW = 150;

describe("Muscle Intelligence hydration safety", () => {
  it.each(MUSCLE_INTELLIGENCE_RENDER_PATH)(
    "%s has no useState/useRef lazy initializer reading a browser-only global",
    (relativePath) => {
      const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
      const initializerCalls = source.matchAll(/use(?:State|Ref)\(\s*\(\)\s*=>/g);

      for (const match of initializerCalls) {
        const start = (match.index ?? 0) + match[0].length;
        const initializerBody = source.slice(start, start + INITIALIZER_SCAN_WINDOW);

        expect(
          BROWSER_ONLY_GLOBAL.test(initializerBody),
          `${relativePath}: a useState/useRef lazy initializer appears to read a browser-only global near "${initializerBody.slice(0, 60).trim()}…". ` +
            "This returns a different value during SSR than during the client's hydration render and will break hydration — " +
            "read it inside useEffect, or subscribe via useSyncExternalStore's getSnapshot/getServerSnapshot, instead.",
        ).toBe(false);
      }
    },
  );

  it("useIsDesktop reads the viewport via useSyncExternalStore, not a window-reading useState initializer", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/useIsDesktop.ts"), "utf8");

    expect(source).toMatch(/useSyncExternalStore/);
    expect(source).toMatch(/getServerSnapshot/);
  });
});
