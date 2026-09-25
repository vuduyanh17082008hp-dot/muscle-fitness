"use client";

import { useSyncExternalStore } from "react";

import {
  MOTIVATION_LAST_KEY,
  MOTIVATION_PREF_KEY,
  selectMotivationLine,
  type MotivationContext,
  type MotivationPreference,
} from "@/lib/motivation";

function readPreference(): MotivationPreference {
  const enabled = window.localStorage.getItem(MOTIVATION_PREF_KEY);
  const last = window.localStorage.getItem(MOTIVATION_LAST_KEY);
  const parsed = last ? (JSON.parse(last) as { date?: string; key?: string }) : null;
  return {
    enabled: enabled === null ? true : enabled !== "0",
    lastDate: parsed?.date ?? null,
    lastKey: parsed?.key ?? null,
  };
}

const motivationListeners = new Set<() => void>();

function emitMotivation() {
  for (const listener of motivationListeners) listener();
}

function subscribeMotivation(listener: () => void) {
  motivationListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    motivationListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

let primedLine: { cacheKey: string; line: string | null } | null = null;

function clientLine(contextKey: string, date: string): string | null {
  const cacheKey = `${contextKey}|${date}`;
  if (primedLine?.cacheKey === cacheKey) return primedLine.line;
  const selected = selectMotivationLine({
    contexts: contextKey ? (contextKey.split(",") as MotivationContext[]) : [],
    localDate: date,
    preference: readPreference(),
  });
  if (selected) {
    window.localStorage.setItem(
      MOTIVATION_LAST_KEY,
      JSON.stringify({ date, key: selected.key }),
    );
  }
  primedLine = { cacheKey, line: selected?.line ?? null };
  return primedLine.line;
}

export function MotivationLine({
  contexts,
  localDate,
  className,
}: {
  contexts: MotivationContext[];
  localDate?: string;
  className?: string;
}) {
  const contextKey = contexts.join(",");
  const date = localDate ?? new Date().toISOString().slice(0, 10);
  const line = useSyncExternalStore(
    subscribeMotivation,
    () => clientLine(contextKey, date),
    () => null,
  );

  if (!line) return null;

  return (
    <p className={className ?? "mt-4 text-sm leading-6 text-mf-glass-text-secondary"} data-motivation="true">
      {line}
    </p>
  );
}

export function MotivationPreferenceToggle() {
  const enabled = useSyncExternalStore(
    subscribeMotivation,
    () => window.localStorage.getItem(MOTIVATION_PREF_KEY) !== "0",
    () => true,
  );

  return (
    <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-mf-glass-border bg-mf-glass-bg-deep px-4 py-3">
      <span className="text-sm text-mf-glass-text">Motivational coaching</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => {
          window.localStorage.setItem(MOTIVATION_PREF_KEY, enabled ? "0" : "1");
          emitMotivation();
        }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-mf-glass-border px-3 text-xs font-bold uppercase tracking-wide text-mf-glass-text"
      >
        {enabled ? "On" : "Off"}
      </button>
    </label>
  );
}
