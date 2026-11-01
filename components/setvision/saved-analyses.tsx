"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { EXERCISE_CONFIGS } from "@/lib/setvision/exercise-config";
import { reviewedRepCount, type RestoredAnalysis, type SetReview } from "@/lib/setvision/saved-analysis";
import { SOURCE_TEXT } from "@/lib/setvision/exercise-selection";
import type { SetVisionExerciseId } from "@/lib/setvision/types";
import { SetVisionResultsPanel } from "@/components/setvision/results-panel";
import { SetReviewPanel } from "@/components/setvision/set-review";

type ListItem = {
  id: string;
  exercise: SetVisionExerciseId | "manual_review";
  /** Null for a manual review (nothing was measured). */
  reps: number | null;
  analyzed_at: string;
  identity: { label?: unknown } | null;
  review: Partial<SetReview> | null;
};

/** "4 reps (SetVision 5, you rejected 1)" — what the user ended up with, and where it came from. */
function countText(item: ListItem): string {
  const review = { rejectedReps: item.review?.rejectedReps ?? [], manualReps: item.review?.manualReps ?? [], notes: "", unsure: false };
  const total = reviewedRepCount(item.reps ?? 0, review);
  const plural = `${total} rep${total === 1 ? "" : "s"}`;
  if (item.reps === null) return `Manual review · ${plural} marked by you`;
  const edited = review.rejectedReps.length > 0 || review.manualReps.length > 0;
  return edited ? `${plural} after your review (SetVision counted ${item.reps})` : plural;
}

const VISIBLE = 5;

/**
 * The caller's saved analyses (newest first), each restorable in full from
 * the database — the rep timeline comes back from the saved row, and the
 * video from the caller's private storage when it is still there.
 */
export function SavedAnalyses({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [listError, setListError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [restored, setRestored] = useState<RestoredAnalysis | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const [restoreState, setRestoreState] = useState<"idle" | "loading" | "error">("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/setvision/results")
      .then((r) => r.json().then((d) => ({ ok: r.ok && d.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) throw new Error("list failed");
        setItems((d.results ?? []) as ListItem[]);
        setListError(false);
      })
      .catch(() => !cancelled && setListError(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const open = useCallback(async (id: string) => {
    setOpenId(id);
    setRestoreState("loading");
    setRestored(null);
    setVideoUrl(null);
    setVideoNote(null);
    try {
      const response = await fetch(`/api/setvision/results?id=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "restore failed");
      const result = data.result as RestoredAnalysis;
      setRestored(result);
      setRestoreState("idle");

      if (result.videoStoragePath) {
        const { data: signed, error } = await createClient()
          .storage.from("setvision-videos")
          .createSignedUrl(result.videoStoragePath, 60 * 60);
        if (error || !signed) setVideoNote("The saved video could not be loaded, so times can't be jumped to.");
        else setVideoUrl(signed.signedUrl);
      } else {
        setVideoNote("No video was stored with this analysis.");
      }
    } catch (error) {
      console.error("[SETVISION] restore failed", error);
      setRestoreState("error");
    }
  }, []);

  const seek = useCallback((ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  if (listError) {
    return (
      <p className="text-sm text-zinc-500" data-testid="sv-saved-error">
        Saved analyses could not be loaded right now.
      </p>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="sv-saved-heading" data-testid="sv-saved">
      <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <History className="size-4 text-zinc-500" aria-hidden="true" />
          <h2 id="sv-saved-heading" className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
            Saved analyses
          </h2>
        </div>
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {items.slice(0, VISIBLE).map((item) => {
            const label =
              typeof item.identity?.label === "string"
                ? item.identity.label
                : item.exercise === "manual_review"
                  ? "Unlabelled review"
                  : EXERCISE_CONFIGS[item.exercise]?.displayName ?? item.exercise;
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 text-zinc-300">
                  <span className="break-words font-semibold text-white">{label}</span> · {countText(item)} ·{" "}
                  {new Date(item.analyzed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <button
                  type="button"
                  onClick={() => open(item.id)}
                  aria-pressed={openId === item.id}
                  className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.06]"
                >
                  {openId === item.id && restoreState === "loading" ? <Loader2 className="inline size-3.5 animate-spin" aria-hidden="true" /> : null}
                  {openId === item.id ? "Opened" : "Open"}
                </button>
              </li>
            );
          })}
        </ul>
        {restoreState === "error" ? (
          <p className="mt-2 text-sm text-rose-400" role="alert">
            This analysis could not be loaded.
          </p>
        ) : null}
      </article>

      {restored ? (
        <div className="space-y-4" data-testid="sv-restored">
          {videoUrl ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video ref={videoRef} src={videoUrl} controls playsInline muted className="max-h-[360px] w-full" />
            </div>
          ) : videoNote ? (
            <p className="text-xs text-zinc-500">{videoNote}</p>
          ) : null}
          {restored.analysis ? (
            <SetVisionResultsPanel
              heading={`Saved analysis · ${new Date(restored.analyzedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
              analysis={restored.analysis}
              identity={restored.identity}
              timelineRecorded={restored.timelineRecorded}
              onSeek={videoUrl ? seek : undefined}
            />
          ) : (
            <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-restored-manual">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                Saved review · {new Date(restored.analyzedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-2 break-words text-lg font-black text-white" data-testid="sv-restored-label">
                {restored.identity?.label ?? "Unlabelled review"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {restored.identity ? SOURCE_TEXT[restored.identity.source] : "Exercise not recorded"} · no automated analysis — every rep below was marked by you.
              </p>
            </article>
          )}
          <SetReviewPanel analysis={restored.analysis} review={restored.review} onSeek={videoUrl ? seek : undefined} />
        </div>
      ) : null}
    </section>
  );
}
