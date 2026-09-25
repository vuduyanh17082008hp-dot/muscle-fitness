"use client";

import React from "react";

interface ProductFrameProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export const ProductFrame: React.FC<ProductFrameProps> = ({
  title = "MUSCLE FITNESS — LIVE APP",
  children,
  className = "",
  glow = true,
}) => {
  return (
    <div
      className={`relative rounded-2xl bg-[#07090D] border border-white/15 overflow-hidden shadow-2xl ${
        glow ? "shadow-[0_0_50px_rgba(0,0,0,0.8)] border-[#C8FF3D]/30" : ""
      } ${className}`}
    >
      {/* Window Header Chrome */}
      <div className="h-9 px-4 bg-[#11151B] border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
        </div>
        <span className="text-xs font-mono text-[#989FAA] font-medium tracking-wide">
          {title}
        </span>
        <div className="w-12 text-right">
          <span className="inline-block w-2 h-2 rounded-full bg-[#C8FF3D] animate-pulse" />
        </div>
      </div>

      {/* Frame Body */}
      <div className="relative overflow-hidden">{children}</div>
    </div>
  );
};
