"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Plus, RotateCcw, Square, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  AnalysisCancelledError,
  SQUAT_P0,
  analyzeSquatObservations,
  applyCorrections,
  sampleObservations,
  validateDecodedMedia,
  validateVideoFile,
  type QualityCheck,
  type RepCorrection,
  type RepEvent,
  type RepOutcome,
  type RepReason,
  type SamplerStats,
  type SquatAnalysis,
  type TrackingLossInterval,
} from "@/lib/setvision/squat-p0";
import { cn } from "@/lib/utils";
import {
  createPoseLandmarker,
  openDecodedVideo,
  releaseVideo,
  seekVideo,
  toObservationParts,
  yieldToMain,
} from "@/components/setvision/squat-p0/browser-media";

type Run =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "rejected"; message: string }
  | { kind: "ready" }
  | { kind: "loading_model" }
  | { kind: "processing"; done: number; total: number }
  | { kind: "cancelled" }
  | { kind: "failed"; message: string }
  | { kind: "done"; analysis: SquatAnalysis; stats: SamplerStats & { delegate: string } };

type FileMeta = { name: string; size: number; durationSec: number; width: number; height: number };

const OUTCOME_TONE: Record<RepOutcome | "NOT_A_REP", StatusTone> = {
  COMPLETED: "good",
  PARTIAL: "warning",
  UNCERTAIN: "info",
  NOT_A_REP: "neutral",
};
const OUTCOME_LABEL: Record<RepOutcome | "NOT_A_REP", string> = {
  COMPLETED: "Completed",
  PARTIAL: "Partial",
  UNCERTAIN: "Uncertain",
  NOT_A_REP: "Not a rep",
};
const OUTCOME_BAR: Record<RepOutcome, string> = {
  COMPLETED: "bg-mf-success",
  PARTIAL: "bg-mf-warning",
  UNCERTAIN: "bg-mf-cyan",
};
const REASON_TEXT: Record<RepReason, string> = {
  below_cycle_flexion: `Knee angle never went below ${SQUAT_P0.cycleFlexionMaxDeg}° (2D), so this was a smaller movement cycle.`,
  tracking_gap: "Tracking dropped out during this cycle.",
  tracking_lost: "Tracking was lost before this cycle finished.",
  onset_not_observed: "The cycle began before the first usable frame.",
  video_ended_mid_cycle: "The video ended before this cycle finished.",
  implausibly_fast: "Faster than a bodyweight squat plausibly moves; likely a tracking artefact.",
};
const ISSUE_TEXT: Record<TrackingLossInterval["issue"], string> = {
  invalid_timestamp: "invalid timestamps",
  stale_frame: "video could not be decoded here",
  no_pose: "no person detected",
  multiple_people: "more than one person",
  low_visibility: "joints not clearly visible",
  out_of_frame: "body partly out of frame",
  discontinuity: "tracking jumped",
};
const STATUS_LABEL: Record<QualityCheck["status"], string> = {
  IMPLEMENTED_AND_MEASURED: "Measured",
  HEURISTIC_ONLY: "Heuristic",
  NOT_IMPLEMENTED: "Not implemented",
};
const RESULT_TONE: Record<QualityCheck["result"], StatusTone> = {
  pass: "good",
  warn: "warning",
  fail: "critical",
  not_assessed: "neutral",
};

function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

const card = "rounded-[24px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6";
const eyebrow = "text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted";

