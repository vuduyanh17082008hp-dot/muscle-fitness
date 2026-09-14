"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Dumbbell, Search, Sparkles } from "lucide-react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseDifficulty } from "@/lib/workouts/exercise-library";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";
import { searchExerciseRecords } from "@/lib/workouts/search-exercises";
import { hasMorePages, sliceForPage } from "@/lib/workouts/pagination";
import { PerformanceCard } from "@/components/ui/performance-card";
import { ExerciseDetailPanel } from "@/app/dashboard/workouts/library/exercise-detail-panel";
import { cn } from "@/lib/cn";

const DIFFICULTIES: ExerciseDifficulty[] = ["beginner", "intermediate", "advanced"];
const PAGE_SIZE = 12;

const DIFFICULTY_TONE: Record<ExerciseDifficulty, string> = {
  beginner: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  intermediate: "border-mf-glass-warning/25 bg-mf-glass-warning/10 text-mf-glass-warning",
  advanced: "border-mf-glass-danger/25 bg-mf-glass-danger/10 text-mf-glass-danger",
};

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
        active
          ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
          : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function ExerciseBrowser({
  records,
  availableEquipment,
  initialMuscle,
}: {
  records: ExerciseRecord[];
  availableEquipment: string[];
  initialMuscle: CanonicalMuscle | null;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<CanonicalMuscle | null>(initialMuscle);
  const [equipmentFilter, setEquipmentFilter] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty | null>(null);
  const [movementPattern, setMovementPattern] = useState<string | null>(null);
  const [showAllEquipment, setShowAllEquipment] = useState(availableEquipment.length === 0);
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<ExerciseRecord | null>(null);

  const muscleOptions = useMemo(() => {
    const set = new Set<CanonicalMuscle>();
    for (const record of records) {
      for (const m of record.primaryMuscles) set.add(m);
    }
    return Array.from(set).sort((a, b) => MUSCLE_DISPLAY_NAME[a].localeCompare(MUSCLE_DISPLAY_NAME[b]));
  }, [records]);

  const equipmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const record of records) {
      for (const e of record.equipment) set.add(e);
    }
    return Array.from(set).sort();
  }, [records]);

  const movementOptions = useMemo(() => {
    const set = new Set<string>();
    for (const record of records) set.add(record.movementPattern);
    return Array.from(set).sort();
  }, [records]);

  const results = useMemo(
    () =>
      searchExerciseRecords(records, {
        query: query || undefined,
        muscle: muscle ?? undefined,
        equipmentFilter: equipmentFilter ?? undefined,
        difficulty: difficulty ?? undefined,
        movementPattern: movementPattern ?? undefined,
        availableEquipment: showAllEquipment ? "all" : availableEquipment,
      }),
    [records, query, muscle, equipmentFilter, difficulty, movementPattern, showAllEquipment, availableEquipment],
  );

  const visible = sliceForPage(results, page, PAGE_SIZE);
  const canLoadMore = hasMorePages(results, page, PAGE_SIZE);

  function updateAndResetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <main className="relative min-h-screen bg-mf-glass-bg px-4 py-8 text-mf-glass-text sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/workouts"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-mf-glass-text-muted transition hover:text-mf-glass-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workouts
          </Link>

          <Link
            href="/dashboard/workouts/plans/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-5 text-xs font-black uppercase tracking-[0.12em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            <Sparkles className="h-4 w-4" />
            Build workout plan
          </Link>
        </div>

        <header className="mt-8 overflow-hidden rounded-[32px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)] sm:p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-mf-glass-brand-border bg-mf-glass-brand-soft">
                  <Dumbbell className="h-5 w-5 text-mf-glass-brand" />
                </span>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-mf-glass-brand">Exercise database</p>
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Exercise Discovery</h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-mf-glass-text-muted sm:text-base">
                Search or filter by muscle, equipment, difficulty and movement pattern before adding an exercise to
                your training programme.
              </p>
            </div>

            <div className="rounded-2xl border border-mf-glass-border bg-mf-glass-bg-deep px-5 py-4">
              <p className="text-xs font-black uppercase tracking-wider text-mf-glass-text-muted">
                Available exercises
              </p>
              <p className="mt-2 text-3xl font-black text-mf-glass-brand">{records.length}</p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PerformanceCard glass variant="training" icon="dumbbell" title="Exercises" metric={{ value: records.length }} />
          <PerformanceCard
            glass
            variant="training"
            icon="target"
            title="Primary muscles"
            metric={{ value: muscleOptions.length }}
          />
          <PerformanceCard
            glass
            variant="training"
            icon="layers"
            title="Equipment types"
            metric={{ value: equipmentOptions.length }}
          />
          <PerformanceCard
            glass
            variant="training"
            icon="check-circle"
            title="Beginner friendly"
            metric={{ value: records.filter((r) => r.difficulty === "beginner").length }}
          />
        </section>

        <section className="mt-8 rounded-3xl border border-mf-glass-border bg-white/[0.02] p-5 sm:p-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mf-glass-text-muted" />
            <input
              value={query}
              onChange={(event) => updateAndResetPage(setQuery)(event.target.value)}
              placeholder="Search exercises… (bench, chest press, row)"
              className="h-12 w-full rounded-xl border border-mf-glass-border bg-mf-glass-bg-deep pl-11 pr-4 text-sm text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FilterChip active={muscle === null} onClick={() => updateAndResetPage(setMuscle)(null)}>
              All muscles
            </FilterChip>
            {muscleOptions.map((option) => (
              <FilterChip key={option} active={muscle === option} onClick={() => updateAndResetPage(setMuscle)(option)}>
                {MUSCLE_DISPLAY_NAME[option]}
              </FilterChip>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FilterChip active={difficulty === null} onClick={() => updateAndResetPage(setDifficulty)(null)}>
              All levels
            </FilterChip>
            {DIFFICULTIES.map((level) => (
              <FilterChip key={level} active={difficulty === level} onClick={() => updateAndResetPage(setDifficulty)(level)}>
                {level}
              </FilterChip>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={equipmentFilter ?? ""}
              onChange={(event) => updateAndResetPage(setEquipmentFilter)(event.target.value || null)}
              className="h-10 rounded-lg border border-mf-glass-border bg-mf-glass-bg-deep px-3 text-sm text-mf-glass-text"
            >
              <option value="">All equipment</option>
              {equipmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={movementPattern ?? ""}
              onChange={(event) => updateAndResetPage(setMovementPattern)(event.target.value || null)}
              className="h-10 rounded-lg border border-mf-glass-border bg-mf-glass-bg-deep px-3 text-sm text-mf-glass-text"
            >
              <option value="">All movement patterns</option>
              {movementOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {availableEquipment.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllEquipment((value) => !value)}
                className={cn(
                  "ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  showAllEquipment
                    ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
                    : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text-secondary",
                )}
              >
                {showAllEquipment ? "Showing All Equipment" : "Show All Equipment"}
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="text-3xl font-black tracking-tight">Results</h2>
            <p className="text-sm text-mf-glass-text-muted">{results.length} of {records.length} exercises</p>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-mf-glass-border bg-white/[0.015] px-6 py-20 text-center">
              <Search className="mx-auto h-8 w-8 text-mf-glass-text-muted" />
              <h3 className="mt-4 text-xl font-black text-mf-glass-text-secondary">No exercises found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-mf-glass-text-muted">
                Change your search term or remove some filters to see more exercises.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((record) => (
                  <ExerciseCard key={record.id} record={record} onSelect={() => setSelectedRecord(record)} />
                ))}
              </div>

              {canLoadMore ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="h-11 rounded-xl border border-mf-glass-border px-6 text-sm font-bold text-mf-glass-text-secondary transition hover:border-mf-glass-brand-border hover:text-mf-glass-text"
                  >
                    Load More
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {selectedRecord ? (
        <ExerciseDetailPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      ) : null}
    </main>
  );
}

function ExerciseCard({ record, onSelect }: { record: ExerciseRecord; onSelect: () => void }) {
  const hasAnimation = Boolean(record.animationId);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col gap-3 rounded-2xl border border-mf-glass-border bg-mf-glass-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-mf-glass-brand-border"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-mf-glass-border bg-white/[0.02] text-mf-glass-text-muted">
          <Dumbbell className="size-4" aria-hidden="true" />
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", DIFFICULTY_TONE[record.difficulty])}>
          {record.difficulty}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-mf-glass-text">{record.canonicalName}</p>
        <p className="truncate text-xs text-mf-glass-text-muted">
          {record.primaryMuscles.map((m) => MUSCLE_DISPLAY_NAME[m]).join(", ") || "—"} · {record.equipment.join(", ")}
        </p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-wide text-mf-glass-text-muted">
        {hasAnimation ? (
          <span className="text-mf-glass-brand">● Technique available</span>
        ) : (
          "Technique coming soon"
        )}
      </p>
    </button>
  );
}
