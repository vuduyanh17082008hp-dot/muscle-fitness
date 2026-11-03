"use client";

import dynamic from "next/dynamic";

// Camera, MediaPipe and requestVideoFrameCallback are browser-only; never server-render.
const LiveSquatCoach = dynamic(() => import("./live-squat-coach").then((mod) => mod.LiveSquatCoach), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center rounded-[24px] border border-mf-glass-border bg-mf-glass-surface">
      <p className="text-sm text-mf-glass-text-muted">Loading live Form Coach…</p>
    </div>
  ),
});

export function LiveSquatClient() {
  return <LiveSquatCoach />;
}
