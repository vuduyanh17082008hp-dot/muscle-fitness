"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { MessageSquare, Languages, SlidersHorizontal, EyeOff, CheckCircle2 } from "lucide-react";

export const Slide13Accessibility: React.FC = () => {
  const controls = [
    { title: "SIMPLE ENGLISH", desc: "Replaces biomechanical jargon with everyday terms.", icon: MessageSquare },
    { title: "MULTILINGUAL SUPPORT", desc: "Seamless coaching in English, Vietnamese, Spanish & Japanese.", icon: Languages },
    { title: "VERBOSITY SLIDER", desc: "Switch between 1-sentence action bullets or deep physiological explanations.", icon: SlidersHorizontal },
    { title: "STATISTICS HIDER", desc: "Hides complex charts while retaining underlying data for coaching.", icon: EyeOff },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="purple" position="top-right" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#8D7CFF] tracking-widest uppercase">
          ACCESSIBLE COMMUNICATION ENGINE
        </span>
        <h2 className="deck-title-headline mt-2">
          SAME TRUTH. <span className="text-[#C8FF3D]">BETTER COMMUNICATION.</span>
        </h2>
      </div>

      {/* Grid of Communication Controls */}
      <div className="grid grid-cols-2 gap-6 my-auto max-w-4xl mx-auto w-full">
        {controls.map((c, idx) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="p-6 rounded-2xl bg-[#11151B] border border-white/10 flex items-start space-x-4 shadow-lg hover:border-[#8D7CFF]/50 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#8D7CFF]/15 text-[#8D7CFF] flex items-center justify-center flex-shrink-0">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-mono font-bold text-sm text-[#F6F7F9] mb-1">
                  {c.title}
                </h4>
                <p className="text-xs text-[#989FAA] leading-relaxed">
                  {c.desc}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Critical Distinction Banner */}
      <div className="p-4 rounded-xl bg-[#11151B] border border-[#C8FF3D]/40 flex items-center justify-between max-w-4xl mx-auto w-full">
        <div className="flex items-center space-x-3 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4 text-[#C8FF3D]" />
          <span className="text-[#C8FF3D] font-bold">CRITICAL PRINCIPLE:</span>
          <span className="text-[#F6F7F9]">
            {`"Don't show me statistics" ≠ "Don't use my data."`}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#989FAA]">UI DISPLAY SEPARATION</span>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        ADAPTING PERSONA PRESENTATION WITHOUT DILUTING PHYSIOLOGICAL ACCURACY
      </div>
    </div>
  );
};
