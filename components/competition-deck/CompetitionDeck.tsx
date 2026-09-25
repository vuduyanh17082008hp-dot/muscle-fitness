"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DeckShell } from "./DeckShell";
import { Slide } from "./Slide";
import { SLIDE_LIST } from "./deck-data";
import "./competition-deck.css";

// Import all 18 Slide Components
import { Slide01Opening } from "./slides/Slide01Opening";
import { Slide02Challenge } from "./slides/Slide02Challenge";
import { Slide03Problem } from "./slides/Slide03Problem";
import { Slide04Users } from "./slides/Slide04Users";
import { Slide05Solution } from "./slides/Slide05Solution";
import { Slide06Ecosystem } from "./slides/Slide06Ecosystem";
import { Slide07WorkingProduct } from "./slides/Slide07WorkingProduct";
import { Slide08DemoFlow } from "./slides/Slide08DemoFlow";
import { Slide09Dante } from "./slides/Slide09Dante";
import { Slide10AIPipeline } from "./slides/Slide10AIPipeline";
import { Slide11Evidence } from "./slides/Slide11Evidence";
import { Slide12Safety } from "./slides/Slide12Safety";
import { Slide13Accessibility } from "./slides/Slide13Accessibility";
import { Slide14Architecture } from "./slides/Slide14Architecture";
import { Slide15ResponsibleAI } from "./slides/Slide15ResponsibleAI";
import { Slide16SurpriseFeatures } from "./slides/Slide16SurpriseFeatures";
import { Slide17Impact } from "./slides/Slide17Impact";
import { Slide18Closing } from "./slides/Slide18Closing";

export const CompetitionDeck: React.FC<{
  isPrintMode?: boolean;
  isNoTextMode?: boolean;
}> = ({ isPrintMode = false, isNoTextMode = false }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const totalSlides = SLIDE_LIST.length;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const jumpToSlide = useCallback((index: number) => {
    if (index >= 0 && index < totalSlides) {
      setCurrentIndex(index);
    }
  }, [totalSlides]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (isPrintMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is inside an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case "ArrowRight":
        case "Space":
        case "PageDown":
          e.preventDefault();
          nextSlide();
          break;
        case "ArrowLeft":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          prevSlide();
          break;
        case "Home":
          e.preventDefault();
          jumpToSlide(0);
          break;
        case "End":
          e.preventDefault();
          jumpToSlide(totalSlides - 1);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide, jumpToSlide, totalSlides, isPrintMode]);

  // Render list of slide components mapped by index
  const slideComponents = [
    <Slide01Opening key="01" />,
    <Slide02Challenge key="02" />,
    <Slide03Problem key="03" />,
    <Slide04Users key="04" />,
    <Slide05Solution key="05" />,
    <Slide06Ecosystem key="06" />,
    <Slide07WorkingProduct key="07" />,
    <Slide08DemoFlow key="08" />,
    <Slide09Dante key="09" />,
    <Slide10AIPipeline key="10" />,
    <Slide11Evidence key="11" />,
    <Slide12Safety key="12" />,
    <Slide13Accessibility key="13" />,
    <Slide14Architecture key="14" />,
    <Slide15ResponsibleAI key="15" />,
    <Slide16SurpriseFeatures key="16" />,
    <Slide17Impact key="17" />,
    <Slide18Closing key="18" />,
  ];

  // Print Mode Rendering: Display all 18 slides on a single scrollable page for PDF printing
  if (isPrintMode) {
    return (
      <DeckShell currentIndex={0} onPrev={() => {}} onNext={() => {}} onJump={() => {}} isPrintMode={true} isNoTextMode={isNoTextMode}>
        <div className={`flex flex-col space-y-0 w-full bg-[#050607] ${isNoTextMode ? "no-text-mode" : ""}`}>
          {slideComponents.map((comp, idx) => (
            <div key={SLIDE_LIST[idx].id} className="w-full h-screen deck-slide-page relative overflow-hidden bg-[#050607]">
              {comp}
            </div>
          ))}
        </div>
      </DeckShell>
    );
  }

  // Interactive Presentation Deck Mode
  return (
    <DeckShell
      currentIndex={currentIndex}
      onPrev={prevSlide}
      onNext={nextSlide}
      onJump={jumpToSlide}
      isPrintMode={false}
      isNoTextMode={isNoTextMode}
    >
      <Slide slideId={SLIDE_LIST[currentIndex].id} isActive={true}>
        {slideComponents[currentIndex]}
      </Slide>
    </DeckShell>
  );
};
