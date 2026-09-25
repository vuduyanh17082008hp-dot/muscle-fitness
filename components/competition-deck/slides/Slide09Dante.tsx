"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { DanteCore } from "../components/DanteCore";
import { Cpu, ShieldCheck, Database, Zap } from "lucide-react";

export const Slide09Dante: React.FC = () => {
  const capabilities = [
    {
      title: "PERSISTENT TELEMETRY MEMORY",
      desc: "Remembers past workout logs, historical sleep deficits, and recent injury disclosures.",
      icon: Database,
      color: "#59A9FF"
    },
    {
      title: "DETERMINISTIC SAFETY GUARD",
      desc: "Intercepts unsafe advice and halts medical diagnosis before sending prompts to the LLM.",
      icon: ShieldCheck,
      color: "#C8FF3D"
    },
    {
      title: "DYNAMIC INTENT ROUTER",
      desc: "Classifies user intent (workout modification, nutritional inquiry, fatigue report) instantly.",
      icon: Cpu,
      color: "#8D7CFF"
    },
    {
      title: "ADAPTIVE COMMUNICATION",
      desc: "Tailors wording length, jargon density, and language dynamically to the user's literacy.",
      icon: Zap,
      color: "#38BDF8"
    }
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="center" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
          AI ENGINE ARCHITECTURE
        </span>
        <h2 className="deck-title-headline mt-2">
          NOT JUST A CHATBOT. <br />
          <span className="text-[#C8FF3D]">A CONTEXT-AWARE AI COACHING LAYER.</span>
        </h2>
      </div>

      {/* Dante Node Breakdown */}
      <div className="grid grid-cols-12 gap-8 my-auto items-center">
        {/* Left Visual Intelligence Node */}
        <div className="col-span-5 flex flex-col items-center justify-center p-8 rounded-2xl bg-[#11151B] border border-[#C8FF3D]/40 shadow-2xl">
          <DanteCore size="lg" subtitle="DANTE CORE ENGINE v2.4" />
        </div>

        {/* Right Capabilities Stack */}
        <div className="col-span-7 grid grid-cols-2 gap-4">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-5 rounded-xl bg-[#11151B] border border-white/10 shadow-lg"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${cap.color}15`, color: cap.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h4 className="font-mono font-bold text-xs text-[#F6F7F9] mb-1">
                  {cap.title}
                </h4>
                <p className="text-xs text-[#989FAA] leading-relaxed">
                  {cap.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        STRUCTURED INTELLIGENCE NODE RATHER THAN UNCONSTRAINED CONVERSATIONAL MODEL
      </div>
    </div>
  );
};
