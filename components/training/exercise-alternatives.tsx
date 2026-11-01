"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeftRight, Check, ExternalLink } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  CATEGORY_LABEL,
  CONSTRAINT_LABEL,
  EVIDENCE_LABEL,
  findAlternatives,
  type Alternative,
  type EquipmentConstraint,
  type ExperienceLevel,
  type SubstitutionPreference,
  type SubstitutionReason,
} from "@/lib/training/exercise-substitution";
import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { EVIDENCE_SOURCES, EXERCISE_PROFILES } from "@/lib/workouts/exercise-profiles";
import type { ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import { cn } from "@/lib/cn";

const REASONS: Array<{ id: SubstitutionReason; label: string }> = [
  { id: "machine_occupied", label: "Machine occupied" },
  { id: "equipment_unavailable", label: "Equipment missing" },
  { id: "discomfort", label: "Feels uncomfortable" },
  { id: "unfamiliar", label: "Unfamiliar movement" },
  { id: "more_options", label: "Just show options" },
];

const CONSTRAINTS = Object.keys(CONSTRAINT_LABEL) as EquipmentConstraint[];

const PREFERENCES: Array<{ id: SubstitutionPreference; label: string }> = [
  { id: "similar_movement", label: "Similar movement" },
  { id: "different_movement", label: "Different movement" },
  { id: "less_equipment", label: "Less equipment" },
  { id: "more_stable", label: "More stable" },
  { id: "easier_setup", label: "Easier setup" },
  { id: "prefer_machine", label: "Prefer machine" },
  { id: "prefer_free_weights", label: "Prefer free weights" },
];

const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
const COMPLEXITY_RANK = { low: 0, moderate: 1, high: 2 } as const;
const INITIAL_VISIBLE = 4;

export type AlternativeApply = {
  /** Real exercise_library id for a catalogue slug in this environment, or null (review only). */
  resolveId: (slug: string) => string | null;
  /** Why applying is impossible right now (logged sets, plan disallows it). null = allowed. */
  blockedReason: string | null;
  onApply: (item: ExerciseLibraryItem, exerciseId: string) => Promise<{ success: boolean; message: string }>;
};

export type ExerciseAlternativesSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseLibraryItem;
  target?: CanonicalMuscle;
  experience: ExperienceLevel | null;
  familiarSlugs: string[];
  hold?: boolean;
  initialReason?: SubstitutionReason;
  apply?: AlternativeApply;
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-semibold transition-colors",
        active
          ? "border-mf-glass-text bg-mf-glass-text text-mf-glass-bg"
          : "border-mf-glass-border text-mf-glass-text-secondary hover:border-mf-glass-border-strong",
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function ExerciseAlternativesSheet(props: ExerciseAlternativesSheetProps) {
  const { open, onOpenChange, exercise } = props;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={`Alternatives to ${exercise.name}`} className="sm:max-w-2xl">
      {open ? <AlternativesBody {...props} /> : null}
    </BottomSheet>
  );
}

