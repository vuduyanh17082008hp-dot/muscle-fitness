"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { Lock, ArrowRight, Layers, Sparkles } from "lucide-react";

export const Slide16SurpriseFeatures: React.FC = () => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="blue" position="top-right" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#59A9FF] tracking-widest uppercase">
          MODULAR EXTENSIBILITY
        </span>
        <h2 className="deck-title-headline mt-2">
          BUILT TO ADAPT <span className="text-[#C8FF3D]">WITHOUT BREAKING THE CORE.</span>
        </h2>
      </div>

      {/* Adapter Architecture & Locked Expansion Cards */}
      <div className="my-auto max-w-4xl mx-auto w-full space-y-8">
        {/* Architecture flow diagram */}
        <div className="p-4 rounded-xl bg-[#11151B] border border-white/10 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2 text-[#59A9FF]">
            <Layers className="w-4 h-4" />
            <span>NEW EXPANSION FEATURE</span>
          </div>
          <ArrowRight className="w-4 h-4 text-white/30" />
          <div className="px-3 py-1 rounded bg-[#8D7CFF]/20 text-[#8D7CFF]">ADAPTER LAYER</div>
          <ArrowRight className="w-4 h-4 text-white/30" />
          <div className="px-3 py-1 rounded bg-[#C8FF3D]/20 text-[#C8FF3D]">MF CORE ENGINE</div>
          <ArrowRight className="w-4 h-4 text-white/30" />
          <div className="flex items-center space-x-2 text-[#F6F7F9]">
            <Sparkles className="w-4 h-4 text-[#C8FF3D]" />
            <span>DANTE COACHING UI</span>
          </div>
        </div>

        {/* 2 Locked Expansion Modules */}
        <div className="grid grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="p-8 rounded-2xl bg-[#11151B] border-2 border-dashed border-[#C8FF3D]/40 flex flex-col items-center justify-center text-center shadow-xl group hover:border-[#C8FF3D]"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#C8FF3D]/10 text-[#C8FF3D] flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
              <Lock className="w-7 h-7" />
            </div>
            <h4 className="font-mono font-bold text-sm text-[#F6F7F9] mb-1">
              EXPANSION MODULE A
            </h4>
            <span className="text-xs font-mono text-[#C8FF3D] bg-[#C8FF3D]/10 px-3 py-1 rounded-full mt-2">
              LOCKED UNTIL LIVE REVEAL
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="p-8 rounded-2xl bg-[#11151B] border-2 border-dashed border-[#59A9FF]/40 flex flex-col items-center justify-center text-center shadow-xl group hover:border-[#59A9FF]"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#59A9FF]/10 text-[#59A9FF] flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
              <Lock className="w-7 h-7" />
            </div>
            <h4 className="font-mono font-bold text-sm text-[#F6F7F9] mb-1">
              EXPANSION MODULE B
            </h4>
            <span className="text-xs font-mono text-[#59A9FF] bg-[#59A9FF]/10 px-3 py-1 rounded-full mt-2">
              LOCKED UNTIL LIVE REVEAL
            </span>
          </motion.div>
        </div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        ZERO-BREAKING-CHANGE ADAPTER ARCHITECTURE READY FOR RAPID FEATURE PLUG-IN
      </div>
    </div>
  );
};
