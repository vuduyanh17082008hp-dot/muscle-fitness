"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeftRight, Eye, MessageCircle } from "lucide-react";

import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";
import { getSubRegionsFor } from "@/lib/training/muscle-subregions";
import { MUSCLE_DISPLAY_NAME, resolveCanonicalMuscle, resolveCanonicalMuscles, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_RANGES, type MuscleRangeId, type MuscleRangeSnapshot, type SessionMuscles } from "@/lib/training/muscle-intelligence";
import { findCatalogueExercise } from "@/lib/training/exercise-substitution";
import { EXERCISE_CATALOGUE, type ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import { EXERCISE_PROFILES } from "@/lib/workouts/exercise-profiles";
import { addDaysIso } from "@/lib/nutrition/date-utils";
import { cn } from "@/lib/cn";

const DanteChat = dynamic(() => import("@/components/dante-chat"), { ssr: false });

export type DetailTab = "training" | "exercises" | "anatomy";

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "training", label: "Your Training" },
  { id: "exercises", label: "Exercises" },
  { id: "anatomy", label: "Anatomy" },
];

const COMPLEXITY_LABEL = { low: "Simple setup", moderate: "Moderate setup", high: "Technical" } as const;

export type MuscleDetailProps = {
  muscle: CanonicalMuscle;
  range: MuscleRangeId;
  snapshot: MuscleRangeSnapshot;
  today: string;
  sessions: SessionMuscles[];
  hasAnyData: boolean;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  highlightedSlug: string | null;
  onHighlight: (item: ExerciseLibraryItem | null) => void;
  onFindAlternative: (item: ExerciseLibraryItem) => void;
  /** Id prefix so the desktop panel and the mobile sheet never duplicate DOM ids. */
  idPrefix: string;
  /** The mobile sheet already titles itself with the muscle name. */
  hideTitle?: boolean;
};

function daysAgo(today: string, date: string): string {
  for (let n = 0; n <= 120; n++) {
    if (addDaysIso(today, -n) === date) return n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  }
  return date;
}

