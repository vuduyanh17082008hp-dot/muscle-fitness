"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Synthesized ambient layer for the intro — no audio file, no external
 * URL, nothing preloaded. The whole graph is built from oscillators the
 * first time the visitor actually asks for sound, and torn down again
 * the moment they turn it off.
 *
 * Two rules drive the shape of this hook:
 *  - Sound is OFF by default and can only ever start after a real
 *    click/tap/keypress, so an AudioContext is never created (let alone
 *    resumed) without user activation.
 *  - A stored "on" preference is an intent, not permission. It is read
 *    at that first interaction rather than on mount, which keeps SSR
 *    and the hydration render identical and means a returning visitor
 *    still never gets audio they did not ask for.
 */

/** Matches the try/catch-guarded localStorage convention already used in the shopping list client. */
const STORAGE_KEY = "mf.intro-sound";

/** Deliberately quiet — this sits under a product page, not a trailer. */
const MASTER_LEVEL = 0.07;

const FADE_IN_SECONDS = 1.4;
const FADE_OUT_SECONDS = 0.35;

type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

type IntroAudioGraph = {
  context: AudioContext;
  master: GainNode;
  oscillators: OscillatorNode[];
};

export type IntroAudio = {
  /** Drives the control's label and aria-pressed, and is true only while audio is actually running. */
  enabled: boolean;
  toggle: () => void;
  /** Restrained activation chime. No-op unless the soundscape is already running. */
  playActivationChime: () => void;
};

export function useIntroAudio(): IntroAudio {
  const [enabled, setEnabled] = useState(false);
  const graphRef = useRef<IntroAudioGraph | null>(null);
  const enabledRef = useRef(false);
  const userToggledRef = useRef(false);

  const stop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graphRef.current = null;

    const { context, master, oscillators } = graph;
    const now = context.currentTime;

    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + FADE_OUT_SECONDS);

    window.setTimeout(
      () => {
        for (const oscillator of oscillators) {
          try {
            oscillator.stop();
          } catch {
            // Already stopped — nothing to unwind.
          }
        }
        void context.close();
      },
      (FADE_OUT_SECONDS + 0.1) * 1000,
    );
  }, []);

  const start = useCallback(() => {
    if (graphRef.current) return;

    const AudioContextCtor =
      window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();

    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    // Warm low drone: a root sine plus a quieter detuned fifth, rolled
    // off so nothing above the low-mids ever reaches the output.
    const droneLevel = context.createGain();
    droneLevel.gain.value = 0.55;

    const warmth = context.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = 420;
    warmth.Q.value = 0.6;

    droneLevel.connect(warmth);
    warmth.connect(master);

    const root = context.createOscillator();
    root.type = "sine";
    root.frequency.value = 55;
    root.connect(droneLevel);

    const fifth = context.createOscillator();
    fifth.type = "triangle";
    fifth.frequency.value = 82.41;
    fifth.detune.value = -6;

    const fifthLevel = context.createGain();
    fifthLevel.gain.value = 0.22;
    fifth.connect(fifthLevel);
    fifthLevel.connect(droneLevel);

    // Subtle pulse: a sub-audible LFO breathing the drone's level
    // rather than a rhythmic beat.
    const pulse = context.createOscillator();
    pulse.type = "sine";
    pulse.frequency.value = 0.14;

    const pulseDepth = context.createGain();
    pulseDepth.gain.value = 0.18;
    pulse.connect(pulseDepth);
    pulseDepth.connect(droneLevel.gain);

    root.start();
    fifth.start();
    pulse.start();

    const now = context.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + FADE_IN_SECONDS);

    graphRef.current = { context, master, oscillators: [root, fifth, pulse] };

    // Safe: `enabled` only ever flips on from a user interaction, so the
    // page always has sticky activation by the time this runs.
    void context.resume();
  }, []);

  const playActivationChime = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const { context, master } = graph;
    const origin = context.currentTime + 0.02;

    [880, 1320].forEach((frequency, index) => {
      const at = origin + index * 0.09;

      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.linearRampToValueAtTime(0.5 - index * 0.2, at + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);

      oscillator.connect(envelope);
      envelope.connect(master);

      oscillator.start(at);
      oscillator.stop(at + 0.75);
    });
  }, []);

  const persist = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Private browsing / blocked storage — the control still works,
      // the choice just won't survive a reload.
    }
  }, []);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;

    enabledRef.current = next;
    userToggledRef.current = true;

    setEnabled(next);
    persist(next);
  }, [persist]);

  // The visitor's first click/tap/keypress is both the browser's
  // autoplay unlock and the only point at which a stored preference may
  // be honoured. Listening for `click` (not `pointerdown`) means the
  // control's own handler has already run by the time this fires, so
  // toggling sound on as the very first action is never undone here.
  useEffect(() => {
    const restore = () => {
      if (userToggledRef.current || enabledRef.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      try {
        if (window.localStorage.getItem(STORAGE_KEY) !== "on") return;
      } catch {
        return;
      }

      enabledRef.current = true;
      setEnabled(true);
    };

    const options = { once: true } as const;

    window.addEventListener("click", restore, options);
    window.addEventListener("keydown", restore, options);

    return () => {
      window.removeEventListener("click", restore);
      window.removeEventListener("keydown", restore);
    };
  }, []);

  useEffect(() => {
    if (enabled) start();
    else stop();
  }, [enabled, start, stop]);

  useEffect(() => stop, [stop]);

  return { enabled, toggle, playActivationChime };
}
