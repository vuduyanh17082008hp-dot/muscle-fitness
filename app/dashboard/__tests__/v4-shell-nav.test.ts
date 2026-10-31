import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/app/dashboard/actions", () => ({ logoutAction: async () => {} }));
vi.mock("@/components/dashboard/floating-dante", () => ({ FloatingDante: () => null }));
vi.mock("@/components/dashboard/quick-capture", () => ({ QuickCapture: () => null }));

const { DashboardShell } = await import("@/components/dashboard/dashboard-shell");

const render = (path: string, activeSessionId: string | null = null) => {
  pathname = path;
  return renderToStaticMarkup(createElement(DashboardShell, { activeSessionId, children: "content" }));
};
const tabBar = (html: string) => html.slice(html.indexOf('aria-label="Primary"'));
const current = (html: string) => [...html.matchAll(/aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

describe("V4 shell navigation", () => {
  it("has five primary tabs and keeps Train when no session is open", () => {
    const bar = tabBar(render("/dashboard"));
    const labels = [...bar.matchAll(/<span class="max-w-full truncate">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Today", "Train", "Fuel", "Recovery", "Dante"]);
    expect(bar).toContain('href="/dashboard/workouts"');
  });

  it("turns Train into Active, linking to the real session, only when the server reports one", () => {
    const bar = tabBar(render("/dashboard", "s-123"));
    expect(bar).toContain('href="/dashboard/workouts/session/s-123"');
    expect(bar).toContain(">Active<");
    expect(bar).not.toContain(">Train<");
  });

  it("marks only the most specific item: History, not Train as well", () => {
    expect(current(render("/dashboard/workouts/history"))).toEqual(["History"]); // sidebar only; History is not a tab, and Train stays unlit
    expect(current(render("/dashboard/training-intelligence"))).toEqual(["Train", "Train"]); // sidebar + tab bar
  });

  it("does not paper-theme a route that has not been converted", () => {
    expect(render("/dashboard/experiments")).not.toContain('data-theme="paper"');
  });
});
