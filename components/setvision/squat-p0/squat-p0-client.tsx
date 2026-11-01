"use client";

import dynamic from "next/dynamic";

// MediaPipe and <video> decoding are browser-only; never server-render the analyzer.
const SquatP0Analyzer = dynamic(
  () => import("./squat-p0-analyzer").then((mod) => mod.SquatP0Analyzer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[200px] items-center justify-center rounded-[24px] border border-mf-glass-border bg-mf-glass-surface">
        <p className="text-sm text-mf-glass-text-muted">Loading SetVision…</p>
      </div>
    ),
  },
);

export function SquatP0Client() {
  return <SquatP0Analyzer />;
}
