"use client";

import { useEffect, useState } from "react";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

const UPDATE_INTERVAL_MS = 150;

/**
 * Dev-only diagnostics for ?motionDebug=1 (spec #84). Reads
 * window.location on mount only — never rendered server-side, so no
 * hydration mismatch. Updates on an interval, not per RAF frame, to
 * keep this cheap (FPS is measured with plain counters, not React
 * state per tick).
 */
export function DebugPanel({ activeChapter }: { activeChapter: string }) {
  const { reducedMotion } = useMotionCapabilities();
  const [enabled, setEnabled] = useState(false);
  const [fps, setFps] = useState(0);

  // Mirrors useMotionCapabilities' subscribe-then-read shape: `read` is
  // both the initial sync and the popstate change handler, so this
  // reads as "subscribe to the URL," not a bare setState-on-mount.
  useEffect(() => {
    const read = () => {
      setEnabled(new URLSearchParams(window.location.search).get("motionDebug") === "1");
    };

    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let frames = 0;
    let rafId = 0;
    const countFrame = () => {
      frames += 1;
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    const interval = window.setInterval(() => {
      setFps(Math.round((frames * 1000) / UPDATE_INTERVAL_MS));
      frames = 0;
    }, UPDATE_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(interval);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className={`${styles.monoLabel} ${styles.debugPanel}`}>
      <p>chapter: {activeChapter}</p>
      <p>fps: {fps}</p>
      <p>reduced-motion: {String(reducedMotion)}</p>
    </div>
  );
}
