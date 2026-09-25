"use client";

import React, { useState } from "react";
import { PresentationProgress } from "./PresentationProgress";
import { SlideNavigation } from "./SlideNavigation";
import { SLIDE_LIST } from "./deck-data";

interface DeckShellProps {
  children: React.ReactNode;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  isPrintMode?: boolean;
  isNoTextMode?: boolean;
}

export const DeckShell: React.FC<DeckShellProps> = ({
  children,
  currentIndex,
  onPrev,
  onNext,
  onJump,
  isPrintMode = false,
  isNoTextMode = false,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const currentNotes = SLIDE_LIST[currentIndex]?.notes;

  if (isPrintMode) {
    return (
      <div className={`w-full bg-[#050607] text-[#F6F7F9] min-h-screen ${isNoTextMode ? "no-text-mode" : ""}`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`deck-container relative w-screen h-screen flex flex-col bg-[#050607] text-[#F6F7F9] overflow-hidden ${isNoTextMode ? "no-text-mode" : ""}`}>
      {/* Top Header & Progress */}
      <PresentationProgress currentIndex={currentIndex} />

      {/* Main Slide Stage Viewport */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden p-4 md:p-8">
        <div className="w-full h-full max-w-[1920px] max-h-[1080px] aspect-video relative flex items-center justify-center shadow-2xl rounded-2xl overflow-hidden border border-white/10 bg-[#07090D]">
          {children}
        </div>
      </main>

      {/* Speaker Notes Drawer (Togglable) */}
      {showNotes && currentNotes && (
        <div className="absolute top-16 right-6 w-96 p-4 rounded-xl bg-[#11151B]/95 border border-[#8D7CFF]/50 shadow-2xl backdrop-blur-xl z-50 text-xs text-[#F6F7F9] no-print">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 font-mono font-bold text-[#8D7CFF]">
            <span>SPEAKER NOTES ({SLIDE_LIST[currentIndex]?.durationSec}s)</span>
            <button onClick={() => setShowNotes(false)} className="text-[#989FAA] hover:text-white">✕</button>
          </div>
          <p className="leading-relaxed font-sans">{currentNotes}</p>
        </div>
      )}

      {/* Floating Bottom Control Bar */}
      <SlideNavigation
        currentIndex={currentIndex}
        onPrev={onPrev}
        onNext={onNext}
        onJump={onJump}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        showNotes={showNotes}
        onToggleNotes={() => setShowNotes(!showNotes)}
      />
    </div>
  );
};
