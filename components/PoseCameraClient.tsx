"use client";

import dynamic from "next/dynamic";

const PoseCamera = dynamic(
  () => import("@/components/PoseCamera"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-amber-500" />

          <p className="mt-4 text-sm font-medium text-neutral-400">
            Loading AI Camera...
          </p>
        </div>
      </div>
    ),
  },
);

export default function PoseCameraClient() {
  return <PoseCamera />;
}