"use client";

import { useEffect, useState } from "react";

export function RestTimer({
  seconds,
  active,
  onDone,
}: {
  seconds: number;
  active: boolean;
  onDone?: () => void;
}) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (!active) return;
    setLeft(seconds);
  }, [active, seconds]);

  useEffect(() => {
    if (!active) return;
    if (left <= 0) {
      onDone?.();
      return;
    }
    const timer = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [active, left, onDone]);

  if (!active) return null;

  const m = Math.floor(left / 60);
  const s = left % 60;

  return (
    <div className="border border-lime bg-ink px-4 py-3 text-bone">
      <p className="text-xs uppercase tracking-[0.16em] text-lime">Rest timer</p>
      <p className="font-display text-3xl tracking-wide">
        {m}:{s.toString().padStart(2, "0")}
      </p>
    </div>
  );
}
