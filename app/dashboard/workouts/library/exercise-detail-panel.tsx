"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { ExerciseTechniquePanel } from "@/components/training/exercise-technique-panel";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsDesktop } from "@/lib/useIsDesktop";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";

// Lazy: DanteChat is a large streaming chat surface, only needed once
// a user explicitly asks Dante about this exercise — same treatment
// as Floating Dante / the Muscle Atlas's Ask Dante tab.
const DanteChat = dynamic(() => import("@/components/dante-chat"), { ssr: false });

type PanelProps = { record: ExerciseRecord; onClose: () => void; onFindAlternative: () => void };

export function ExerciseDetailPanel({ record, onClose, onFindAlternative }: PanelProps) {
  const isDesktop = useIsDesktop();
  const content = <PanelContent record={record} onClose={onClose} onFindAlternative={onFindAlternative} />;

  if (isDesktop) {
    return (
      <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col gap-4 overflow-y-auto border-l border-mf-glass-border bg-mf-glass-bg p-6"
          >
            {content}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <BottomSheet open onOpenChange={(next) => !next && onClose()} title={record.canonicalName}>
      {content}
    </BottomSheet>
  );
}

function PanelContent({ record, onClose, onFindAlternative }: PanelProps) {
  const [askingDante, setAskingDante] = useState(false);
  const hasAlternatives =
    record.alternatives.length > 0 || record.regressions.length > 0 || record.progressions.length > 0;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Dialog.Title className="text-lg font-bold text-mf-glass-text">{record.canonicalName}</Dialog.Title>
          <p className="text-xs text-mf-glass-text-muted">
            {record.equipment.join(", ")} · {record.movementPattern} · {record.difficulty}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {record.provenance.raw.description ? (
        <p className="text-sm leading-6 text-mf-glass-text-secondary">{record.provenance.raw.description}</p>
      ) : null}

      <ExerciseTechniquePanel exercise={record.provenance.raw} />

      {record.instructions.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">Instructions</h3>
          <ol className="space-y-1.5 text-sm text-mf-glass-text-secondary">
            {record.instructions.map((step, index) => (
              <li key={index}>
                {index + 1}. {step}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {hasAlternatives ? (
        <section className="flex flex-col gap-3">
          {record.alternatives.length > 0 ? (
            <AlternativesList label="Alternatives" items={record.alternatives} />
          ) : null}
          {record.regressions.length > 0 ? (
            <AlternativesList label="Easier Variations" items={record.regressions} />
          ) : null}
          {record.progressions.length > 0 ? (
            <AlternativesList label="Progressions" items={record.progressions} />
          ) : null}
        </section>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 border-t border-mf-glass-border pt-4">
        <button
          type="button"
          onClick={onFindAlternative}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-mf-glass-border-strong text-sm font-bold uppercase tracking-[0.08em] text-mf-glass-text transition hover:bg-mf-glass-hover"
        >
          Find Alternative
        </button>

        {/* Plans persist built-in ids only; environment-seeded entries (no fixed id) can't be prefilled yet. */}
        {record.provenance.raw.id ? (
          <Link
            href={`/dashboard/workouts/plans/new?prefillExercise=${encodeURIComponent(record.canonicalName)}`}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-mf-glass-brand text-sm font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            Add to Plan
          </Link>
        ) : null}

        <button
          type="button"
          onClick={() => setAskingDante((value) => !value)}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-mf-glass-dante/30 bg-mf-glass-dante/10 text-sm font-bold uppercase tracking-[0.08em] text-violet-200 transition hover:bg-mf-glass-dante/20"
        >
          {askingDante ? "Hide Dante" : "Ask Dante"}
        </button>
      </div>

      {askingDante ? (
        <div className="min-h-[420px]">
          <DanteChat
            compact
            heroSubtitle={`Ask about ${record.canonicalName}…`}
            contextPayload={{ selectedExercise: record.canonicalName }}
          />
        </div>
      ) : null}
    </>
  );
}

function AlternativesList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">{label}</h3>
      <ul className="space-y-1 text-sm text-mf-glass-text-secondary">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
