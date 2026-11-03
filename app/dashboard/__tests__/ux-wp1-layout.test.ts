import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// UX WP1 (Hackathon audit 2026-10-25) — F-01, F-04, F-09 regression guards.
// Hitbox behaviour itself is verified in a real browser; these pin the source contracts.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (name === "__tests__" || name === "node_modules") return [];
    if (statSync(join(process.cwd(), rel)).isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

describe("F-01: plan links point at a real route", () => {
  it("/dashboard/workouts/plans has no index page, so nothing may link to it bare", () => {
    expect(existsSync(join(process.cwd(), "app/dashboard/workouts/plans/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app/dashboard/workouts/plans/new/page.tsx"))).toBe(true);
    const offenders = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("features")].filter((f) =>
      /["'`]\/dashboard\/workouts\/plans["'`?#]/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it("new-user setup step and rest-day Plan Workout open the plan builder", () => {
    expect(read("components/dashboard/new-user-dashboard.tsx")).toContain('href: "/dashboard/workouts/plans/new"');
    expect(read("components/dashboard/daily-action-hero.tsx")).toContain('href="/dashboard/workouts/plans/new"');
  });
});

describe("F-04: Dante chat stays below the dashboard header", () => {
  const chat = read("components/dante-chat.tsx");

  it("isolates its stacking context so internal z-layers cannot paint over the header", () => {
    expect(chat).toContain('"relative isolate flex w-full flex-col');
  });

  it("auto-scroll moves only the chat window, never the page", () => {
    expect(chat).not.toContain(".scrollIntoView(");
    expect(chat).toContain("el?.scrollTo({ top: el.scrollHeight");
  });

  it("full-page chat fits between the mobile header and bottom nav (F-02 composer)", () => {
    expect(chat).toContain("max-lg:h-[calc(100dvh-9.75rem-env(safe-area-inset-bottom,0px))]");
    expect(chat).toContain("lg:h-[min(82dvh,860px)]");
  });

  it("keeps the header slim: no robot, HUD canvas or terminal prompt (UX-R1.3 replaced the compact robot)", () => {
    expect(chat).not.toContain("<DanteRobot");
    expect(chat).not.toContain("BiometricFieldCanvas");
    expect(chat).not.toContain("$&gt;");
  });
});

describe("F-09: workout complete bar respects shell chrome", () => {
  it("starts right of the w-72 sidebar and leaves the floating-controls gutter free", () => {
    const player = read("features/workouts/workout-player.tsx");
    expect(read("components/dashboard/dashboard-shell.tsx")).toContain("w-72");
    expect(player).toContain("lg:bottom-0 lg:left-72 lg:pr-24");
    expect(player).not.toContain("lg:left-64");
  });
});

describe("F-09: nutrition tables scroll inside their cards at 320px", () => {
  it("the meal draft table wrapper contains its absolutely positioned sr-only header", () => {
    expect(read("components/nutrition/coach/meal-draft-card.tsx")).toContain('className="relative mt-4 overflow-x-auto"');
  });

  it("meal plan grid cards may shrink below their table's min width", () => {
    expect(read("app/dashboard/nutrition/plan/page.tsx")).toContain('className="min-w-0 rounded-[20px] border');
  });
});
