"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { DanteCore } from "../components/DanteCore";
import { Database, ShieldCheck, Cpu, AlertTriangle, Zap } from "lucide-react";

export const Slide15ResponsibleAI: React.FC = () => {
  const controls = [
    { title: "01. CONTEXT CONTROL", icon: Database, color: "#59A9FF", desc: "Isolate user state" },
    { title: "02. EVIDENCE CONTROL", icon: ShieldCheck, color: "#C8FF3D", desc: "Verify claims against data" },
    { title: "03. DECISION CONTROL", icon: Cpu, color: "#8D7CFF", desc: "Deterministic routing" },
    { title: "04. SAFETY CONTROL", icon: AlertTriangle, color: "#F59E0B", desc: "Refuse medical diagnosis" },
    { title: "05. COMMUNICATION CONTROL", icon: Zap, color: "#38BDF8", desc: "Adaptive persona & tone" },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="center" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
          RESPONSIBLE AI GOVERNANCE
        </span>
        <h2 className="deck-title-headline mt-2">
          {`PERSONALISED DOESN'T MEAN `}<span className="text-red-400">UNCONTROLLED.</span>
        </h2>
      </div>

      {/* 5 Connected Control Rings around Dante Center */}
      <div className="relative my-auto w-full max-w-4xl mx-auto flex items-center justify-center">
        {/* Orbit Circle Connector */}
        <div className="absolute w-[500px] h-[500px] rounded-full border border-dashed border-[#C8FF3D]/30 animate-orbit-slow" />

        {/* Dante Center */}
        <div className="relative z-20">
          <DanteCore size="md" subtitle="5 SAFETY GATES" />
        </div>

        {/* 5 Satellite Control Nodes */}
        {controls.map((ctrl, idx) => {
          const angleDeg = (idx * 360) / 5 - 90;
          const rad = (angleDeg * Math.PI) / 180;
          const radius = 220; // px
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          const Icon = ctrl.icon;

          return (
            <motion.div
              key={ctrl.title}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="absolute z-30 p-3 rounded-xl bg-[#11151B] border border-white/15 shadow-xl flex items-center space-x-3 w-52"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${ctrl.color}15`, color: ctrl.color }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-[#F6F7F9] leading-tight">
                  {ctrl.title}
                </div>
                <div className="text-[9px] text-[#989FAA] font-sans">
                  {ctrl.desc}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        COMPREHENSIVE 5-TIER SAFETY HARNESS GOVERNING EVERY SINGLE AI INTERACTION
      </div>
    </div>
  );
};
