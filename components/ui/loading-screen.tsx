import { Dumbbell } from "lucide-react";

import { cn } from "@/lib/cn";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";

type LoadingScreenProps = {
  title?: string;
  description?: string;
  fullScreen?: boolean;
  showSkeleton?: boolean;
  className?: string;
};

export function LoadingScreen({
  title = "Preparing your experience",
  description = "Loading your Muscle Fitness system...",
  fullScreen = false,
  showSkeleton = true,
  className,
}: LoadingScreenProps) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={cn(
        `
          relative flex w-full
          items-center justify-center
          overflow-hidden px-4 py-16
          sm:px-6
        `,
        fullScreen
          ? "min-h-screen"
          : "min-h-[calc(100svh-var(--navbar-height))]",
        className,
      )}
    >
      <div className="section-grid" />

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          left-1/2 top-1/2
          size-[420px]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-[var(--color-accent)]
          opacity-[0.07]
          blur-[110px]
        "
      />

      <div className="relative w-full max-w-4xl">
        <div className="flex flex-col items-center text-center">
          <div
            className="
              relative grid size-16
              place-items-center
              rounded-[var(--radius-md)]
              border
              border-[var(--color-border-accent)]
              bg-[var(--color-accent-soft)]
              shadow-[var(--shadow-accent)]
            "
          >
            <Dumbbell
              aria-hidden="true"
              className="
                size-7
                text-[var(--color-accent-light)]
              "
            />

            <LoadingSpinner
              size="lg"
              label="Loading Muscle Fitness"
              className="
                absolute -inset-2
                size-20
                text-[var(--color-accent)]
                opacity-70
              "
            />
          </div>

          <p
            className="
              mt-7 text-xs font-bold
              uppercase tracking-[0.22em]
              text-[var(--color-accent-light)]
            "
          >
            Muscle Fitness
          </p>

          <h1
            className="
              mt-3 text-4xl
              tracking-[0.05em]
              text-white
              sm:text-5xl
            "
          >
            {title}
          </h1>

          <p
            className="
              mt-4 max-w-xl
              text-sm leading-7
              text-[var(--color-text-secondary)]
              sm:text-base
            "
          >
            {description}
          </p>

          <div
            className="
              mt-7 flex items-center gap-3
              text-xs font-bold uppercase
              tracking-[0.14em]
              text-[var(--color-text-muted)]
            "
          >
            <LoadingSpinner
              size="sm"
              className="text-[var(--color-accent)]"
            />

            Please wait
          </div>
        </div>

        {showSkeleton && (
          <div
            className="
              mt-12 grid gap-4
              sm:grid-cols-2
              lg:grid-cols-3
            "
          >
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="
                  rounded-[var(--radius-md)]
                  border border-[var(--color-border)]
                  bg-[var(--color-surface)]
                  p-5
                "
              >
                <Skeleton className="size-10" />
                <Skeleton className="mt-5 h-5 w-2/3" />
                <Skeleton className="mt-4 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-[82%]" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}