"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { DanteCore } from "../components/DanteCore";
import { Dumbbell, Utensils, Activity, LineChart, ArrowRight } from "lucide-react";

export const Slide05Solution: React.FC = () => {
  const pillars = [
    { title: "TRAINING", icon: Dumbbell, color: "#C8FF3D", sub: "Load & Progression" },
    { title: "NUTRITION", icon: Utensils, color: "#59A9FF", sub: "Energy & Macros" },
    { title: "RECOVERY", icon: Activity, color: "#8D7CFF", sub: "Fatigue & Sleep" },
    { title: "PROGRESS", icon: LineChart, color: "#38BDF8", sub: "Biofeedback Trends" },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="center" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
          THE SOLUTION
        </span>
        <h2 className="deck-title-headline mt-2">
          ONE CONTEXT. ONE COACH. <span className="text-[#C8FF3D]">BETTER DECISIONS.</span>
        </h2>
      </div>

      {/* Flow Diagram: Pillars -> Convergence -> Dante Core */}
      <div className="flex items-center justify-between my-auto w-full max-w-5xl mx-auto">
        {/* Left Stack of Pillars */}
        <div className="flex flex-col space-y-4 w-72">
          {pillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-4 rounded-xl bg-[#11151B] border border-white/10 flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${p.color}15`, color: p.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-mono font-bold text-sm text-[#F6F7F9]">{p.title}</h4>
                    <p className="text-[10px] text-[#989FAA]">{p.sub}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/20" />
              </motion.div>
            );
          })}
        </div>

        {/* Central Convergence Streams */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="w-full h-1 bg-gradient-to-r from-[#59A9FF] via-[#8D7CFF] to-[#C8FF3D] rounded-full relative">
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#C8FF3D] shadow-[0_0_15px_#C8FF3D]"
              animate={{ left: ["0%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>

        {/* Right Dante Intelligence Node */}
        <div className="w-80 flex flex-col items-center p-6 rounded-2xl bg-[#11151B] border border-[#C8FF3D]/40 shadow-[0_0_40px_rgba(200,255,61,0.15)]">
          <DanteCore size="md" subtitle="UNIFIED CONTEXT ENGINE" />
          <p className="text-xs text-center text-[#989FAA] mt-4">
            Dante synthesizes all 4 athletic pillars into 1 safe decision.
          </p>
        </div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        UNIFYING DISPARATE ATHLETIC TELEMETRY INTO A SINGLE INTELLIGENT COACH
      </div>
    </div>
  );
};
