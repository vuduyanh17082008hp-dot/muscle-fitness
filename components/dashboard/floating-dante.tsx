"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { DanteMascot } from "@/components/dante/dante-mascot";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/useIsDesktop";

/**
 * Floating Dante — the persistent, calm entry point into Dante from
 * anywhere in the Client OS (mounted once in DashboardShell). Clicking
 * it opens a small contextual chat panel in place, reusing the exact
 * same DanteChat/streaming stack the full /dashboard/ai-coach page
 * uses — no parallel chat implementation. The panel itself is lazy
 * (next/dynamic, ssr:false) and only imported after the first open,
 * so DanteChat's ~1500-line bundle never ships on a plain page load.
 */

const FloatingDantePanel = dynamic(
  () => import("@/components/dashboard/floating-dante-panel").then((mod) => mod.FloatingDantePanel),
  { ssr: false },
);

/** Route-aware one-liner — purely client-side pathname matching, no fetch. */
export function contextualPromptForPath(pathname: string): string {
  if (pathname.startsWith("/dashboard/nutrition")) return "Ask about today's nutrition…";
  if (pathname.startsWith("/dashboard/workouts/setvision")) return "Ask Dante about this analysis…";
  if (pathname.startsWith("/dashboard/workouts") || pathname.startsWith("/dashboard/split")) {
    return "Ask about today's workout…";
  }
  if (pathname.startsWith("/dashboard/recovery")) return "Ask about your recovery…";
  if (pathname.startsWith("/dashboard/training-intelligence") || pathname.startsWith("/dashboard/progress")) {
    return "Ask about your progress…";
  }
  return "Ask Dante anything…";
}

export function FloatingDante() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const pathname = usePathname();
  const isDesktop = useIsDesktop();

  // Skip the floating trigger on pages that already embed a full,
  // in-flow DanteChat composer of their own — the full Dante page
  // (ai-coach) and Recovery's "Recovery Coach" section. Opening the
  // floating panel there rendered a second, fixed-position DanteChat
  // on top of the one already in the page, which visually collided
  // with in-flow content behind it (e.g. Recovery Knowledge Hub).
  if (pathname === "/dashboard/ai-coach" || pathname === "/dashboard/recovery") {
    return null;
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setEverOpened(true);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={open ? "Close Dante" : "Ask Dante"}
        aria-expanded={open}
        className={cn(
          "group fixed bottom-20 right-4 z-40 grid size-14 place-items-center rounded-full",
          "border border-mf-glass-dante/30 bg-mf-glass-brand text-mf-glass-brand-ink",
          "shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition duration-200 hover:-translate-y-0.5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-glass-brand",
          "lg:bottom-6 lg:right-6",
        )}
      >
        <DanteMascot size="xs" state="idle" />

        <span
          className={cn(
            "pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg",
            "border border-mf-glass-border bg-mf-glass-elevated px-3 py-1.5 text-xs font-semibold text-mf-glass-text",
            "opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 lg:block",
          )}
        >
          Ask Dante
        </span>
      </button>

      {everOpened ? (
        <FloatingDantePanel
          open={open}
          onOpenChange={setOpen}
          isDesktop={isDesktop}
          contextualPrompt={contextualPromptForPath(pathname)}
        />
      ) : null}
    </>
  );
}

export default FloatingDante;