function AlternativesBody({
  exercise,
  target,
  experience: profileExperience,
  familiarSlugs,
  hold = false,
  initialReason = "more_options",
  apply,
}: ExerciseAlternativesSheetProps) {
  const [reason, setReason] = useState<SubstitutionReason>(initialReason);
  const [constraints, setConstraints] = useState<EquipmentConstraint[]>([]);
  const [preferences, setPreferences] = useState<SubstitutionPreference[]>([]);
  const [experience, setExperience] = useState<ExperienceLevel | null>(profileExperience);
  const [showAll, setShowAll] = useState(false);

  const familiar = useMemo(() => new Set(familiarSlugs), [familiarSlugs]);
  const result = useMemo(
    () =>
      findAlternatives({
        current: exercise,
        target,
        reasons: [reason],
        constraints,
        preferences,
        experience,
        familiarSlugs: familiar,
        hold,
      }),
    [exercise, target, reason, constraints, preferences, experience, familiar, hold],
  );

  const currentComplexity = EXERCISE_PROFILES[exercise.slug ?? ""]?.complexity ?? null;
  const visible = showAll ? result.alternatives : result.alternatives.slice(0, INITIAL_VISIBLE);

  return (
    <div className="flex flex-col gap-4 text-mf-glass-text">
      {result.target ? (
        <p className="-mt-2 text-sm text-mf-glass-text-muted">
          Target: <span className="font-semibold text-mf-glass-text-secondary">{MUSCLE_DISPLAY_NAME[result.target]}</span> · suggestions only — nothing changes until you confirm.
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">What&apos;s going on?</legend>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <Chip key={r.id} active={reason === r.id} onClick={() => setReason(r.id)}>
              {r.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <details className="group rounded-md border border-mf-glass-border px-3 py-2" open={reason === "equipment_unavailable"}>
        <summary className="cursor-pointer list-none py-1 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
          Equipment &amp; preferences{constraints.length + preferences.length > 0 ? ` · ${constraints.length + preferences.length} on` : ""}
        </summary>
        <div className="mt-2 flex flex-col gap-3 pb-1">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Available equipment">
            {CONSTRAINTS.map((c) => (
              <Chip key={c} active={constraints.includes(c)} onClick={() => setConstraints((list) => toggle(list, c))}>
                {CONSTRAINT_LABEL[c]}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preferences">
            {PREFERENCES.map((p) => (
              <Chip key={p.id} active={preferences.includes(p.id)} onClick={() => setPreferences((list) => toggle(list, p.id))}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      </details>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
          Your experience {profileExperience ? "(from your profile)" : "(not set)"}
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Experience level for these suggestions">
          {LEVELS.map((level) => (
            <Chip key={level} active={experience === level} onClick={() => setExperience((current) => (current === level ? null : level))}>
              <span className="capitalize">{level}</span>
            </Chip>
          ))}
        </div>
        {experience !== profileExperience ? (
          <p className="mt-1.5 text-xs text-mf-glass-text-muted">Only changes these suggestions — your profile stays as it is.</p>
        ) : null}
      </div>

      {result.notes.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-live="polite">
          {result.notes.map((note) => (
            <li key={note} className="rounded-md border border-mf-glass-border bg-mf-glass-bg-deep px-3 py-2 text-sm leading-6 text-mf-glass-text-secondary">
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      {result.alternatives.length === 0 ? (
        <p className="rounded-md border border-dashed border-mf-glass-border px-4 py-6 text-center text-sm text-mf-glass-text-muted">
          No catalogue alternative fits these choices. Try removing an equipment filter.
        </p>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Suggested alternatives">
          {visible.map((alt) => (
            <AlternativeCard
              key={alt.item.slug}
              alt={alt}
              current={exercise}
              currentComplexity={currentComplexity}
              apply={result.canApply ? apply : undefined}
            />
          ))}
        </ol>
      )}

      {result.alternatives.length > INITIAL_VISIBLE ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="min-h-11 rounded-md border border-mf-glass-border text-sm font-semibold text-mf-glass-text-secondary hover:border-mf-glass-border-strong"
        >
          {showAll ? "Show fewer" : `Show ${result.alternatives.length - INITIAL_VISIBLE} more`}
        </button>
      ) : null}

      {result.notRecommended.length > 0 ? (
        <details className="rounded-md border border-mf-glass-border px-3 py-2">
          <summary className="cursor-pointer py-1 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
            Not recommended in this context ({result.notRecommended.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2 pb-1">
            {result.notRecommended.map((entry) => (
              <li key={entry.item.slug} className="text-sm">
                <span className="font-semibold text-mf-glass-text-secondary">{entry.item.name}</span>
                <span className="text-mf-glass-text-muted"> — {entry.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AlternativeCard({
  alt,
  current,
  currentComplexity,
  apply,
}: {
  alt: Alternative;
  current: ExerciseLibraryItem;
  currentComplexity: keyof typeof COMPLEXITY_RANK | null;
  apply?: AlternativeApply;
}) {
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const delta = currentComplexity ? COMPLEXITY_RANK[alt.profile.complexity] - COMPLEXITY_RANK[currentComplexity] : 0;
  const exerciseId = apply && alt.item.slug ? apply.resolveId(alt.item.slug) : null;

  const badges = [
    alt.similarMovement ? "Similar movement" : "Different movement",
    delta < 0 ? "Simpler setup" : delta > 0 ? "More setup & coordination" : null,
    alt.profile.stability === "guided" ? "Guided path" : alt.profile.stability === "supported" ? "Supported" : null,
    alt.familiar ? "You've logged this" : null,
  ].filter(Boolean) as string[];

  return (
    <li className="rounded-md border border-mf-glass-border bg-mf-glass-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-mf-glass-text-muted">{CATEGORY_LABEL[alt.category]}</p>
          <h3 className="text-base font-bold text-mf-glass-text">{alt.item.name}</h3>
          <p className="text-xs text-mf-glass-text-muted">
            {alt.item.equipment} · {alt.item.movementPattern} · {alt.profile.mechanic === "compound" ? "multi-joint" : "single-joint"}
          </p>
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Characteristics">
        {badges.map((badge) => (
          <li key={badge} className="rounded-md bg-mf-glass-bg-deep px-2 py-0.5 text-[11px] font-semibold text-mf-glass-text-secondary">
            {badge}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">
        <span className="font-semibold text-mf-glass-text">Why this exercise? </span>
        {alt.why}
      </p>
      {alt.experienceNote ? <p className="mt-1 text-sm leading-6 text-mf-glass-text-muted">{alt.experienceNote}</p> : null}

      <details className="mt-2">
        <summary className="min-h-9 cursor-pointer py-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
          Differences, loading &amp; evidence
        </summary>
        <div className="flex flex-col gap-3 pb-1 text-sm leading-6 text-mf-glass-text-secondary">
          {alt.differences.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {alt.differences.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
          <p>
            <span className="font-semibold text-mf-glass-text">Loading: </span>
            {alt.loading}
          </p>
          <p>
            <span className="font-semibold text-mf-glass-text">Progression: </span>
            {alt.profile.progression}
          </p>
          {alt.evidence.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {alt.evidence.map((note) => (
                <li key={note.summary} className="rounded-md bg-mf-glass-bg-deep px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-mf-glass-text-muted">{EVIDENCE_LABEL[note.category]}</p>
                  <p>{note.summary}</p>
                  {note.sourceIds.map((id) => (
                    <a
                      key={id}
                      href={EVIDENCE_SOURCES[id].url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-mf-glass-text underline underline-offset-2"
                    >
                      {EVIDENCE_SOURCES[id].label}
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-mf-glass-text-muted">
              <span className="font-semibold">{EVIDENCE_LABEL.practical_coaching}:</span> no exercise-specific trial — the rationale above comes from the movement itself.
            </p>
          )}
        </div>
      </details>

      {apply ? (
        <div className="mt-3 border-t border-mf-glass-border pt-3">
          {outcome ? (
            <p role="status" className={cn("text-sm font-semibold", outcome.success ? "text-mf-glass-text" : "text-mf-glass-warning")}>
              {outcome.success ? <Check aria-hidden="true" className="mr-1 inline size-4" /> : null}
              {outcome.message}
            </p>
          ) : apply.blockedReason ? (
            <p className="text-sm text-mf-glass-text-muted">{apply.blockedReason}</p>
          ) : !exerciseId ? (
            <p className="text-sm text-mf-glass-text-muted">Not available in this workout yet — use it as a reference.</p>
          ) : confirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-mf-glass-text-secondary">
                Replace {current.name} with {alt.item.name} in this workout? Your plan isn&apos;t changed, and no weight carries over.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const response = await apply
                        .onApply(alt.item, exerciseId)
                        .catch(() => ({ success: false, message: "That didn't go through, and nothing was changed. Check your connection and try again." }));
                      setOutcome(response);
                      setConfirming(false);
                    })
                  }
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-mf-glass-text px-4 text-sm font-bold text-mf-glass-bg disabled:opacity-60"
                >
                  {isPending ? "Replacing…" : "Replace"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirming(false)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-mf-glass-border px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-mf-glass-text px-4 text-sm font-bold text-mf-glass-text hover:bg-mf-glass-bg-deep"
            >
              <ArrowLeftRight aria-hidden="true" className="size-4" />
              Use instead
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
