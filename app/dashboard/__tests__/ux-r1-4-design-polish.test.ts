import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * UX-R1.4: semantic role tokens and one CTA treatment, exactly one active section tab, honest undefined servings,
 * workout drafts kept across an exercise replacement, hold-aware framing of the recovery adjustment, no canned
 * "Dante AI" agent on Today, and a Settings page whose every row is a working destination.
 */

let pathname = "/dashboard/nutrition";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SectionTabs } from "@/components/dashboard/section-tabs";
import { TRAIN_TABS } from "@/components/dashboard/train-tabs";
import { RecoveryAdjustmentPanel } from "@/components/recovery/recovery-adjustment-panel";
import { NUTRITION_TABS } from "@/app/dashboard/nutrition/tabs";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
const activeTabs = (tabs: typeof TRAIN_TABS, at: string) => {
  pathname = at;
  return [...renderToStaticMarkup(createElement(SectionTabs, { tabs })).matchAll(/aria-current="page"[^>]*>([^<]+)</g)].map((m) => m[1]);
};

describe("design system", () => {
  const css = read("app/globals.css");

  it("defines semantic role tokens and exposes them as utilities", () => {
    for (const role of ["action", "action-ink", "training", "assistant", "status-success", "status-warning", "status-danger", "status-info", "focus"]) {
      expect(css).toContain(`--mf-${role}:`);
      expect(css).toContain(`--color-mf-${role}: var(--mf-${role});`);
    }
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--mf-focus\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("the primary button is the flat action treatment, with 44px default height", () => {
    const button = read("components/ui/button.tsx");
    expect(button).toMatch(/primary: \[\s*"bg-mf-action",\s*"text-mf-action-ink",/);
    expect(button).not.toMatch(/shadow-amber-500/);
    expect(button).toMatch(/default: \[\s*"h-11",/);
  });
});

describe("section tabs: exactly one active", () => {
  it("Nutrition opens on Today without a hash, and the plan route marks its own tab", () => {
    expect(activeTabs(NUTRITION_TABS, "/dashboard/nutrition")).toEqual(["Today"]);
    expect(activeTabs(NUTRITION_TABS, "/dashboard/nutrition/plan")).toEqual(["Plan &amp; targets"]);
  });

  it("a nested route marks the most specific tab only", () => {
    expect(activeTabs(TRAIN_TABS, "/dashboard/workouts/history")).toEqual(["History"]);
    expect(activeTabs(TRAIN_TABS, "/dashboard/workouts")).toEqual(["Today"]);
  });
});

describe("core-screen fixes", () => {
  it("an undefined serving size shows no '0 g' totals", () => {
    const sheet = read("components/nutrition/food-quantity-confirm.tsx");
    expect(sheet).toContain('const servingUndefined = unit === "servings" && selectedServingGrams <= 0');
    expect(sheet).toContain("No serving size yet.");
  });

  it("replacing an exercise carries unlogged typing across the player remount", () => {
    const player = read("features/workouts/workout-player.tsx");
    expect(player).toContain("writeDraftCarry(sessionId, {");
    expect(player).toContain("const carry = takeDraftCarry(sessionId);");
    expect(read("app/dashboard/workouts/session/[sessionId]/page.tsx")).toContain('key={exerciseIds.join(",")}');
  });

  it("the recovery trend axis is no longer pushed off-canvas", () => {
    expect(read("components/recovery/recovery-trends-chart.tsx")).not.toContain("left: -20");
  });

  it("Today's muscle card has no canned Dante agent, and Progress no glow layers", () => {
    expect(read("components/dashboard/glass/muscle-intelligence-card.tsx")).not.toContain("DanteAgentInteractive");
    expect(read("components/progress/progress-chrome.tsx")).not.toMatch(/pj-orb|pj-particles|pj-spotlight|pj-cursor-ring/);
  });
});

describe("recovery adjustment under a training hold", () => {
  const props = {
    recoveryState: { digest: { dataCompleteness: "COMPLETE", readiness: "LOW" } },
    proposal: {
      proposalId: "p1",
      changes: [{ changeId: "c1", exerciseName: "Bench", action: "REDUCE_SETS", reasonDisplay: "Recovery is a priority today — trim a set and keep the session.", before: null, after: null }],
    },
    hasCheckin: true,
    localDate: "2026-10-28",
  } as unknown as Parameters<typeof RecoveryAdjustmentPanel>[0];

  it("is framed as an optional lighter plan, never 'keep the session'", () => {
    const held = text(renderToStaticMarkup(createElement(RecoveryAdjustmentPanel, { ...props, hold: "recovery" })));
    expect(held).toMatch(/Lighter plan to review/);
    expect(held).toMatch(/Training is still on hold today/);
    expect(held).toMatch(/Review lighter plan/);
    expect(held).not.toMatch(/keep the session|Adjust Today/);
  });

  it("without a hold the engine's own reason and action stay", () => {
    const normal = text(renderToStaticMarkup(createElement(RecoveryAdjustmentPanel, props)));
    expect(normal).toMatch(/trim a set and keep the session/);
    expect(normal).toMatch(/Adjust Today.s Plan/);
  });
});

describe("Settings is a real destination", () => {
  const page = read("app/dashboard/[section]/page.tsx");

  it("every row points at an existing route or action, with sign-out as a real POST", () => {
    for (const href of ["/account/edit", "/account", "/onboarding?edit=1", "/dashboard/nutrition/plan", "/privacy", "/terms", "/responsible-ai"]) {
      expect(page).toContain(`href="${href}"`);
    }
    expect(page).toContain('<form action="/auth/signout" method="post">');
    // Signed-in users are redirected away from /forgot-password, so it is not offered as a setting.
    expect(page).not.toContain('href="/forgot-password"');
  });
});
