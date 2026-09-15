"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

/**
 * ONE reusable contextual-tabs strip, dropped at the top of a
 * section's landing page (Train/Nutrition/Progress) to surface its
 * secondary functions as tabs instead of flat sidebar entries — e.g.
 * Train: Today | Plan | Form Coach | History. Every href here must
 * be a real, already-existing route or anchor; this component does
 * not create pages, it only reorganizes navigation to existing ones.
 */

export type SectionTab = {
  label: string;
  href: string;
};

function readHash(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash;
}

function isTabActive(pathname: string, href: string, currentHash: string): boolean {
  const [hrefPath, hrefHash] = href.split("#");

  if (hrefHash) {
    // Hash tabs only mark active after mount (currentHash tracked via
    // hashchange) so server HTML and the client's first paint agree —
    // both treat every hash tab as inactive until the listener runs.
    return pathname === hrefPath && currentHash === `#${hrefHash}`;
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    const sync = () => setCurrentHash(readHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);

  return (
    <nav
      aria-label="Section"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-mf-glass-border px-1 pb-px"
    >
      {tabs.map((tab) => {
        const active = isTabActive(pathname, tab.href, currentHash);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
              active
                ? "border-mf-glass-brand text-mf-glass-text"
                : "border-transparent text-mf-glass-text-muted hover:text-mf-glass-text-secondary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
