import Link from "next/link";
import { Dumbbell } from "lucide-react";

import { cn } from "@/lib/cn";

type LogoProps = {
  className?: string;
  showTextOnMobile?: boolean;
};

export function Logo({
  className,
  showTextOnMobile = false,
}: LogoProps) {
  return (
    <Link
      href="/"
      aria-label="Muscle Fitness home"
      className={cn(
        "group inline-flex shrink-0 items-center gap-3",
        className,
      )}
    >
      <span
        className="
          relative grid size-10 shrink-0 place-items-center
          overflow-hidden rounded-[6px]
          border border-[var(--color-border-accent)]
          bg-[var(--color-accent-soft)]
          transition duration-300
          group-hover:border-[var(--color-accent)]
          group-hover:shadow-[var(--shadow-accent)]
        "
      >
        <span
          className="
            absolute inset-0
            bg-gradient-to-br
            from-white/10 to-transparent
          "
        />

        <Dumbbell
          aria-hidden="true"
          className="
            relative size-5
            text-[var(--color-accent-light)]
            transition duration-300
            group-hover:scale-110
          "
          strokeWidth={2.1}
        />
      </span>

      <span
        className={cn(
          "leading-none",
          showTextOnMobile
            ? "block"
            : "hidden sm:block",
        )}
      >
        <span
          className="
            block font-heading
            text-[1.6rem] tracking-[0.09em]
            text-white
          "
        >
          Muscle
        </span>

        <span
          className="
            mt-1 block
            text-[0.62rem] font-bold
            tracking-[0.42em]
            text-[var(--color-accent)]
          "
        >
          Fitness
        </span>
      </span>
    </Link>
  );
}