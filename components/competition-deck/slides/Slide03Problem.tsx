"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { Dumbbell, Utensils, Activity, Share2, Bot, LineChart, UserX } from "lucide-react";

export const Slide03Problem: React.FC = () => {
  const fragments = [
    { label: "TRAINING LOGS", sub: "Isolated set counters", icon: Dumbbell, top: "15%", left: "10%" },
    { label: "CALORIES & MACROS", sub: "Unverified databases", icon: Utensils, top: "15%", right: "10%" },
    { label: "SOCIAL MEDIA ADVICE", sub: "Contradictory fitness myths", icon: Share2, bottom: "15%", left: "12%" },
    { label: "GENERIC AI CHATBOTS", sub: "Hallucinated workout plans", icon: Bot, bottom: "15%", right: "12%" },
    { label: "RECOVERY TRACKERS", sub: "Unactionable HRV scores", icon: Activity, top: "50%", left: "5%" },
    { label: "PROGRESS CHARTS", sub: "Meaningless visual noise", icon: LineChart, top: "50%", right: "5%" },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="purple" position="center" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#8D7CFF] tracking-widest uppercase">
          THE PROBLEM
        </span>
        <h2 className="deck-title-headline mt-2">
          MORE DATA. MORE ADVICE. <span className="text-red-400">STILL NO CLEAR DECISION.</span>
        </h2>
      </div>

      {/* Spatial Fragmentation Canvas */}
      <div className="relative w-full flex-1 my-4 flex items-center justify-center">
        {/* Confused User Center */}
        <div className="z-20 p-6 rounded-2xl bg-[#11151B] border-2 border-red-500/40 text-center shadow-[0_0_40px_rgba(239,68,68,0.2)]">
          <UserX className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <h4 className="font-mono font-bold text-[#F6F7F9]">OVERWHELMED USER</h4>
          <p className="text-xs text-[#989FAA] mt-1">Paralyzed by conflicting signals</p>
        </div>

        {/* Orbiting Fragment Cards */}
        {fragments.map((frag, idx) => {
          const Icon = frag.icon;
          return (
            <motion.div
              key={frag.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="absolute p-4 rounded-xl bg-[#07090D]/90 border border-white/10 shadow-lg flex items-center space-x-3 backdrop-blur-md"
              style={{ top: frag.top, left: frag.left, right: frag.right, bottom: frag.bottom }}
            >
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#989FAA]">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-mono font-bold text-[#F6F7F9]">{frag.label}</div>
                <div className="text-[10px] text-[#989FAA]">{frag.sub}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-xs font-mono text-center text-[#989FAA]">
        FRAGMENTED ATHLETIC DATA BREEDS ANALYSIS PARALYSIS
      </div>
    </div>
  );
};
