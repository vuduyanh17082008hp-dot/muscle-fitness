import Link from "next/link";
import { CheckCircle, ChevronRight } from "lucide-react";

export type WhatMattersItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  urgency?: "high" | "normal" | "low";
};

export type WhatMattersNowProps = {
  items: WhatMattersItem[];
};

export function WhatMattersNow({ items }: WhatMattersNowProps) {
  // If no items exist, render a quiet, calm positive confirmation.
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-mf-glass-text-muted">
        <CheckCircle className="size-4 shrink-0 text-emerald-400" />
        <span>Nothing requires urgent attention right now. Plan is on track.</span>
      </div>
    );
  }

  // Display max 3 items
  const visibleItems = items.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
          What matters now
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-mf-glass-surface p-3.5 transition hover:border-white/20 hover:bg-mf-glass-elevated"
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 size-2 shrink-0 rounded-full ${
                  item.urgency === "high"
                    ? "bg-amber-400"
                    : item.urgency === "low"
                    ? "bg-zinc-500"
                    : "bg-mf-glass-brand"
                }`}
              />
              <div>
                <p className="text-xs font-bold text-mf-glass-text group-hover:text-white">
                  {item.title}
                </p>
                {item.subtitle ? (
                  <p className="mt-0.5 text-[11px] text-mf-glass-text-muted">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
            </div>

            <ChevronRight className="size-3.5 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>
        ))}
      </div>
    </div>
  );
}
