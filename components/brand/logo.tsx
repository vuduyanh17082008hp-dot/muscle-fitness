import Link from "next/link";

import { cn } from "@/lib/cn";
import { BrandMark } from "@/components/brand/mark";

type LogoProps = {
  className?: string;
  showTextOnMobile?: boolean;
  /** Where the mark links — defaults to the public marketing home; pass "/dashboard" inside the app shell. */
  href?: string;
  /** Optional third line under the wordmark for context, e.g. "Client OS" or "Business Portal". */
  tagline?: string;
  onClick?: () => void;
};

export function Logo({
  className,
  showTextOnMobile = false,
  href = "/",
  tagline,
  onClick,
}: LogoProps) {
  return (
    <Link
      href={href}
      aria-label="Muscle Fitness home"
      onClick={onClick}
      className={cn(
        "group inline-flex shrink-0 items-center gap-3",
        className,
      )}
    >
      <span
        className="
          relative grid size-10 shrink-0 place-items-center
          overflow-hidden rounded-[10px]
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

        <BrandMark
          className="
            relative size-5
            text-[var(--color-accent-light)]
            transition duration-300
            group-hover:scale-110
          "
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
            font-brand
            block
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

        {tagline ? (
          <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}