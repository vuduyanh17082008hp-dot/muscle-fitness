"use client";

import React from "react";

export const AmbientGrid: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-20">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="spatial-grid-pattern"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
            />
            <circle cx="0" cy="0" r="1.5" fill="rgba(200, 255, 61, 0.3)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#spatial-grid-pattern)" />
      </svg>
      <div className="absolute inset-0 bg-radial-vignette bg-gradient-to-t from-[#050607] via-transparent to-[#050607] pointer-events-none" />
    </div>
  );
};
