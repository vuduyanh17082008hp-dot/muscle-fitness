"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { PerformanceSignal } from "../components/PerformanceSignal";

export const Slide18Closing: React.FC = () => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="center" size="lg" />

      {/* Top Brand Tag */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-[#C8FF3D] flex items-center justify-center font-bold text-[#050607]">
          MF
        </div>
        <span className="font-mono text-sm tracking-widest text-[#F6F7F9] font-semibold">
          MUSCLE FITNESS
        </span>
      </div>

      {/* Center Hero Statement */}
      <div className="my-auto max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <h3 className="font-mono text-sm text-[#989FAA] tracking-widest uppercase mb-4">
            WE ARE NOT TRYING TO REPLACE PERSONAL TRAINERS.
          </h3>
          <h2 className="deck-title-hero mb-8 text-balance">
            WE ARE MAKING RESPONSIBLE, PERSONALISED FITNESS GUIDANCE <br />
            <span className="text-[#C8FF3D]">{`ACCESSIBLE WHEN ONE ISN'T THERE.`}</span>
          </h2>
        </motion.div>

        {/* Central Closing Badge */}
        <div className="inline-flex items-center space-x-4 px-6 py-3 rounded-2xl bg-[#11151B] border-2 border-[#C8FF3D]/50 shadow-[0_0_40px_rgba(200,255,61,0.2)]">
          <span className="font-mono text-base font-extrabold tracking-wider text-[#F6F7F9]">
            TRAIN SMARTER.
          </span>
          <span className="w-2 h-2 rounded-full bg-[#C8FF3D]" />
          <span className="font-mono text-base font-extrabold tracking-wider text-[#C8FF3D]">
            DECIDE BETTER.
          </span>
        </div>
      </div>

      {/* Footer Motif */}
      <div className="w-full pt-6 border-t border-white/10">
        <PerformanceSignal activeStage={5} />
      </div>
    </div>
  );
};
