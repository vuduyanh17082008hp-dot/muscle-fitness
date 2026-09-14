"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Apple,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ChartNoAxesCombined,
  ChevronDown,
  Dumbbell,
  HeartPulse,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Vertical editorial feature explorer (homepage spec Part 19). Every
 * `preview` line below is a real, representative product state
 * (same values used in the #BuiltForPerformance showcase / Dante
 * Learned / recovery score conventions elsewhere) — illustrative,
 * never a specific live user's data.
 */
type ExplorerItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  text: string;
  preview: string;
  cta: string;
  href: string;
};

const EXPLORER_ITEMS: ExplorerItem[] = [
  {
    key: "training",
    icon: Dumbbell,
    title: "Training",
    text: "Adaptive splits and progression that react to your real performance and recovery — not a fixed template.",
    preview: "Bench Press · BUILD · +2.5kg this week",
    cta: "Explore Training",
    href: "/training",
  },
  {
    key: "nutrition",
    icon: Apple,
    title: "Nutrition",
    text: "Calorie and macro targets from your real profile, with barcode, search and photo logging.",
    preview: "142 / 180g protein logged today",
    cta: "Explore Nutrition",
    href: "/meal-plan",
  },
  {
    key: "recovery",
    icon: HeartPulse,
    title: "Recovery",
    text: "A daily readiness estimate built from sleep, stress, soreness, mood and training load.",
    preview: "72 · Ready",
    cta: "Explore Recovery",
    href: "/dashboard/recovery",
  },
  {
    key: "dante",
    icon: BrainCircuit,
    title: "Dante",
    text: "The AI layer that reads your whole athlete context and turns it into one practical next action.",
    preview: "\"Why this?\" evidence on every recommendation",
    cta: "Ask Dante",
    href: "/chatbot",
  },
  {
    key: "progress",
    icon: ChartNoAxesCombined,
    title: "Progress",
    text: "Trend, change and context across training, body metrics and adherence over time.",
    preview: "4 of 5 sessions this week",
    cta: "View Progress",
    href: "/dashboard/progress",
  },
  {
    key: "knowledge",
    icon: BookOpen,
    title: "Knowledge Brain",
    text: "Retrieval over trusted sources — PubMed/NCBI, USDA FoodData Central, Open Food Facts — surfaced only when relevant.",
    preview: "Evidence-backed, never fabricated",
    cta: "How Dante works",
    href: "#dante",
  },
];

export function FeatureExplorer() {
  const [openKey, setOpenKey] = useState<string>(EXPLORER_ITEMS[0].key);

  return (
    <div className="divide-y divide-white/8 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.02]">
      {EXPLORER_ITEMS.map((item) => {
        const isOpen = item.key === openKey;
        const Icon = item.icon;

        return (
          <div key={item.key}>
            <button
              type="button"
              onClick={() => setOpenKey(item.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-white/[0.02] sm:px-7"
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl border transition",
                  isOpen
                    ? "border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] text-[var(--mf-brand)]"
                    : "border-white/10 bg-white/4 text-zinc-400",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>

              <span
                className={cn(
                  "flex-1 text-lg font-black transition",
                  isOpen ? "text-white" : "text-zinc-500",
                )}
              >
                {item.title}
              </span>

              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-zinc-500 transition-transform",
                  isOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>

            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="grid grid-cols-1 gap-5 px-5 pb-6 sm:grid-cols-[1.3fr_1fr] sm:px-7">
                  <div>
                    <p className="max-w-md text-sm leading-6 text-zinc-400">{item.text}</p>

                    <Link
                      href={item.href}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-[var(--mf-brand)] transition hover:text-[var(--mf-brand-hover)]"
                    >
                      {item.cta}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3.5">
                    <p className="text-xs font-medium leading-5 text-zinc-300">{item.preview}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
