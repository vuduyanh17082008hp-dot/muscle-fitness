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

/**
 * Exactly one active tab. Hash tabs on the current path: the one matching the hash, else the page's first section
 * (landing with no hash is that section). Route tabs: the longest matching path, so /dashboard/workouts/library marks
 * "Exercises", not also "Today" (/dashboard/workouts).
 */
function activeTabHref(tabs: SectionTab[], pathname: string, currentHash: string): string | null {
  const hashTabs = tabs.filter((tab) => tab.href.includes("#") && tab.href.split("#")[0] === pathname);
  if (hashTabs.length > 0) {
    return (hashTabs.find((tab) => `#${tab.href.split("#")[1]}` === currentHash) ?? hashTabs[0]).href;
  }
  const routeMatches = tabs.filter(
    (tab) => !tab.href.includes("#") && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
  );
  return routeMatches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
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

  const activeHref = activeTabHref(tabs, pathname, currentHash);

  return (
    <nav
      aria-label="Section"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-mf-glass-border px-1 pb-px"
    >
      {tabs.map((tab) => {
        const active = tab.href === activeHref;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            // Link navigates with pushState, which fires no hashchange: record the section the tap went to.
            onClick={() => tab.href.includes("#") && setCurrentHash(`#${tab.href.split("#")[1]}`)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors duration-200",
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
