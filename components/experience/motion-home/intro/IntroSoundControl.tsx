"use client";

import { Volume2, VolumeX } from "lucide-react";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

type IntroSoundControlProps = {
  enabled: boolean;
  onToggle: () => void;
};

/**
 * Discreet but always-visible sound switch. It is a real button with a
 * stable accessible name plus aria-pressed, so the on/off state is
 * never communicated by the icon alone.
 */
export function IntroSoundControl({ enabled, onToggle }: IntroSoundControlProps) {
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label="Intro sound"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--mf-pub-text-secondary)] transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mf-brand)]"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />

      <span className={styles.monoLabel}>{enabled ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
