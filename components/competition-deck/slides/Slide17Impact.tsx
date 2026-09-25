"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { HeartHandshake, Eye, Repeat, Globe, ShieldCheck, Clock } from "lucide-react";

export const Slide17Impact: React.FC = () => {
  const impacts = [
    { title: "DEMOCRATIZED ACCESS", desc: "Providing 24/7 personal coaching guidance at zero financial barrier.", icon: HeartHandshake, color: "#C8FF3D" },
    { title: "IMPROVED LITERACY", desc: "Translating complex sports science into actionable everyday steps.", icon: Eye, color: "#59A9FF" },
    { title: "ATHLETIC CONTINUITY", desc: "Reducing workout abandonment rates through persistent motivation.", icon: Repeat, color: "#8D7CFF" },
    { title: "MULTILINGUAL REACH", desc: "Empowering non-English speakers with localized fitness intelligence.", icon: Globe, color: "#38BDF8" },
    { title: "SAFER AI USE", desc: "Pioneering clinical safety boundaries for generative AI in consumer health.", icon: ShieldCheck, color: "#10B981" },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="top-right" size="lg" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
            IMPACT & VALIDATION
          </span>
          <h2 className="deck-title-headline mt-2">
            RESPONSIBLE GUIDANCE <br />
            <span className="text-[#C8FF3D]">{`WHEN A TRAINER ISN'T AVAILABLE.`}</span>
          </h2>
        </div>

        {/* Honest Validation In Progress Badge */}
        <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-400 font-mono text-xs font-bold">
          <Clock className="w-4 h-4 animate-spin" style={{ animationDuration: "6s" }} />
          <span>VALIDATION IN PROGRESS</span>
        </div>
      </div>

      {/* 5 Impact Pillars Grid */}
      <div className="grid grid-cols-5 gap-4 my-auto">
        {impacts.map((imp, idx) => {
          const Icon = imp.icon;
          return (
            <motion.div
              key={imp.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="p-5 rounded-2xl bg-[#11151B] border border-white/10 flex flex-col justify-between hover:border-[#C8FF3D]/40 transition-all shadow-lg"
            >
              <div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${imp.color}15`, color: imp.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h4 className="font-mono font-bold text-xs text-[#F6F7F9] mb-2 leading-tight">
                  {imp.title}
                </h4>
                <p className="text-xs text-[#989FAA] leading-relaxed">
                  {imp.desc}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="p-3 rounded-xl bg-[#11151B] border border-white/10 flex items-center justify-between text-xs font-mono text-[#989FAA]">
        <span>HONEST TRANSPARENCY: EMPIRICAL USER STUDIES CURRENTLY UNDERWAY</span>
        <span className="text-[#C8FF3D]">NO FABRICATED METRICS</span>
      </div>
    </div>
  );
};
