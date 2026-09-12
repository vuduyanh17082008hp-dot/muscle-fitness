"use client";

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

function isTabActive(pathname: string, href: string): boolean {
  const [hrefPath, hrefHash] = href.split("#");

  if (hrefHash) {
    // Hash-based tabs (anchors within the current page) can't be told
    // apart from the URL alone once loaded — they're treated as
    // active only when the browser's current hash matches.
    return (
      pathname === hrefPath &&
      typeof window !== "undefined" &&
      window.location.hash === `#${hrefHash}`
    );
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/10 px-1 pb-px"
    >
      {tabs.map((tab) => {
        const active = isTabActive(pathname, tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
              active
                ? "border-amber-400 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
