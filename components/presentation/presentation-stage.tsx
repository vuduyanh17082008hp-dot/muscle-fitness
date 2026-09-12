"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { PRESENTATION_SCRIPT } from "@/lib/presentation/script";
import { CaptionOverlay } from "@/components/presentation/caption-overlay";
import { SceneContent } from "@/components/presentation/scene-content";
import { usePresentationAudio } from "@/components/presentation/use-presentation-audio";

/**
 * Presentation Stage (spec Part E §26-27, Part F §31-34).
 *
 * Deterministic, preloaded, reliable, fullscreen-friendly, keyboard-
 * controllable — and crucially, makes NO network calls: every asset
 * this component needs (script, demo data, avatar geometry) is
 * bundled at build time. See docs/presentation.md "Failure-safe" for
 * how this satisfies spec §30 (works with Supabase/network/AI/TTS all
 * down).
 *
 * Keyboard controls:
 *   Space / →   next beat
 *   ←           previous beat
 *   P           play/pause auto-advance
 *   F           toggle fullscreen
 *   Esc         exit fullscreen (browser default)
 */
export function PresentationStage() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beat = PRESENTATION_SCRIPT[index];
  const isLast = index === PRESENTATION_SCRIPT.length - 1;

  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(PRESENTATION_SCRIPT.length - 1, next)));
  }, []);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  usePresentationAudio(beat.audioSrc, playing);

  // Timer-based auto-advance for the intro sequence.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!playing || !beat.autoAdvance || isLast) {
      return;
    }

    timerRef.current = setTimeout(() => {
      setIndex((current) => Math.min(PRESENTATION_SCRIPT.length - 1, current + 1));
    }, beat.durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, playing, beat.autoAdvance, beat.durationMs, isLast]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prev();
      } else if (event.key.toLowerCase() === "p") {
        setPlaying((p) => !p);
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [next, prev]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {
        // Fullscreen can be denied by the browser/OS — the
        // presentation still works fine in a normal window.
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video max-h-screen w-full overflow-hidden bg-black text-white"
    >
      <div className="absolute inset-0">
        <SceneContent scene={beat.id} />
      </div>

      <CaptionOverlay text={beat.caption} />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-4">
        <div className="flex flex-1 gap-1">
          {PRESENTATION_SCRIPT.map((b, i) => (
            <div
              key={b.id + i}
              className={
                i <= index ? "h-1 flex-1 rounded-full bg-amber-400" : "h-1 flex-1 rounded-full bg-white/15"
              }
            />
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white hover:bg-white/10"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white hover:bg-white/10"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white hover:bg-white/10"
          >
            <SkipForward className="size-4" />
          </button>
        </div>

        <p className="hidden text-xs text-zinc-500 sm:block">
          Space/→ next · ← back · P play/pause · F fullscreen
        </p>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          className="grid size-10 place-items-center rounded-full border border-white/15 text-white hover:bg-white/10"
        >
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  );
}
