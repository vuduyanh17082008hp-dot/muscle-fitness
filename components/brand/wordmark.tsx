import Link from "next/link";
import { Dumbbell } from "lucide-react";

import { cn } from "@/lib/utils";

/* Iron & Paper wordmark: condensed black uppercase on an iron tile. Uses
   glass tokens, so it reads on both the paper and the dark system. */
export function Wordmark({ href = "/", label = "Muscle Fitness home", onClick, className }: { href?: string; label?: string; onClick?: () => void; className?: string }) {
  return (
    <Link href={href} aria-label={label} onClick={onClick} className={cn("inline-flex min-h-11 min-w-0 items-center gap-2", className)}>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-mf-glass-text">
        <Dumbbell className="size-4 text-mf-glass-bg" />
      </span>
      <span className="truncate font-heading text-xl font-black sm:text-2xl uppercase leading-none tracking-tight text-mf-glass-text">
        Muscle Fitness
      </span>
    </Link>
  );
}
