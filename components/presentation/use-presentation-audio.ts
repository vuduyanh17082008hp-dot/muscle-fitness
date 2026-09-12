import { useEffect, useRef } from "react";

/**
 * Deterministic audio playback (spec Part E §24, §30).
 *
 * "Opening presentation must NOT depend on realtime LLM or realtime
 * TTS. Use deterministic audio." — this hook plays a PRE-GENERATED
 * audio file if one exists at `src`. If it doesn't exist (the
 * expected state right now — see docs/presentation.md "What is real
 * vs demo": no TTS audio has been generated for this pass, since no
 * TTS engine was available to this development session), the
 * `<audio>` element's `onerror` fires, is caught, and playback is
 * silently skipped — the caption (caption-overlay.tsx) is the
 * fallback and the ONLY thing the presentation ever depends on. This
 * hook never throws and never blocks scene advancement on audio
 * success/failure.
 *
 * To add real narration later: drop a matching file at each
 * `audioSrc` path in lib/presentation/script.ts (any TTS engine, or
 * a real recording) — no code changes needed here.
 */
export function usePresentationAudio(src: string | undefined, playing: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!src || !playing) return;

    const audio = new Audio(src);
    audioRef.current = audio;

    audio.play().catch(() => {
      // Expected when no audio file exists yet, or autoplay is
      // blocked — captions carry the presentation regardless.
    });

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [src, playing]);
}
