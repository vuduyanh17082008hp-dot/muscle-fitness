import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * PageHeader — the app-surface page identity block (spec's PAGE
 * IDENTITY step). Consolidates the hero-header markup that was
 * copy-pasted with minor variations across most /dashboard/* pages
 * (a rounded-3xl gradient panel with an eyebrow, title, and
 * description). Existing pages are NOT required to migrate in this
 * pass — this is the canonical version for new/updated pages.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-mf-surface via-[#0a1622] to-mf-bg p-6 sm:p-8",
        className,
      )}
    >
      <div className="relative z-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-400">{eyebrow}</p>

        <h1 className="mt-3 text-page-title font-black tracking-tight text-white">{title}</h1>

        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-mf-text-muted">{description}</p>
        ) : null}

        {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

/**
 * SectionHeader — the compact in-page section label used to divide a
 * page into PAGE IDENTITY / CURRENT STATE / PRIMARY ACTION / CORE
 * METRICS / DETAILS / HISTORY blocks, per the page-structure spec.
 * Distinct from components/ui/section-heading.tsx (SectionHeading),
 * which is the larger marketing-page heading — this is the small
 * in-app divider label seen throughout the dashboard.
 */
export function SectionHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-text-muted">{eyebrow}</p>
        ) : null}
        <h2 className="mt-1 text-section-title font-black text-white">{title}</h2>
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
