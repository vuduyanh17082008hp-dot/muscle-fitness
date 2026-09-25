"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { HeartPulse, Accessibility, Users, ShieldCheck } from "lucide-react";

export const Slide02Challenge: React.FC = () => {
  const pillars = [
    {
      title: "WELLBEING",
      desc: "Balancing training load, nutritional intake, and biological recovery to prevent burnout.",
      icon: HeartPulse,
      color: "#C8FF3D",
    },
    {
      title: "ACCESSIBILITY",
      desc: "Democratizing personal coaching when 1-on-1 human trainers are economically out of reach.",
      icon: Accessibility,
      color: "#59A9FF",
    },
    {
      title: "INCLUSION",
      desc: "Multilingual guidance, adaptive jargon controls, and simple interfaces for all fitness literacy levels.",
      icon: Users,
      color: "#8D7CFF",
    },
    {
      title: "EVIDENCE IMPACT",
      desc: "Gating all personal health guidance behind verifiable user data and established physiological rules.",
      icon: ShieldCheck,
      color: "#38BDF8",
    },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="blue" position="top-left" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#59A9FF] tracking-widest uppercase">
          CHALLENGE ALIGNMENT
        </span>
        <h2 className="deck-title-headline mt-2">
          AI SHOULD MAKE <span className="text-[#C8FF3D]">WELLBEING</span> MORE ACCESSIBLE.
        </h2>
      </div>

      {/* 4 Orbit Nodes / Intelligent Modules */}
      <div className="grid grid-cols-2 gap-6 my-auto">
        {pillars.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="p-6 rounded-2xl bg-[#11151B] border border-white/10 hover:border-white/30 transition-all shadow-xl group relative overflow-hidden"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${p.color}15`, color: p.color }}
              >
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold font-mono tracking-wider text-[#F6F7F9] mb-2">
                {p.title}
              </h3>
              <p className="text-sm text-[#989FAA] leading-relaxed">{p.desc}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        RESPONSIBLE AI IN HEALTH & ATHLETIC PERFORMANCE
      </div>
    </div>
  );
};
