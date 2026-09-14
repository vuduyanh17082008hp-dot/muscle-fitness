import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Performance Glass card shell — the ONE surface primitive for every
 * Dashboard Bento card (Today's Plan, Readiness, Nutrition, Dante,
 * Muscle Intelligence, Recent Activity, Progress Snapshot). Built on
 * the app/globals.css `--mf-glass-*` tokens, not a parallel color
 * system.
 */
export function GlassCard({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6",
        interactive &&
          "transition duration-200 hover:-translate-y-0.5 hover:border-mf-glass-border-strong hover:bg-mf-glass-elevated focus-visible:-translate-y-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function GlassCardHeader({
  title,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-3.5 text-mf-glass-text-muted" aria-hidden="true" /> : null}
        <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-mf-glass-text-secondary">
          {title}
        </h3>
      </div>

      {action}
    </div>
  );
}

export function GlassDivider({ className }: { className?: string }) {
  return <div className={cn("my-4 border-t border-mf-glass-border", className)} aria-hidden="true" />;
}
