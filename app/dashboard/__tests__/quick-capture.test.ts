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

  it("positions floating actions above mobile nav and respects safe-area insets", () => {
    // Container bottom takes mobile nav into account and env(safe-area-inset-bottom)
    expect(shellFile).toContain("bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]");
    expect(shellFile).toContain("lg:bottom-6 lg:right-6");
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
