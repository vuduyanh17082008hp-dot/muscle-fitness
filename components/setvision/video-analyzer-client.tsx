"use client";

import dynamic from "next/dynamic";

const VideoAnalyzer = dynamic(
  () => import("./video-analyzer").then((mod) => mod.VideoAnalyzer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-amber-500" />
          <p className="mt-4 text-sm font-medium text-neutral-400">Loading SetVision…</p>
        </div>
      </div>
    ),
  },
);

export function VideoAnalyzerClient() {
  return <VideoAnalyzer />;
}
