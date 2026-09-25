"use client";

import React from "react";

interface ScreenshotFrameProps {
  src: string;
  alt: string;
  caption?: string;
  aspect?: "16/9" | "4/3" | "square";
  className?: string;
}

export const ScreenshotFrame: React.FC<ScreenshotFrameProps> = ({
  src,
  alt,
  caption,
  className = "",
}) => {
  return (
    <div className={`group relative rounded-xl border border-white/10 overflow-hidden bg-[#11151B] transition-all duration-300 hover:border-[#C8FF3D]/50 hover:shadow-[0_0_30px_rgba(200,255,61,0.15)] ${className}`}>
      <div className="relative w-full aspect-video bg-[#07090D] overflow-hidden">
        {/* Local/export screenshots + data-URI onError fallback — next/image would break both. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
          onError={(e) => {
            // Fallback UI if image file hasn't been rendered yet
            const target = e.currentTarget;
            target.onerror = null;
            target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'><rect width='100%' height='100%' fill='%2311151B'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23989FAA' font-family='sans-serif' font-size='16'>Muscle Fitness Interface</text></svg>";
          }}
        />
      </div>
      {caption && (
        <div className="p-2.5 bg-[#0A0D12] border-t border-white/10 flex items-center justify-between text-xs text-[#989FAA] font-mono">
          <span>{caption}</span>
          <span className="text-[#C8FF3D] font-bold">LIVE</span>
        </div>
      )}
    </div>
  );
};