export function MuscleDetail(props: MuscleDetailProps) {
  const { muscle, tab, onTabChange, idPrefix, hideTitle = false } = props;
  const atlas = MUSCLE_ATLAS_ENTRIES[muscle];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className={hideTitle ? "-mt-3" : undefined}>
        {hideTitle ? null : <h2 className="text-xl font-black tracking-tight text-mf-glass-text">{MUSCLE_DISPLAY_NAME[muscle]}</h2>}
        <p className="text-xs text-mf-glass-text-muted">{atlas.scientificName}</p>
      </div>

      <div role="tablist" aria-label={`${MUSCLE_DISPLAY_NAME[muscle]} details`} className="grid grid-cols-3 gap-1 rounded-md border border-mf-glass-border p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${idPrefix}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            onClick={() => onTabChange(t.id)}
            className={cn(
              "min-h-10 rounded px-1 text-[11px] font-bold leading-tight transition-colors sm:text-xs",
              tab === t.id ? "bg-mf-glass-text text-mf-glass-bg" : "text-mf-glass-text-muted hover:text-mf-glass-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${idPrefix}-panel-${tab}`} aria-labelledby={`${idPrefix}-tab-${tab}`} className="min-w-0">
        {tab === "training" ? <TrainingTab {...props} /> : null}
        {tab === "exercises" ? <ExercisesTab {...props} /> : null}
        {tab === "anatomy" ? <AnatomyTab muscle={muscle} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-mf-glass-border px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-mf-glass-text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums text-mf-glass-text">{value}</p>
    </div>
  );
}

function TrainingTab({ muscle, range, snapshot, today, sessions, hasAnyData, highlightedSlug, onHighlight, onFindAlternative }: MuscleDetailProps) {
  const [askingDante, setAskingDante] = useState(false);
  const summary = snapshot.muscles[muscle];
  const rangeLabel = MUSCLE_RANGES.find((r) => r.id === range)!.label;
  const name = MUSCLE_DISPLAY_NAME[muscle];
  const related = sessions.filter(
    (s) => s.localDate >= snapshot.startDate && (s.direct.includes(muscle) || s.indirect.includes(muscle)),
  );

  return (
    <div className="flex flex-col gap-4">
      {!hasAnyData ? (
        <p className="rounded-md border border-dashed border-mf-glass-border px-4 py-5 text-sm leading-6 text-mf-glass-text-muted">
          No finished workouts logged yet. Once you complete one, the sets you log show up here muscle by muscle.
        </p>
      ) : !summary ? (
        <p className="rounded-md border border-dashed border-mf-glass-border px-4 py-5 text-sm leading-6 text-mf-glass-text-muted">
          No logged sets for the {name.toLowerCase()} in the last {rangeLabel}. Try a longer time range, or see the Exercises tab.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Direct working sets" value={summary.directSets} />
            <Stat label="Indirect sets" value={summary.indirectSets} />
            <Stat label="Workouts" value={summary.sessions} />
            <Stat label="Last trained" value={summary.lastTrainedDate ? daysAgo(today, summary.lastTrainedDate) : "—"} />
          </div>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">Recent exercises · {rangeLabel}</h3>
            <ul className="flex flex-col gap-1.5">
              {summary.exercises.slice(0, 6).map((use) => {
                const item = findCatalogueExercise({ name: use.name });
                return (
                  <li key={`${use.exerciseId}-${use.role}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-mf-glass-border px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-semibold text-mf-glass-text">{use.name}</span>
                      <span className="block text-xs text-mf-glass-text-muted">
                        {use.role === "direct" ? "Direct" : "Indirect"} · {use.sets} set{use.sets === 1 ? "" : "s"} · last {daysAgo(today, use.lastDate)}
                      </span>
                    </span>
                    {item ? <ExerciseActions item={item} highlightedSlug={highlightedSlug} onHighlight={onHighlight} onFindAlternative={onFindAlternative} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {related.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">Workouts that trained it</h3>
          <ul className="flex flex-col gap-1">
            {related.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link href={`/dashboard/workouts/session/${s.id}`} className="flex min-h-10 items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-mf-glass-bg-deep">
                  <span className="truncate font-semibold text-mf-glass-text-secondary">{s.name}</span>
                  <span className="shrink-0 text-xs text-mf-glass-text-muted">
                    {s.direct.includes(muscle) ? "direct" : "indirect"} · {daysAgo(today, s.localDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs leading-5 text-mf-glass-text-muted">
        Counts completed working sets from finished workouts. Direct = the exercise lists this muscle as a primary mover; indirect = secondary. It doesn&apos;t measure growth, fatigue or recovery.
      </p>

      <div className="flex flex-col gap-2 border-t border-mf-glass-border pt-3">
        <button
          type="button"
          onClick={() => setAskingDante((v) => !v)}
          aria-expanded={askingDante}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-mf-glass-dante/40 px-4 text-sm font-bold text-mf-glass-dante hover:bg-mf-glass-bg-deep"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          {askingDante ? "Hide Dante" : `Ask Dante about my ${name.toLowerCase()}`}
        </button>
        {askingDante ? (
          <div className="min-h-[420px]">
            <DanteChat
              compact
              heroSubtitle={`Ask about your ${name.toLowerCase()} training…`}
              quickPrompts={[
                { label: `My ${name.toLowerCase()} · last ${rangeLabel}`, prompt: `How has my ${name.toLowerCase()} training looked over the last ${rangeLabel}, based on what I logged?` },
                { label: "Exercise options", prompt: `Which exercises fit my ${name.toLowerCase()} training with my experience and equipment?` },
              ]}
              contextPayload={{ selectedMuscle: muscle }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExerciseActions({
  item,
  highlightedSlug,
  onHighlight,
  onFindAlternative,
}: {
  item: ExerciseLibraryItem;
  highlightedSlug: string | null;
  onHighlight: (item: ExerciseLibraryItem | null) => void;
  onFindAlternative: (item: ExerciseLibraryItem) => void;
}) {
  const shown = highlightedSlug === item.slug;
  return (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-pressed={shown}
        onClick={() => onHighlight(shown ? null : item)}
        aria-label={`${shown ? "Hide" : "Show"} ${item.name} muscles on the map`}
        className={cn(
          "grid size-10 place-items-center rounded-md border transition-colors",
          shown ? "border-mf-glass-text bg-mf-glass-text text-mf-glass-bg" : "border-mf-glass-border text-mf-glass-text-secondary hover:border-mf-glass-border-strong",
        )}
      >
        <Eye aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onFindAlternative(item)}
        aria-label={`Find an alternative to ${item.name}`}
        className="grid size-10 place-items-center rounded-md border border-mf-glass-border text-mf-glass-text-secondary hover:border-mf-glass-border-strong"
      >
        <ArrowLeftRight aria-hidden="true" className="size-4" />
      </button>
    </span>
  );
}

function ExercisesTab({ muscle, highlightedSlug, onHighlight, onFindAlternative }: MuscleDetailProps) {
  const direct = EXERCISE_CATALOGUE.filter((item) => resolveCanonicalMuscle(item.primaryMuscle) === muscle);
  const indirect = EXERCISE_CATALOGUE.filter(
    (item) => resolveCanonicalMuscle(item.primaryMuscle) !== muscle && resolveCanonicalMuscles(item.secondaryMuscles).includes(muscle),
  );

  const group = (label: string, items: ExerciseLibraryItem[]) =>
    items.length > 0 ? (
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">{label}</h3>
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => {
            const profile = EXERCISE_PROFILES[item.slug ?? ""];
            return (
              <li key={item.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-mf-glass-border px-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-mf-glass-text">{item.name}</span>
                  <span className="block text-xs text-mf-glass-text-muted">
                    {item.equipment} · {item.movementPattern}
                    {profile ? ` · ${COMPLEXITY_LABEL[profile.complexity]}` : ""}
                  </span>
                </span>
                <ExerciseActions item={item} highlightedSlug={highlightedSlug} onHighlight={onHighlight} onFindAlternative={onFindAlternative} />
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {direct.length + indirect.length === 0 ? (
        <p className="rounded-md border border-dashed border-mf-glass-border px-4 py-5 text-sm text-mf-glass-text-muted">
          No catalogue exercise is mapped to this muscle yet.
        </p>
      ) : null}
      {group("Trains it directly", direct)}
      {group("Trains it as a secondary mover", indirect.slice(0, 8))}
      <Link
        href={`/dashboard/workouts/library?muscle=${muscle}`}
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-mf-glass-border text-sm font-semibold text-mf-glass-text-secondary hover:border-mf-glass-border-strong"
      >
        Open in Exercises
      </Link>
    </div>
  );
}

function AnatomyTab({ muscle }: { muscle: CanonicalMuscle }) {
  const atlas = MUSCLE_ATLAS_ENTRIES[muscle];
  const subRegions = getSubRegionsFor(muscle);
  return (
    <div className="flex flex-col gap-4 text-sm leading-6 text-mf-glass-text-secondary">
      <p>{atlas.shortDescription}</p>
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">Basic actions</h3>
        <ul className="list-disc pl-5">
          {atlas.basicActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </section>
      {subRegions.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">Regions</h3>
          <ul className="flex flex-col gap-1.5">
            {subRegions.map((region) => (
              <li key={region.id}>
                <span className="font-semibold text-mf-glass-text">{region.displayName}</span> — {region.shortDescription}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-xs text-mf-glass-text-muted">Educational overview, not medical advice.</p>
    </div>
  );
}
