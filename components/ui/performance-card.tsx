"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Dumbbell,
  Utensils,
  HeartPulse,
  Target,
  Layers3,
  CheckCircle2,
  Users,
  UserRoundCog,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  BrainCircuit,
  Zap,
  Clock3,
} from "lucide-react";

import { Card, CardGlow } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Icons are selected by name, never passed in as a component
 * reference. PerformanceCard is a Client Component ("use client"
 * above); a Lucide icon is a plain function from a module with no
 * "use client" boundary of its own, so a Server Component passing
 * one directly as a prop (`icon={Dumbbell}`) fails React's "Functions
 * cannot be passed directly to Client Components" serialization
 * check. Passing a string key instead keeps every prop serializable
 * — the actual component reference is resolved here, entirely on
 * the client side of the boundary.
 */
const PERFORMANCE_CARD_ICONS = {
  dumbbell: Dumbbell,
  utensils: Utensils,
  "heart-pulse": HeartPulse,
  target: Target,
  layers: Layers3,
  "check-circle": CheckCircle2,
  users: Users,
  "user-cog": UserRoundCog,
  "shield-check": ShieldCheck,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "brain-circuit": BrainCircuit,
  zap: Zap,
  clock: Clock3,
} as const satisfies Record<string, LucideIcon>;

export type PerformanceCardIconName = keyof typeof PERFORMANCE_CARD_ICONS;

/**
 * PerformanceCard — the ONE reusable metric/status card for the whole
 * app (spec: "Create a reusable PerformanceCard rather than random
 * one-off cards"). Before this, at least 6 independent
 * StatCard/MetricCard variants existed across dashboard, business
 * portal, and training-library pages. This is built on the EXISTING
 * `Card`/`CardGlow` primitives (components/ui/card.tsx) — same design
 * tokens, not a parallel system.
 *
 * `variant` maps to the domain-accent tokens added to
 * app/globals.css (--color-domain-*) so a glance at the left accent
 * bar / icon tint tells you which product area a card belongs to,
 * per the design spec:
 *   Training -> amber/red-orange, Nutrition -> green,
 *   Recovery -> violet, Progress -> cyan/blue, Dante -> amber/gold.
 */

export type PerformanceCardVariant =
  | "training"
  | "nutrition"
  | "recovery"
  | "progress"
  | "dante"
  | "neutral";

export type PerformanceCardStatusTone = "good" | "warning" | "critical" | "neutral";

export type PerformanceCardStatus = {
  label: string;
  tone?: PerformanceCardStatusTone;
};

export type PerformanceCardMetric = {
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
};

export type PerformanceCardProgress = {
  value: number;
  max?: number;
  label?: string;
};

export type PerformanceCardProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  metric?: PerformanceCardMetric;
  status?: PerformanceCardStatus;
  progress?: PerformanceCardProgress;
  icon?: PerformanceCardIconName;
  variant?: PerformanceCardVariant;
  actions?: ReactNode;
  /** A custom visual layer — sparkline, mini chart, illustration — rendered above the footer. */
  visual?: ReactNode;
  href?: string;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
};

const VARIANT_ACCENT: Record<PerformanceCardVariant, string> = {
  training: "var(--color-domain-training)",
  nutrition: "var(--color-domain-nutrition)",
  recovery: "var(--color-domain-recovery)",
  progress: "var(--color-domain-progress)",
  dante: "var(--color-domain-dante)",
  neutral: "var(--color-accent-light)",
};

const STATUS_TONE_CLASS: Record<PerformanceCardStatusTone, string> = {
  good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  critical: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  neutral: "border-white/10 bg-white/[0.04] text-zinc-400",
};

function TrendGlyph({ trend }: { trend: NonNullable<PerformanceCardMetric["trend"]> }) {
  if (trend === "up") return <span aria-hidden="true">↑</span>;
  if (trend === "down") return <span aria-hidden="true">↓</span>;
  return <span aria-hidden="true">→</span>;
}

export function PerformanceCard({
  eyebrow,
  title,
  subtitle,
  metric,
  status,
  progress,
  icon,
  variant = "neutral",
  actions,
  visual,
  href,
  loading = false,
  className,
  children,
}: PerformanceCardProps) {
  const reduceMotion = useReducedMotion();
  const accent = VARIANT_ACCENT[variant];
  const Icon = icon ? PERFORMANCE_CARD_ICONS[icon] : null;

  const progressPercent =
    progress != null
      ? Math.max(0, Math.min(100, (progress.value / (progress.max ?? 100)) * 100))
      : null;

  const content = (
    <Card
      interactive={Boolean(href)}
      className={cn("h-full p-5 sm:p-6", className)}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <CardGlow />

      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: accent }}
              >
                {eyebrow}
              </p>
            ) : null}

            <h3 className="mt-1 truncate text-base font-bold text-white sm:text-lg">
              {title}
            </h3>

            {subtitle ? (
              <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-secondary)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          {Icon ? (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl border"
              style={{
                color: accent,
                borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`,
              }}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
            <div className="h-2 w-full animate-pulse rounded-full bg-white/[0.05]" />
          </div>
        ) : (
          <>
            {metric ? (
              <div className="flex items-end gap-2">
                <motion.span
                  key={String(metric.value)}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="font-heading text-3xl tracking-[0.02em] text-white sm:text-4xl"
                >
                  {metric.value}
                </motion.span>
                {metric.unit ? (
                  <span className="pb-1 text-sm font-semibold text-[var(--color-text-muted)]">
                    {metric.unit}
                  </span>
                ) : null}
                {metric.trend ? (
                  <span
                    className={cn(
                      "pb-1 text-xs font-bold",
                      metric.trend === "up" && "text-emerald-400",
                      metric.trend === "down" && "text-rose-400",
                      metric.trend === "flat" && "text-zinc-500",
                    )}
                  >
                    <TrendGlyph trend={metric.trend} /> {metric.trendLabel}
                  </span>
                ) : null}
              </div>
            ) : null}

            {progressPercent !== null ? (
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: accent }}
                    initial={reduceMotion ? { width: `${progressPercent}%` } : { width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeOut" }}
                  />
                </div>
                {progress?.label ? (
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                    {progress.label}
                  </p>
                ) : null}
              </div>
            ) : null}

            {status ? (
              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
                  STATUS_TONE_CLASS[status.tone ?? "neutral"],
                )}
              >
                {status.label}
              </span>
            ) : null}

            {visual ? <div className="pt-1">{visual}</div> : null}

            {children}
          </>
        )}

        {actions ? <div className="mt-1 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}
