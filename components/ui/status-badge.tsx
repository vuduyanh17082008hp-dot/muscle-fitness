import { cn } from "@/lib/utils";

/**
 * StatusBadge — the ONE reusable status pill for the app. Consolidates
 * the tone-class map that used to be duplicated inline inside
 * PerformanceCard (and re-typed slightly differently in a couple of
 * other places) into a single component + token source.
 */
export type StatusTone = "good" | "warning" | "critical" | "info" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  good: "border-mf-success/25 bg-mf-success/10 text-mf-success",
  warning: "border-mf-warning/25 bg-mf-warning/10 text-mf-warning",
  critical: "border-mf-danger/25 bg-mf-danger/10 text-mf-danger",
  info: "border-mf-cyan/25 bg-mf-cyan/10 text-mf-cyan",
  neutral: "border-white/10 bg-white/[0.04] text-zinc-400",
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
