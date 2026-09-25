"use client";

import React, { useState, useEffect } from "react";
import { SLIDE_LIST } from "./deck-data";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, FileText, Printer } from "lucide-react";

interface SlideNavigationProps {
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showNotes: boolean;
  onToggleNotes: () => void;
}

export const SlideNavigation: React.FC<SlideNavigationProps> = ({
  currentIndex,
  onPrev,
  onNext,
  onJump,
  isFullscreen,
  onToggleFullscreen,
  showNotes,
  onToggleNotes,
}) => {
  const [isIdle, setIsIdle] = useState(false);

  // Auto-hide navigation on idle mouse movement
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handleMouseMove = () => {
      setIsIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), 4000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-500 no-print ${
        isIdle ? "opacity-20 hover:opacity-100" : "opacity-100"
      }`}
    >
      <div className="px-5 py-2.5 rounded-full bg-[#11151B]/90 border border-white/15 backdrop-blur-xl shadow-2xl flex items-center space-x-4">
        {/* Prev Slide Button */}
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-[#F6F7F9] transition-colors"
          title="Previous Slide (Left Arrow / Backspace)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Slide Selector Dropdown */}
        <select
          value={currentIndex}
          onChange={(e) => onJump(Number(e.target.value))}
          className="bg-[#07090D] border border-white/10 text-xs font-mono text-[#C8FF3D] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#C8FF3D] cursor-pointer"
        >
          {SLIDE_LIST.map((slide, idx) => (
            <option key={slide.id} value={idx}>
              {String(slide.number).padStart(2, "0")}. {slide.title}
            </option>
          ))}
        </select>

        {/* Next Slide Button */}
        <button
          onClick={onNext}
          disabled={currentIndex === SLIDE_LIST.length - 1}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-[#F6F7F9] transition-colors"
          title="Next Slide (Right Arrow / Space)"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="w-[1px] h-6 bg-white/15" />

        {/* Present / Fullscreen Button */}
        <button
          onClick={onToggleFullscreen}
          className="p-2 rounded-full hover:bg-white/10 text-[#59A9FF] transition-colors flex items-center space-x-1.5 text-xs font-mono"
          title="Toggle Fullscreen Presentation Mode (F11 / ESC to exit)"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span className="hidden md:inline font-bold">PRESENT</span>
        </button>

        {/* Toggle Speaker Notes */}
        <button
          onClick={onToggleNotes}
          className={`p-2 rounded-full transition-colors ${
            showNotes ? "bg-[#8D7CFF]/20 text-[#8D7CFF]" : "hover:bg-white/10 text-[#989FAA]"
          }`}
          title="Toggle Speaker Notes"
        >
          <FileText className="w-4 h-4" />
        </button>

        {/* Export / Print Mode Link */}
        <a
          href="?print=1"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full hover:bg-white/10 text-[#989FAA] hover:text-[#C8FF3D] transition-colors"
          title="Open Printable 16:9 View (?print=1)"
        >
          <Printer className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};
