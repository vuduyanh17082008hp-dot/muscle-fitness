"use client";

import React from "react";
import { motion } from "framer-motion";
import { PerformanceSignal } from "../components/PerformanceSignal";
import { Glow } from "../components/Glow";

export const Slide01Opening: React.FC = () => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="top-right" size="lg" />
      <Glow color="blue" position="bottom-left" size="md" />

      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#C8FF3D] flex items-center justify-center font-bold text-[#050607]">
            MF
          </div>
          <span className="font-mono text-sm tracking-widest text-[#F6F7F9] font-semibold">
            MUSCLE FITNESS
          </span>
        </div>
        <div className="px-3 py-1 rounded-full bg-[#11151B] border border-[#C8FF3D]/40 text-xs font-mono text-[#C8FF3D]">
          AI FITNESS INTELLIGENCE
        </div>
      </div>

      {/* Center Hero Headline */}
      <div className="my-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="deck-title-hero mb-6">
            FITNESS INFORMATION IS EVERYWHERE.
            <br />
            <span className="text-[#C8FF3D]">GOOD DECISIONS AREN&apos;T.</span>
          </h1>
          <p className="deck-subhead max-w-2xl">
            Empowering everyday athletes with evidence-informed, clinically-safe, context-aware AI coaching.
          </p>
        </motion.div>
      </div>

      {/* Bottom Footer Motif */}
      <div className="w-full pt-6 border-t border-white/10">
        <PerformanceSignal activeStage={0} />
      </div>
    </div>
  );
};
