"use client";

import dynamic from "next/dynamic";

const PresentationStage = dynamic(
  () => import("./presentation-stage").then((mod) => mod.PresentationStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-video max-h-screen w-full items-center justify-center bg-black">
        <div className="size-10 animate-spin rounded-full border-4 border-white/10 border-t-amber-500" />
      </div>
    ),
  },
);

export function PresentationStageClient() {
  return <PresentationStage />;
}
