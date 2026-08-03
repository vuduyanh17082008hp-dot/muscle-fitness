import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        `
          animate-pulse
          rounded-[var(--radius-sm)]
          bg-white/[0.07]
        `,
        className,
      )}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div
      className="
        overflow-hidden
        rounded-[var(--radius-md)]
        border border-[var(--color-border)]
        bg-[var(--color-surface)]
        p-5
        shadow-[var(--shadow-card)]
        sm:p-6
      "
    >
      <Skeleton className="size-12" />

      <Skeleton className="mt-6 h-7 w-2/3" />

      <div className="mt-5 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[70%]" />
      </div>

      <Skeleton className="mt-7 h-11 w-full" />
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div
      className="
        rounded-[var(--radius-md)]
        border border-[var(--color-border)]
        bg-[var(--color-surface)]
        p-5
        sm:p-6
      "
    >
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-5 h-11 w-36" />
      <Skeleton className="mt-4 h-4 w-44" />
    </div>
  );
}