export function SquatP0Analyzer() {
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [corrections, setCorrections] = useState<RepCorrection[]>([]);
  const [nowMs, setNowMs] = useState(0);

  // Release the object URL whenever it is replaced or the page unmounts.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  // Stop any in-flight analysis on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    abortRef.current?.abort();
    setCorrections([]);
    setMeta(null);
    setFile(null);
    setUrl(null);

    const rejection = validateVideoFile(picked);
    if (rejection) {
      setRun({ kind: "rejected", message: rejection.message });
      return;
    }

    setRun({ kind: "checking" });
    const objectUrl = URL.createObjectURL(picked);
    try {
      const { video, meta: decoded } = await openDecodedVideo(objectUrl);
      releaseVideo(video);
      const bad = validateDecodedMedia(decoded);
      if (bad) {
        URL.revokeObjectURL(objectUrl);
        setRun({ kind: "rejected", message: bad.message });
        return;
      }
      setFile(picked);
      setMeta({ name: picked.name, size: picked.size, ...decoded });
      setUrl(objectUrl);
      setRun({ kind: "ready" });
    } catch {
      URL.revokeObjectURL(objectUrl);
      setRun({
        kind: "rejected",
        message: "This browser could not decode that video (unsupported codec or a damaged file). Try an MP4 (H.264) recording.",
      });
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!url || !meta) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setCorrections([]);
    setRun({ kind: "loading_model" });

    let landmarker: Awaited<ReturnType<typeof createPoseLandmarker>>["landmarker"] | null = null;
    let video: HTMLVideoElement | null = null;
    try {
      const created = await createPoseLandmarker();
      landmarker = created.landmarker;
      if (controller.signal.aborted) throw new AnalysisCancelledError();
      const opened = await openDecodedVideo(url, controller.signal);
      video = opened.video;
      const v = video;
      const lm = landmarker;
      const durationMs = Math.floor(opened.meta.durationSec * 1000);

      const { observations, stats } = await sampleObservations({
        durationMs,
        signal: controller.signal,
        seek: (ms) => seekVideo(v, ms, controller.signal),
        detect: (ts) => toObservationParts(lm.detectForVideo(v, ts), v.videoWidth, v.videoHeight),
        onProgress: ({ done, total }) => setRun({ kind: "processing", done, total }),
        yieldToMain,
      });
      const analysis = analyzeSquatObservations(observations, durationMs);
      setRun({ kind: "done", analysis, stats: { ...stats, delegate: created.delegate } });
    } catch (error) {
      if (error instanceof AnalysisCancelledError || (error instanceof DOMException && error.name === "AbortError")) {
        setRun({ kind: "cancelled" });
      } else {
        console.error("[SETVISION P0] analysis failed", error);
        const message =
          error instanceof Error && error.message.startsWith("decode_")
            ? "The video stopped decoding part-way through. It may be damaged; try re-exporting it."
            : "The pose model could not run in this browser (it needs WebAssembly and a network connection to download the model the first time).";
        setRun({ kind: "failed", message });
      }
    } finally {
      landmarker?.close();
      if (video) releaseVideo(video);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [meta, url]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const seek = useCallback((ms: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.currentTime = ms / 1000;
    p.focus();
  }, []);

  const busy = run.kind === "checking" || run.kind === "loading_model" || run.kind === "processing";
  const analysis = run.kind === "done" ? run.analysis : null;

  const downloadJson = useCallback(() => {
    if (run.kind !== "done" || !meta) return;
    const payload = {
      kind: "setvision-p0-squat-analysis",
      generatedAt: new Date().toISOString(),
      file: { name: meta.name, sizeBytes: meta.size, durationSec: meta.durationSec, width: meta.width, height: meta.height },
      processing: run.stats,
      analysis: run.analysis,
      userCorrections: corrections,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${meta.name.replace(/\.[^.]+$/, "")}.setvision-p0.json`;
    a.click();
    URL.revokeObjectURL(href);
  }, [corrections, meta, run]);

  return (
    <div className="space-y-6">
      <section className={card} aria-labelledby="sv-upload">
        <p id="sv-upload" className={eyebrow}>1 · Choose a clip</p>
        <ul className="mt-3 grid gap-1 text-sm text-mf-glass-text-secondary sm:grid-cols-2">
          <li>Bodyweight squat, camera side-on</li>
          <li>Fixed camera (tripod or propped phone)</li>
          <li>One person, whole body in frame</li>
          <li>Up to {SQUAT_P0.maxDurationMs / 1000} s and {SQUAT_P0.maxFileBytes / 1048576} MB</li>
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative inline-flex h-11 cursor-pointer items-center gap-2 rounded-[14px] bg-mf-action px-4 text-sm font-semibold text-mf-action-ink hover:bg-mf-action-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mf-focus has-[:focus-visible]:ring-offset-2">
            <Upload className="size-4" aria-hidden="true" />
            {file ? "Choose another video" : "Choose video"}
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleFile}
              disabled={busy}
              data-testid="sv-file-input"
            />
          </label>
          {meta ? (
            <p className="min-w-0 truncate text-sm text-mf-glass-text-secondary" data-testid="sv-file-meta">
              <Film className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
              {meta.name} · {meta.durationSec.toFixed(1)} s · {meta.width}×{meta.height}
            </p>
          ) : null}
        </div>

        <div aria-live="polite" className="mt-4 empty:hidden">
          {run.kind === "checking" ? <p className="text-sm text-mf-glass-text-secondary">Checking the video decodes…</p> : null}
          {run.kind === "rejected" ? (
            <p role="alert" className="rounded-xl border border-mf-danger/30 bg-mf-danger/5 p-3 text-sm text-mf-danger" data-testid="sv-rejected">
              {run.message}
            </p>
          ) : null}
        </div>

        {url ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-mf-glass-border bg-black">
            <video
              ref={playerRef}
              src={url}
              controls
              playsInline
              muted
              onTimeUpdate={(e) => setNowMs(e.currentTarget.currentTime * 1000)}
              onSeeked={(e) => setNowMs(e.currentTarget.currentTime * 1000)}
              className="mx-auto max-h-[60vh] w-full"
              aria-label="Your uploaded clip"
              data-testid="sv-player"
            />
          </div>
        ) : null}

        {url ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {run.kind === "loading_model" || run.kind === "processing" ? (
              <Button variant="secondary" onClick={cancel} data-testid="sv-cancel">
                <Square className="size-4" aria-hidden="true" /> Cancel analysis
              </Button>
            ) : (
              <Button onClick={analyze} disabled={busy} data-testid="sv-analyze">
                {run.kind === "done" ? <RotateCcw className="size-4" aria-hidden="true" /> : null}
                {run.kind === "done" ? "Analyse again" : "Analyse squats"}
              </Button>
            )}
            <p className="text-xs text-mf-glass-text-muted">
              Runs on this device. The video is never uploaded or saved; the pose model (~9 MB) downloads once.
            </p>
          </div>
        ) : null}

        <div aria-live="polite" className="mt-4 empty:hidden">
          {run.kind === "loading_model" ? <p className="text-sm text-mf-glass-text-secondary">Loading the pose model…</p> : null}
          {run.kind === "processing" ? (
            <div>
              <div
                role="progressbar"
                aria-label="Analysing frames"
                aria-valuemin={0}
                aria-valuemax={run.total}
                aria-valuenow={run.done}
                className="h-2 overflow-hidden rounded-full bg-mf-glass-bg-deep"
              >
                <div className="h-full bg-mf-action transition-[width]" style={{ width: `${(run.done / run.total) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-mf-glass-text-muted" data-testid="sv-progress">
                Frame {run.done} of {run.total}
              </p>
            </div>
          ) : null}
          {run.kind === "cancelled" ? (
            <p className="text-sm text-mf-glass-text-secondary" data-testid="sv-cancelled">
              Analysis cancelled. Nothing was kept.
            </p>
          ) : null}
          {run.kind === "failed" ? (
            <p role="alert" className="rounded-xl border border-mf-danger/30 bg-mf-danger/5 p-3 text-sm text-mf-danger" data-testid="sv-failed">
              {run.message}
            </p>
          ) : null}
        </div>
      </section>

      {analysis && run.kind === "done" ? (
        <Results
          analysis={analysis}
          stats={run.stats}
          corrections={corrections}
          setCorrections={setCorrections}
          nowMs={nowMs}
          onSeek={seek}
          onDownload={downloadJson}
        />
      ) : null}
    </div>
  );
}

function Results({
  analysis,
  stats,
  corrections,
  setCorrections,
  nowMs,
  onSeek,
  onDownload,
}: {
  analysis: SquatAnalysis;
  stats: SamplerStats & { delegate: string };
  corrections: RepCorrection[];
  setCorrections: React.Dispatch<React.SetStateAction<RepCorrection[]>>;
  nowMs: number;
  onSeek: (ms: number) => void;
  onDownload: () => void;
}) {
  const corrected = useMemo(() => applyCorrections(analysis.events, corrections), [analysis.events, corrections]);
  const abstained = analysis.status === "INSUFFICIENT_EVIDENCE";

  const relabel = (eventId: string, value: string) =>
    setCorrections((prev) => {
      const rest = prev.filter((c) => !(c.kind === "relabel" && c.eventId === eventId));
      if (value === "detected") return rest;
      return [...rest, { kind: "relabel", eventId, outcome: value as RepOutcome | "NOT_A_REP", by: "user", atIso: new Date().toISOString() }];
    });
  const addAtPlayhead = () =>
    setCorrections((prev) => [
      ...prev,
      { kind: "added", id: `user-${Date.now()}`, atMs: Math.round(nowMs), outcome: "COMPLETED", by: "user", atIso: new Date().toISOString() },
    ]);

  return (
    <>
      <section className={card} aria-labelledby="sv-summary" data-testid="sv-results">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p id="sv-summary" className={eyebrow}>2 · What was observed</p>
            <h2 className="mt-1 text-xl font-black text-mf-glass-text">
              {abstained ? "Not enough evidence to count" : "Movement cycles"}
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={onDownload} data-testid="sv-download">
            <Download className="size-4" aria-hidden="true" /> Download analysis (JSON)
          </Button>
        </div>

        {abstained ? (
          <div className="mt-4 rounded-xl border border-mf-warning/30 bg-mf-warning/5 p-4" data-testid="sv-insufficient">
            <p className="text-sm font-semibold text-mf-glass-text">No count is shown because:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mf-glass-text-secondary">
              {analysis.insufficientReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-2 min-[400px]:grid-cols-3 min-[400px]:gap-3" data-testid="sv-counts">
              {(["completed", "partial", "uncertain"] as const).map((k) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-2xl border border-mf-glass-border bg-mf-glass-bg px-4 py-2 min-[400px]:block min-[400px]:p-3 min-[400px]:text-center"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-mf-glass-text-muted">{k}</dt>
                  <dd className="text-2xl font-black tabular-nums text-mf-glass-text min-[400px]:mt-1 min-[400px]:text-3xl" data-testid={`sv-count-${k}`}>
                    {analysis.counts![k]}
                  </dd>
                </div>
              ))}
            </dl>
            {corrected.corrected ? (
              <p className="mt-3 text-sm text-mf-glass-text-secondary" data-testid="sv-corrected-counts">
                With your corrections: {corrected.counts.completed} completed · {corrected.counts.partial} partial ·{" "}
                {corrected.counts.uncertain} uncertain. Your corrections are your own judgement, not an expert review.
              </p>
            ) : null}
          </>
        )}
        <p className="mt-3 text-xs text-mf-glass-text-muted">
          “Completed” means a fully observed squat-shaped movement cycle. It does not judge depth, technique or safety.
        </p>

        <Timeline analysis={analysis} nowMs={nowMs} onSeek={onSeek} />
      </section>

      {!abstained ? (
        <section className={card} aria-labelledby="sv-events">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="sv-events" className={eyebrow}>3 · Review each cycle</p>
            <Button variant="secondary" size="sm" onClick={addAtPlayhead} data-testid="sv-add-rep">
              <Plus className="size-4" aria-hidden="true" /> Add missed rep at {fmt(nowMs)}
            </Button>
          </div>
          {analysis.events.length === 0 && corrected.items.length === 0 ? (
            <p className="mt-3 text-sm text-mf-glass-text-secondary">No movement cycles were detected.</p>
          ) : null}
          <ol className="mt-4 space-y-3" data-testid="sv-event-list">
            {corrected.items.map((item) => {
              const ev = analysis.events.find((e) => e.id === item.id);
              return ev ? (
                <EventRow key={item.id} ev={ev} outcome={item.outcome} corrected={item.correctedByUser} onSeek={onSeek} onRelabel={relabel} />
              ) : (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-mf-glass-border-strong p-3">
                  <StatusBadge label="Added by you" tone="neutral" />
                  <button type="button" className="text-sm font-semibold text-mf-glass-text underline-offset-4 hover:underline" onClick={() => onSeek(item.atMs)}>
                    {fmt(item.atMs)}
                  </button>
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-mf-glass-text-muted hover:bg-mf-glass-hover"
                    onClick={() => setCorrections((prev) => prev.filter((c) => !(c.kind === "added" && c.id === item.id)))}
                    aria-label={`Remove the rep you added at ${fmt(item.atMs)}`}
                  >
                    <X className="size-3.5" aria-hidden="true" /> Remove
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className={card} aria-labelledby="sv-quality">
        <p id="sv-quality" className={eyebrow}>{abstained ? "3" : "4"} · Evidence quality and limits</p>
        <ul className="mt-4 divide-y divide-mf-glass-border" data-testid="sv-quality-list">
          {analysis.quality.checks.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:w-64">
                <span className="text-sm font-semibold text-mf-glass-text">{c.label}</span>
              </div>
              <div className="flex shrink-0 gap-2 sm:w-56">
                <StatusBadge label={c.result.replace("_", " ")} tone={RESULT_TONE[c.result]} />
                <StatusBadge label={STATUS_LABEL[c.status]} tone="neutral" />
              </div>
              <p className="min-w-0 text-sm text-mf-glass-text-secondary">{c.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mf-glass-text-muted">
          {analysis.quality.validFrames} of {analysis.quality.sampledFrames} sampled frames usable · side analysed:{" "}
          {analysis.quality.lockedSide ?? "none"} · {stats.frames} frames in {(stats.totalMs / 1000).toFixed(1)} s on this device (
          {stats.delegate}, mean inference {stats.meanInferenceMs.toFixed(0)} ms) · engine {analysis.engineVersion}
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-mf-glass-text-secondary">
          {analysis.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function EventRow({
  ev,
  outcome,
  corrected,
  onSeek,
  onRelabel,
}: {
  ev: RepEvent;
  outcome: RepOutcome | "NOT_A_REP";
  corrected: boolean;
  onSeek: (ms: number) => void;
  onRelabel: (eventId: string, value: string) => void;
}) {
  const descent = ev.phases.find((p) => p.phase === "descent");
  const ascent = ev.phases.find((p) => p.phase === "ascent");
  return (
    <li className="rounded-2xl border border-mf-glass-border p-3 sm:p-4" data-testid="sv-event">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-black text-mf-glass-text">Cycle {ev.index}</span>
        <StatusBadge label={OUTCOME_LABEL[outcome]} tone={OUTCOME_TONE[outcome]} />
        {corrected ? <StatusBadge label={`Corrected by you · detected ${OUTCOME_LABEL[ev.outcome]}`} tone="neutral" /> : null}
        <button
          type="button"
          onClick={() => onSeek(ev.startMs)}
          className="ml-auto rounded-lg px-2 py-1 text-sm font-semibold tabular-nums text-mf-glass-text underline-offset-4 hover:bg-mf-glass-hover hover:underline"
          aria-label={`Play cycle ${ev.index} from ${fmt(ev.startMs)}`}
          data-testid="sv-event-seek"
        >
          {fmt(ev.startMs)} – {fmt(ev.endMs)}
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-mf-glass-text-secondary sm:grid-cols-4">
        <div>
          <dt className="inline">Turning point </dt>
          <dd className="inline">
            {ev.bottomMs === null ? "—" : (
              <button type="button" className="font-semibold text-mf-glass-text underline-offset-4 hover:underline" onClick={() => onSeek(ev.bottomMs!)}>
                {fmt(ev.bottomMs)}
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt className="inline">Min 2D knee angle </dt>
          <dd className="inline font-semibold text-mf-glass-text">{ev.features.minKneeDeg === null ? "—" : `${Math.round(ev.features.minKneeDeg)}°`}</dd>
        </div>
        <div>
          <dt className="inline">Down / up </dt>
          <dd className="inline font-semibold text-mf-glass-text">
            {descent && ascent ? `${((descent.endMs - descent.startMs) / 1000).toFixed(1)} s / ${((ascent.endMs - ascent.startMs) / 1000).toFixed(1)} s` : "not observed"}
          </dd>
        </div>
        <div>
          <dt className="inline">Frames </dt>
          <dd className="inline font-semibold text-mf-glass-text">
            {ev.features.validFrames}
            {ev.features.reversals ? ` · ${ev.features.reversals} bounce` : ""}
          </dd>
        </div>
      </dl>
      {ev.reasons.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-mf-glass-text-secondary">
          {ev.reasons.map((r) => (
            <li key={r}>• {REASON_TEXT[r]}</li>
          ))}
        </ul>
      ) : null}
      <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mf-glass-text-muted">
        Your call
        <select
          className="h-9 rounded-lg border border-mf-glass-border-strong bg-mf-glass-surface px-2 text-sm text-mf-glass-text"
          value={corrected ? outcome : "detected"}
          onChange={(e) => onRelabel(ev.id, e.target.value)}
          data-testid="sv-relabel"
        >
          <option value="detected">Keep as detected ({OUTCOME_LABEL[ev.outcome]})</option>
          <option value="COMPLETED">Completed</option>
          <option value="PARTIAL">Partial</option>
          <option value="UNCERTAIN">Uncertain</option>
          <option value="NOT_A_REP">Not a rep</option>
        </select>
      </label>
    </li>
  );
}

function Timeline({ analysis, nowMs, onSeek }: { analysis: SquatAnalysis; nowMs: number; onSeek: (ms: number) => void }) {
  const d = Math.max(1, analysis.durationMs);
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / d) * 100))}%`;
  const significantLoss = analysis.trackingLoss.filter((l) => l.severity !== "bridged");

  // Knee-angle trace (smoothed series the state machine used), 60°–180° → SVG y.
  const y = (deg: number) => 100 - ((Math.min(180, Math.max(60, deg)) - 60) / 120) * 100;
  const paths: string[] = [];
  let cur: string[] = [];
  for (const p of analysis.series) {
    if (p.kneeDeg === null) {
      if (cur.length > 1) paths.push(cur.join(" "));
      cur = [];
    } else cur.push(`${((p.t / d) * 1000).toFixed(1)},${y(p.kneeDeg).toFixed(1)}`);
  }
  if (cur.length > 1) paths.push(cur.join(" "));

  return (
    <div className="mt-6" data-testid="sv-timeline">
      <p className="text-xs font-semibold text-mf-glass-text-muted">Timeline · tap a cycle to play it</p>
      <div className="relative mt-2 h-24 overflow-hidden rounded-xl border border-mf-glass-border bg-mf-glass-bg">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {[SQUAT_P0.standMinDeg, SQUAT_P0.cycleFlexionMaxDeg].map((deg) => (
            <line key={deg} x1="0" x2="1000" y1={y(deg)} y2={y(deg)} className="stroke-mf-glass-border-strong" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
          ))}
          {paths.map((pts, i) => (
            <polyline key={i} points={pts} fill="none" className="stroke-mf-glass-text" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {significantLoss.map((l, i) => (
          <div
            key={`loss-${i}`}
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(180,35,24,0.18)_0_6px,transparent_6px_12px)]"
            style={{ left: pct(l.startMs), width: pct(l.endMs - l.startMs) }}
            aria-hidden="true"
          />
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-mf-glass-text" style={{ left: pct(nowMs) }} aria-hidden="true" />
      </div>
      <div className="relative mt-1 h-7" role="group" aria-label="Detected cycles on the timeline">
        {analysis.events.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onSeek(e.startMs)}
            className={cn("absolute top-0 h-7 min-w-2 rounded-md opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-mf-focus", OUTCOME_BAR[e.outcome])}
            style={{ left: pct(e.startMs), width: pct(e.endMs - e.startMs) }}
            aria-label={`Cycle ${e.index}, ${OUTCOME_LABEL[e.outcome]}, ${fmt(e.startMs)} to ${fmt(e.endMs)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-mf-glass-text-muted">
        <span>0:00.0</span>
        <span>{fmt(d)}</span>
      </div>
      <p className="mt-2 text-xs text-mf-glass-text-muted">
        Line: smoothed 2D knee angle (dashed: {SQUAT_P0.standMinDeg}° standing band, {SQUAT_P0.cycleFlexionMaxDeg}° cycle threshold). Hatched: tracking lost.
      </p>
      {significantLoss.length ? (
        <ul className="mt-3 space-y-1 text-sm text-mf-glass-text-secondary" data-testid="sv-tracking-loss">
          {significantLoss.map((l, i) => (
            <li key={i}>
              <button type="button" className="font-semibold tabular-nums text-mf-glass-text underline-offset-4 hover:underline" onClick={() => onSeek(l.startMs)}>
                {fmt(l.startMs)} – {fmt(l.endMs)}
              </button>{" "}
              tracking {l.severity === "lost" ? "lost" : "interrupted"}: {ISSUE_TEXT[l.issue]}
              {l.severity === "lost" ? " — any reps in this span cannot be counted." : "."}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
