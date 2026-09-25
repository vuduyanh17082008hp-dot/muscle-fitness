"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AmbientGrid } from "./components/AmbientGrid";

interface SlideProps {
  children: React.ReactNode;
  slideId: string;
  isActive: boolean;
}

export const Slide: React.FC<SlideProps> = ({ children, slideId, isActive }) => {
  if (!isActive) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={slideId}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.02 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="deck-slide-viewport deck-slide-page w-full h-full bg-[#050607] text-[#F6F7F9] relative flex flex-col justify-between overflow-hidden"
      >
        <AmbientGrid />
        <div className="relative z-10 w-full h-full flex flex-col justify-between">
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
