"use client";

import { useState } from "react";

import { REVIEW_NOTES_MAX_LENGTH, reviewedRepCount, type SetReview } from "@/lib/setvision/saved-analysis";
import type { SetVisionAnalysis } from "@/lib/setvision/types";

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Jump({ ms, onSeek }: { ms: number; onSeek?: (ms: number) => void }) {
  if (!onSeek) return <span>{secs(ms)}</span>;
  return (
    <button type="button" onClick={() => onSeek(ms)} className="font-semibold text-zinc-200 underline decoration-dotted underline-offset-2 hover:text-white" aria-label={`Jump video to ${secs(ms)}`}>
      {secs(ms)}
    </button>
  );
}

/**
 * The user's own review of one set: reject automated reps that aren't reps,
 * mark reps SetVision missed (or every rep, when nothing is measured), add
 * notes and say when they're unsure. Everything here is labelled as the
 * user's, never mixed into what SetVision measured. Read-only when
 * `onChange` is absent (a restored review).
 */
export function SetReviewPanel({
  analysis,
  review,
  onChange,
  currentTimeMs,
  onSeek,
}: {
  analysis: SetVisionAnalysis | null;
  review: SetReview;
  onChange?: (review: SetReview) => void;
  /** Reads the video's current time (ms) when marking a rep; absent = marking disabled. */
  currentTimeMs?: () => number | null;
  onSeek?: (ms: number) => void;
}) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const automated = analysis && !analysis.abstainReason ? analysis.perRep.tempo : [];
  const rejected = new Set(review.rejectedReps);
  const total = reviewedRepCount(automated.length, review);
  const editable = Boolean(onChange);

  const toggle = (repNumber: number) =>
    onChange?.({
      ...review,
      rejectedReps: rejected.has(repNumber) ? review.rejectedReps.filter((n) => n !== repNumber) : [...review.rejectedReps, repNumber].sort((a, b) => a - b),
    });

  const mark = () => {
    const now = currentTimeMs?.();
    if (now === null || now === undefined) return;
    if (pendingStart === null) {
      setPendingStart(now);
      setMarkError(null);
      return;
    }
    if (now <= pendingStart) {
      setMarkError("Play or move the video past the rep's start before marking its end.");
      return;
    }
    onChange?.({ ...review, manualReps: [...review.manualReps, { startMs: pendingStart, endMs: now }].sort((a, b) => a.startMs - b.startMs) });
    setPendingStart(null);
    setMarkError(null);
  };

  return (
    <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-review">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{editable ? "3. Review the set" : "Your review"}</p>
      <p className="mt-2 text-lg font-black text-white" data-testid="sv-review-total">
        {total} rep{total === 1 ? "" : "s"} after your review
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-500" data-testid="sv-review-breakdown">
        {analysis && !analysis.abstainReason
          ? `SetVision counted ${automated.length}${rejected.size ? `, you rejected ${rejected.size}` : ""}; you marked ${review.manualReps.length}.`
          : `SetVision measured nothing here; all ${review.manualReps.length} rep(s) were marked by you.`}{" "}
        Your corrections are saved separately from what SetVision measured.
      </p>

      {automated.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm" aria-label="Reps SetVision counted">
          {automated.map((t) => (
            <li key={t.repNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] px-3 py-2" data-testid="sv-review-auto-rep">
              <span className={rejected.has(t.repNumber) ? "text-zinc-500 line-through" : "text-zinc-200"}>
                SetVision rep {t.repNumber} · <Jump ms={t.descentStartMs ?? t.ascentStartMs ?? 0} onSeek={onSeek} />–<Jump ms={t.repEndMs ?? 0} onSeek={onSeek} />
              </span>
              {editable ? (
                <button type="button" onClick={() => toggle(t.repNumber)} aria-pressed={rejected.has(t.repNumber)} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/[0.06]">
                  {rejected.has(t.repNumber) ? "Restore rep" : "Not a rep"}
                </button>
              ) : rejected.has(t.repNumber) ? (
                <span className="text-xs text-zinc-500">Rejected by you</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {review.manualReps.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm" aria-label="Reps you marked">
          {review.manualReps.map((m, i) => (
            <li key={`${m.startMs}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-400/20 px-3 py-2" data-testid="sv-review-manual-rep">
              <span className="text-zinc-200">
                Marked by you · <Jump ms={m.startMs} onSeek={onSeek} />–<Jump ms={m.endMs} onSeek={onSeek} />
              </span>
              {editable ? (
                <button type="button" onClick={() => onChange?.({ ...review, manualReps: review.manualReps.filter((_, k) => k !== i) })} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/[0.06]">
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editable && currentTimeMs ? (
        <div className="mt-4">
          <button type="button" onClick={mark} className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white hover:bg-white/[0.1]" data-testid="sv-mark-rep">
            {pendingStart === null ? "Mark rep start at current video time" : `Mark rep end (started ${secs(pendingStart)})`}
          </button>
          {pendingStart !== null ? (
            <button type="button" onClick={() => setPendingStart(null)} className="ml-2 text-xs font-semibold text-zinc-400 underline underline-offset-2">
              Cancel
            </button>
          ) : null}
          <p className="mt-1.5 text-xs text-zinc-500" aria-live="polite">
            {markError ?? "Pause the video where a rep starts, mark it, then move to where it ends and mark again."}
          </p>
        </div>
      ) : null}

      {editable ? (
        <div className="mt-5 grid gap-3">
          <label className="text-sm font-semibold text-zinc-300">
            Notes (optional)
            <textarea
              value={review.notes}
              onChange={(e) => onChange?.({ ...review, notes: e.target.value.slice(0, REVIEW_NOTES_MAX_LENGTH) })}
              maxLength={REVIEW_NOTES_MAX_LENGTH}
              rows={3}
              className="mt-1.5 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-normal text-white"
              data-testid="sv-review-notes"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={review.unsure} onChange={(e) => onChange?.({ ...review, unsure: e.target.checked })} className="size-4 accent-amber-500" data-testid="sv-review-unsure" />
            I&apos;m not sure about this count
          </label>
        </div>
      ) : (
        <>
          {review.notes ? <p className="mt-4 whitespace-pre-wrap break-words text-sm text-zinc-300" data-testid="sv-review-notes-saved">{review.notes}</p> : null}
          {review.unsure ? <p className="mt-2 text-xs font-semibold text-amber-300">You marked this count as unsure.</p> : null}
        </>
      )}
    </article>
  );
}
