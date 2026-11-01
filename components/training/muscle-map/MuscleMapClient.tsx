"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { ANATOMY_COLOR, BodyFigure, type MuscleFills } from "@/components/training/anatomy/body-figure";
import { ExerciseAlternativesSheet } from "@/components/training/exercise-alternatives";
import { MuscleSearchBar } from "@/components/training/muscle-map/MuscleSearchBar";
import { MuscleDetail, type DetailTab } from "@/components/training/muscle-map/MuscleDetail";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { musclesInView } from "@/lib/training/anatomy/body-atlas";
import type { ExperienceLevel } from "@/lib/training/exercise-substitution";
import {
  loadLevel,
  maxDirectSets,
  MUSCLE_RANGES,
  type LoadLevel,
  type MuscleIntelligenceData,
  type MuscleRangeId,
} from "@/lib/training/muscle-intelligence";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";
import { CANONICAL_MUSCLES, MUSCLE_DISPLAY_NAME, resolveCanonicalMuscles, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import { cn } from "@/lib/cn";

type Mode = "anatomy" | "load";

const GROUPS: Array<{ label: string; muscles: CanonicalMuscle[] }> = [
  { label: "Chest & shoulders", muscles: ["upper_chest", "chest", "anterior_deltoid", "lateral_deltoid", "rear_deltoid"] },
  { label: "Back", muscles: ["trapezius", "upper_back", "latissimus_dorsi", "lower_back"] },
  { label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { label: "Core", muscles: ["abdominals", "obliques"] },
  { label: "Legs", muscles: ["glutes", "quadriceps", "hamstrings", "calves"] },
];

const LOAD_STYLE: Record<LoadLevel, { fill: string; opacity: number; label: string }> = {
  high: { fill: ANATOMY_COLOR.accent, opacity: 0.95, label: "Most direct sets" },
  moderate: { fill: ANATOMY_COLOR.accent, opacity: 0.6, label: "Some direct sets" },
  low: { fill: ANATOMY_COLOR.accent, opacity: 0.32, label: "Few direct sets" },
  indirect: { fill: ANATOMY_COLOR.outline, opacity: 0.35, label: "Indirect only" },
  none: { fill: ANATOMY_COLOR.idle, opacity: 1, label: "No logged sets" },
};

export type MuscleIntelligenceWorkspaceProps = {
  data: MuscleIntelligenceData;
  experience: ExperienceLevel | null;
  familiarSlugs: string[];
  hold: boolean;
  inProgressWorkouts: number;
  initialMuscle?: CanonicalMuscle | null;
  initialRange?: MuscleRangeId;
  initialSessionId?: string | null;
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-mf-glass-border p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "min-h-9 flex-1 whitespace-nowrap rounded px-2.5 text-xs font-bold transition-colors",
            value === option.id ? "bg-mf-glass-text text-mf-glass-bg" : "text-mf-glass-text-muted hover:text-mf-glass-text",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MuscleMapClient({
  data,
  experience,
  familiarSlugs,
  hold,
  inProgressWorkouts,
  initialMuscle = null,
  initialRange = "28d",
  initialSessionId = null,
}: MuscleIntelligenceWorkspaceProps) {
  const [range, setRange] = useState<MuscleRangeId>(initialRange);
  const snapshot = data.ranges[range];
  const hasAnyData = data.ranges["84d"].workingSets > 0;

  const [mode, setMode] = useState<Mode>(hasAnyData ? "load" : "anatomy");
  const [selected, setSelected] = useState<CanonicalMuscle | null>(initialMuscle);
  const [view, setView] = useState<"front" | "back">(initialMuscle ? MUSCLE_ATLAS_ENTRIES[initialMuscle].preferredView : "front");
  const [tab, setTab] = useState<DetailTab>(hasAnyData ? "training" : "anatomy");
  const [highlight, setHighlight] = useState<ExerciseLibraryItem | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId && data.recentSessions.some((s) => s.id === initialSessionId) ? initialSessionId : null,
  );
  const [alternativesFor, setAlternativesFor] = useState<ExerciseLibraryItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingSets, setPendingSets] = useState(0);

  // Offline sets live only on this device until they sync; count them so the map never looks complete when it isn't.
  useEffect(() => {
    try {
      let count = 0;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith("mf:pending-sets:")) continue;
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
        count += Object.keys(parsed).length;
      }
      setPendingSets(count);
    } catch {
      setPendingSets(0);
    }
  }, []);

  // Keep the selection, range and workout in the URL so a reload or shared link restores them (no server round-trip).
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null) => (value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    set("muscle", selected);
    set("range", range === "28d" ? null : range);
    set("session", sessionId);
    window.history.replaceState(window.history.state, "", url);
  }, [selected, range, sessionId]);

  const focusSession = data.recentSessions.find((s) => s.id === sessionId) ?? null;
  const max = maxDirectSets(snapshot);

  const fills = useMemo<MuscleFills>(() => {
    const out: MuscleFills = {};
    if (highlight) {
      for (const m of resolveCanonicalMuscles([highlight.primaryMuscle])) out[m] = { fill: ANATOMY_COLOR.accent, opacity: 0.95 };
      for (const m of resolveCanonicalMuscles(highlight.secondaryMuscles)) out[m] ??= { fill: ANATOMY_COLOR.accent, opacity: 0.42 };
      return out;
    }
    if (focusSession) {
      for (const m of focusSession.direct) out[m] = { fill: ANATOMY_COLOR.accent, opacity: 0.95 };
      for (const m of focusSession.indirect) out[m] = { fill: ANATOMY_COLOR.accent, opacity: 0.42 };
      return out;
    }
    if (mode === "load") {
      for (const m of CANONICAL_MUSCLES) {
        const level = loadLevel(snapshot.muscles[m], max);
        if (level !== "none") out[m] = { fill: LOAD_STYLE[level].fill, opacity: LOAD_STYLE[level].opacity };
      }
    }
    return out;
  }, [highlight, focusSession, mode, snapshot, max]);

  function select(muscle: CanonicalMuscle, fromSearch = false) {
    setSelected(muscle);
    setHighlight(null);
    if (fromSearch || !musclesInView(view).has(muscle)) setView(MUSCLE_ATLAS_ENTRIES[muscle].preferredView);
  }

  const rangeLabel = MUSCLE_RANGES.find((r) => r.id === range)!.label;
  const selectedSummary = selected ? snapshot.muscles[selected] : undefined;

  const detail = (idPrefix: string) =>
    selected ? (
      <MuscleDetail
        muscle={selected}
        range={range}
        snapshot={snapshot}
        today={data.today}
        sessions={data.recentSessions}
        hasAnyData={hasAnyData}
        tab={tab}
        onTabChange={setTab}
        highlightedSlug={highlight?.slug ?? null}
        onHighlight={(item) => {
          setHighlight(item);
          setSessionId(null);
          setSheetOpen(false);
        }}
        onFindAlternative={(item) => {
          setSheetOpen(false);
          setAlternativesFor(item);
        }}
        idPrefix={idPrefix}
        hideTitle={idPrefix === "sheet"}
      />
    ) : null;

  const figure = (v: "front" | "back") => (
    <figure className="mx-auto w-full max-w-[240px]">
      <BodyFigure view={v} fills={fills} selected={selected} onSelect={(m) => select(m)} />
      <figcaption className="mt-1 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-mf-glass-text-muted">
        {v === "front" ? "Front" : "Back"}
      </figcaption>
    </figure>
  );

  return (
    <section aria-label="Muscle map" className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-4 rounded-md border border-mf-glass-border bg-mf-glass-surface p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <MuscleSearchBar onResolve={(m) => select(m, true)} />
          <Segmented<Mode>
            label="Map mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setHighlight(null);
              setSessionId(null);
            }}
            options={[
              { id: "anatomy", label: "Anatomy" },
              { id: "load", label: "Training load" },
            ]}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <Segmented<MuscleRangeId>
            label="Time range"
            value={range}
            onChange={setRange}
            options={MUSCLE_RANGES.map((r) => ({ id: r.id, label: r.label }))}
          />
          <p className="text-xs text-mf-glass-text-muted" aria-live="polite">
            {snapshot.workingSets} working set{snapshot.workingSets === 1 ? "" : "s"} in {snapshot.sessions} finished workout
            {snapshot.sessions === 1 ? "" : "s"} · last {rangeLabel}
          </p>
        </div>

        {pendingSets > 0 || inProgressWorkouts > 0 || snapshot.unmappedSets > 0 ? (
          <ul className="flex flex-col gap-1 text-xs leading-5 text-mf-glass-text-secondary">
            {pendingSets > 0 ? (
              <li className="rounded-md border border-mf-glass-warning/40 px-3 py-1.5">
                {pendingSets} set{pendingSets === 1 ? " is" : "s are"} saved on this device but not synced yet — not counted until they upload.
              </li>
            ) : null}
            {inProgressWorkouts > 0 ? (
              <li className="rounded-md border border-mf-glass-border px-3 py-1.5">
                A workout is still in progress — its sets count once you finish it.
              </li>
            ) : null}
            {snapshot.unmappedSets > 0 ? (
              <li className="rounded-md border border-mf-glass-border px-3 py-1.5">
                {snapshot.unmappedSets} set{snapshot.unmappedSets === 1 ? "" : "s"} from {snapshot.unmappedExercises.join(", ")} couldn&apos;t be matched to a muscle, so {snapshot.unmappedSets === 1 ? "it isn't" : "they aren't"} shown.
              </li>
            ) : null}
          </ul>
        ) : null}

        {highlight || focusSession ? (
          <div className="flex items-center justify-between gap-2 rounded-md bg-mf-glass-bg-deep px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              Showing: <span className="font-semibold">{highlight ? highlight.name : `${focusSession!.name} · ${focusSession!.localDate}`}</span>
              <span className="text-mf-glass-text-muted"> (strong = primary, light = secondary)</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setHighlight(null);
                setSessionId(null);
              }}
              aria-label="Clear highlight"
              className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-mf-glass-surface"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}

        <div className="lg:hidden">
          <Segmented<"front" | "back">
            label="Body view"
            value={view}
            onChange={setView}
            options={[
              { id: "front", label: "Front" },
              { id: "back", label: "Back" },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div className={cn(view === "back" && "hidden lg:block")}>{figure("front")}</div>
          <div className={cn(view === "front" && "hidden lg:block")}>{figure("back")}</div>
        </div>

        {mode === "load" && !highlight && !focusSession ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-mf-glass-text-muted" aria-label="Legend">
            {(["high", "moderate", "low", "indirect", "none"] as LoadLevel[]).map((level) => (
              <li key={level} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-sm border border-mf-glass-border" style={{ background: LOAD_STYLE[level].fill, opacity: LOAD_STYLE[level].opacity }} />
                {LOAD_STYLE[level].label}
              </li>
            ))}
            <li className="basis-full">Relative to your other muscles in this period — not a recovery or growth measure.</li>
          </ul>
        ) : null}

        {data.recentSessions.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
            Muscles from a finished workout
            <select
              value={sessionId ?? ""}
              onChange={(event) => {
                setSessionId(event.target.value || null);
                setHighlight(null);
              }}
              className="h-11 w-full rounded-md border border-mf-glass-border bg-mf-glass-surface px-3 text-base! font-normal normal-case tracking-normal text-mf-glass-text"
            >
              <option value="">None — show {mode === "load" ? "training load" : "anatomy"}</option>
              {data.recentSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.localDate} · {s.workingSets} sets
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <nav aria-label="Muscles" className="flex flex-col gap-3">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-mf-glass-text-muted">{group.label}</p>
              <ul className="flex flex-wrap gap-1.5">
                {group.muscles.map((m) => {
                  const s = snapshot.muscles[m];
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        aria-pressed={selected === m}
                        onClick={() => select(m)}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors",
                          selected === m
                            ? "border-mf-glass-text bg-mf-glass-text text-mf-glass-bg"
                            : "border-mf-glass-border text-mf-glass-text-secondary hover:border-mf-glass-border-strong",
                        )}
                      >
                        {MUSCLE_DISPLAY_NAME[m]}
                        {hasAnyData ? (
                          <span className="font-normal tabular-nums" aria-label={`${s?.directSets ?? 0} direct sets`}>
                            {s?.directSets ?? 0}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Desktop: persistent detail column. */}
      <aside className="hidden min-w-0 rounded-md border border-mf-glass-border bg-mf-glass-surface p-5 lg:block" aria-label="Muscle details">
        {detail("desk") ?? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-mf-glass-text">Select a muscle</p>
            <p className="max-w-xs text-sm text-mf-glass-text-muted">Tap the body or pick from the list to see your logged training, exercises and anatomy.</p>
          </div>
        )}
      </aside>

      {/* Mobile: compact summary that expands into a sheet. */}
      {selected ? (
        <div className="sticky bottom-20 z-20 rounded-md border border-mf-glass-border-strong bg-mf-glass-surface p-4 shadow-lg lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-mf-glass-text">{MUSCLE_DISPLAY_NAME[selected]}</p>
              <p className="text-xs text-mf-glass-text-muted">
                {selectedSummary
                  ? `${selectedSummary.directSets} direct · ${selectedSummary.indirectSets} indirect sets · ${rangeLabel}`
                  : hasAnyData
                    ? `No logged sets · ${rangeLabel}`
                    : "No finished workouts yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-mf-glass-text px-4 text-sm font-bold text-mf-glass-bg"
            >
              Details
            </button>
          </div>
        </div>
      ) : null}

      <BottomSheet open={sheetOpen && selected !== null} onOpenChange={setSheetOpen} title={selected ? MUSCLE_DISPLAY_NAME[selected] : undefined}>
        {detail("sheet")}
      </BottomSheet>

      {alternativesFor ? (
        <ExerciseAlternativesSheet
          open
          onOpenChange={(next) => !next && setAlternativesFor(null)}
          exercise={alternativesFor}
          target={selected && resolveCanonicalMuscles([alternativesFor.primaryMuscle]).includes(selected) ? selected : undefined}
          experience={experience}
          familiarSlugs={familiarSlugs}
          hold={hold}
        />
      ) : null}
    </section>
  );
}
