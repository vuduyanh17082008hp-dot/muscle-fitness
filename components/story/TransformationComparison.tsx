"use client";
import { useState, useRef } from "react";
import storyData from "@/data/storyContent";

const TransformationComparison = () => {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const { comparison } = storyData;

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setSliderPos((p) => Math.min(100, p + 2));
    if (e.key === "ArrowLeft") setSliderPos((p) => Math.max(0, p - 2));
  };

  return (
    <section className="py-24 bg-black">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-12">
          {comparison.heading}
        </h2>
        <div
          ref={containerRef}
          className="relative w-full aspect-[4/3] md:aspect-[16/9] overflow-hidden rounded-lg select-none"
          onMouseMove={(e) => handleMove(e.clientX)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="slider"
          aria-label="Before and after transformation comparison"
        >
          {/* Before image */}
          <img
            src={comparison.before.src}
            alt={comparison.before.alt}
            className="absolute inset-0 w-full h-full object-cover grayscale"
          />
          {/* After image – clipped */}
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <img
              src={comparison.after.src}
              alt={comparison.after.alt}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          {/* Slider handle */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white/70 shadow-lg cursor-col-resize"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full border-2 border-gold" />
          </div>
          {/* Labels */}
          <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
            Before
          </div>
          <div className="absolute bottom-4 right-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
            Eight Months Later
          </div>
        </div>
        <p className="text-gray-400 italic mt-6 max-w-xl mx-auto">
          “{comparison.message}”
        </p>
      </div>
    </section>
  );
};

export default TransformationComparison;