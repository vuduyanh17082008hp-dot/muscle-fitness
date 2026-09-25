"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import type { RecoveryState } from "@/lib/recovery/recovery-state";
import {
  proposalMutatesWorkout,
  type WorkoutAdjustmentProposal,
  type WorkoutChange,
} from "@/lib/recovery/proposal";
import { MotivationLine } from "@/components/motivation/motivation-line";
import { cn } from "@/lib/utils";

function formatPrescription(change: WorkoutChange, side: "before" | "after"): string {
  const rx = change[side];
  if (!rx) return "—";
  if (rx.isSkipped) return "Out of session";
  if (rx.targetSets === null) return "As planned";
  const reps =
    rx.repMin && rx.repMax
      ? `${rx.repMin}–${rx.repMax}`
      : rx.repMin
        ? `${rx.repMin}`
        : rx.repMax
          ? `${rx.repMax}`
          : null;
  return reps ? `${rx.targetSets} × ${reps}` : `${rx.targetSets} sets`;
}

export function RecoveryAdjustmentPanel({
  recoveryState,
  insight,
  proposal,
  hasCheckin,
}: {
  recoveryState: RecoveryState;
  insight: string;
  proposal: WorkoutAdjustmentProposal;
  hasCheckin: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [kept, setKept] = useState(false);

  if (!hasCheckin) return null;

  const canAdjust = proposalMutatesWorkout(proposal);
  const readiness = recoveryState.digest.status ?? recoveryState.digest.readiness;

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/recovery/adjustment/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      const data = (await response.json()) as { error?: string; alreadyApplied?: boolean };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to apply today's adjustment.");
      }
      setApplied(true);
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to apply today's adjustment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8"
      aria-labelledby={titleId}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
        Recovery updated
      </p>
      <h2 id={titleId} className="mt-1 text-xl font-black text-mf-glass-text">
        Today&apos;s readiness: {String(readiness).replaceAll("_", " ")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">
        <span className="font-semibold text-mf-glass-text">Dante: </span>
        {insight}
      </p>

      {recoveryState.digest.dataCompleteness === "INSUFFICIENT" ? (
        <p className="mt-4 text-sm text-mf-glass-text-muted">
          Complete more of today&apos;s check-in before changing the session. Nothing was invented.
        </p>
      ) : null}

      {canAdjust && !applied && !kept ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setError(null);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-mf-glass-brand px-5 py-3 text-sm font-semibold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            Adjust Today&apos;s Plan
          </button>
          <button
            type="button"
            onClick={() => setKept(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-mf-glass-border px-5 py-3 text-sm font-semibold text-mf-glass-text transition hover:bg-white/5"
          >
            Keep Original Plan
          </button>
        </div>
      ) : null}

      {kept ? (
        <p className="mt-4 text-sm text-mf-glass-text-muted">Original plan kept. No changes were made.</p>
      ) : null}
      {applied ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Today&apos;s plan is updated.
        </p>
      ) : null}

      <MotivationLine
        contexts={
          applied
            ? ["PLAN_ADJUSTED"]
            : recoveryState.digest.readiness === "LOW"
              ? ["RECOVERY_LOW"]
              : []
        }
      />

      {error ? (
        <p className="mt-4 text-sm text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          role="presentation"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-preview`}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-mf-glass-border bg-mf-glass-elevated p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={`${titleId}-preview`} className="text-lg font-black text-mf-glass-text">
              Today&apos;s adjustment
            </h3>
            <p className="mt-2 text-sm text-mf-glass-text-muted">
              Preview only. Nothing changes until you apply.
            </p>
            <ul className="mt-5 space-y-3">
              {proposal.changes.map((change) => (
                <li
                  key={change.changeId}
                  className="rounded-2xl border border-mf-glass-border bg-mf-glass-surface px-4 py-3"
                >
                  <p className="text-sm font-semibold text-mf-glass-text">{change.exerciseName}</p>
                  <p className="mt-1 text-sm text-mf-glass-text-secondary">
                    {formatPrescription(change, "before")}
                    <span className="mx-2 text-mf-glass-text-muted">
                      {change.action === "KEEP" ? "→" : "↓"}
                    </span>
                    {change.action === "KEEP" ? "No change" : formatPrescription(change, "after")}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-mf-glass-text-muted">
                Why
              </p>
              <p className="mt-1 text-sm leading-6 text-mf-glass-text-secondary">
                {proposal.changes.find((change) => change.action !== "KEEP")?.reasonDisplay ??
                  "No structured change is warranted from today's check-in."}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={apply}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-5 py-3 text-sm font-semibold text-mf-glass-brand-ink",
                  busy && "opacity-60",
                )}
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Apply Changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-mf-glass-border px-5 py-3 text-sm font-semibold text-mf-glass-text"
              >
                Keep Original
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
