"use client";

import React from "react";
import { SLIDE_LIST } from "./deck-data";

interface PresentationProgressProps {
  currentIndex: number;
}

export const PresentationProgress: React.FC<PresentationProgressProps> = ({
  currentIndex,
}) => {
  const currentSlide = SLIDE_LIST[currentIndex];
  const totalSlides = SLIDE_LIST.length;
  const progressPercent = ((currentIndex + 1) / totalSlides) * 100;

  return (
    <div className="w-full flex flex-col no-print">
      {/* Progress Bar Line */}
      <div className="w-full h-1 bg-white/10 relative overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#59A9FF] via-[#8D7CFF] to-[#C8FF3D] transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Top Header Rail */}
      <div className="px-8 py-3 bg-[#07090D]/80 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-[#C8FF3D]/10 text-[#C8FF3D] font-bold">
            SECTION: {currentSlide?.section}
          </span>
          <span className="text-[#989FAA]">•</span>
          <span className="text-[#F6F7F9] font-medium">{currentSlide?.title}</span>
        </div>

        <div className="text-xs font-mono font-bold text-[#F6F7F9]">
          <span className="text-[#C8FF3D]">{String(currentIndex + 1).padStart(2, "0")}</span>
          <span className="text-[#989FAA]"> / {String(totalSlides).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
};
