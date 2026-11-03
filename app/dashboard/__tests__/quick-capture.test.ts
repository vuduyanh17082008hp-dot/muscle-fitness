import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("PF-02: Quick Capture & Floating Controls Architecture", () => {
  const quickCaptureFile = readFileSync(
    join(process.cwd(), "components/dashboard/quick-capture.tsx"),
    "utf-8"
  );
  const shellFile = readFileSync(
    join(process.cwd(), "components/dashboard/dashboard-shell.tsx"),
    "utf-8"
  );
  const floatingDanteFile = readFileSync(
    join(process.cwd(), "components/dashboard/floating-dante.tsx"),
    "utf-8"
  );
  const dashboardPageFile = readFileSync(
    join(process.cwd(), "app/dashboard/page.tsx"),
    "utf-8"
  );

  it("uses BottomSheet primitive with Radix Dialog accessibility contracts", () => {
    expect(quickCaptureFile).toContain("from \"@/components/ui/bottom-sheet\"");
    expect(quickCaptureFile).toContain("<BottomSheet");
    expect(quickCaptureFile).toContain("title=\"Quick Capture\"");
    expect(quickCaptureFile).toContain("aria-label=\"Quick capture\"");
  });

  it("exposes all 4 canonical quick capture destinations", () => {
    expect(quickCaptureFile).toContain("/dashboard/nutrition");
    expect(quickCaptureFile).toContain("/dashboard/workouts");
    expect(quickCaptureFile).toContain("/dashboard/recovery");
    expect(quickCaptureFile).toContain("/dashboard/progress");
  });

  it("has high z-index sheet positioning above mobile bottom nav (z-30)", () => {
    // BottomSheet uses z-[60] to guarantee overlay and dialog render over mobile bottom nav
    expect(quickCaptureFile).toContain("z-[60]");
  });

  it("includes desktop hover/focus tooltip for parity with Dante", () => {
    expect(quickCaptureFile).toContain("Quick Capture");
    expect(quickCaptureFile).toContain("pointer-events-none absolute right-full");
  });

  it("mounts centrally in DashboardShell so Quick Capture is reachable across all routes", () => {
    expect(shellFile).toContain("import { QuickCapture } from \"@/components/dashboard/quick-capture\";");
    expect(shellFile).toContain("<aside");
    expect(shellFile).toContain("aria-label=\"Floating quick actions\"");
    expect(shellFile).toContain("<QuickCapture />");
    expect(shellFile).toContain("<FloatingDante />");
  });

  it("shows floating actions only on desktop, inside a gutter main reserves (UX WP1 F-02/F-09)", () => {
    // Below lg they covered Dante's Send, chat replies and the workout bar;
    // the mobile bottom nav already carries every Quick Capture destination and Dante.
    expect(shellFile).toContain("fixed bottom-6 right-6 z-40 hidden flex-col-reverse items-center gap-3 lg:flex");
    expect(shellFile).toContain('<main className="min-h-screen pb-28 lg:pb-10 lg:pl-72 lg:pr-20">');
    for (const href of ["/dashboard/nutrition", "/dashboard/workouts", "/dashboard/recovery", "/dashboard/ai-coach"]) {
      expect(shellFile).toMatch(new RegExp(`mobilePrimaryNav[\\s\\S]*href: "${href}"`));
    }
    // V4: five tabs; Progress moved to the More drawer (and Today's secondary strip), still one tap from the header.
    expect(shellFile).toMatch(/title: "Track",[\s\S]*href: "\/dashboard\/progress"/);
    expect(shellFile).toContain('aria-label="More: Progress, Calendar, History, Library, Settings"');
  });

  it("uses column-reverse layout to prevent overlap between Dante and Quick Capture", () => {
    expect(shellFile).toContain("flex-col-reverse items-center gap-3");
    // pointer-events-none on wrapper ensures background clicks pass through empty gutter
    expect(shellFile).toContain("pointer-events-none");
    // Buttons maintain pointer-events-auto
    expect(quickCaptureFile).toContain("pointer-events-auto");
    expect(floatingDanteFile).toContain("pointer-events-auto");
  });

  it("removed duplicate local mounting from app/dashboard/page.tsx", () => {
    expect(dashboardPageFile).not.toContain("<QuickCapture />");
    expect(dashboardPageFile).not.toContain("import { QuickCapture }");
  });
});
