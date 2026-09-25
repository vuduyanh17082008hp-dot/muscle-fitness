"use client";

import React from "react";
import { DanteCore } from "./DanteCore";
import { Dumbbell, Utensils, Activity, LineChart, ShieldCheck, User, Target, History } from "lucide-react";

export const EcosystemOrbit: React.FC = () => {
  const innerModules = [
    { name: "TRAINING", icon: Dumbbell, color: "#C8FF3D", angle: 0 },
    { name: "NUTRITION", icon: Utensils, color: "#59A9FF", angle: 90 },
    { name: "RECOVERY", icon: Activity, color: "#8D7CFF", angle: 180 },
    { name: "PROGRESS", icon: LineChart, color: "#38BDF8", angle: 270 },
  ];

  const outerContexts = [
    { name: "PROFILE", icon: User },
    { name: "GOALS", icon: Target },
    { name: "HISTORY", icon: History },
    { name: "SAFETY", icon: ShieldCheck },
  ];

  return (
    <div className="relative w-full max-w-2xl aspect-square flex items-center justify-center mx-auto">
      {/* Outer Context Layer Orbit */}
      <div className="absolute inset-0 rounded-full border border-dashed border-white/10 flex items-center justify-center">
        {outerContexts.map((ctx, idx) => {
          const angleDeg = idx * 90 + 45;
          const rad = (angleDeg * Math.PI) / 180;
          const x = Math.cos(rad) * 46; // % from center
          const y = Math.sin(rad) * 46;
          const Icon = ctx.icon;

          return (
            <div
              key={ctx.name}
              className="absolute flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#11151B]/80 border border-white/10 text-xs font-mono text-[#989FAA] shadow-lg"
              style={{
                left: `${50 + x}%`,
                top: `${50 + y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <Icon className="w-3.5 h-3.5 text-[#59A9FF]" />
              <span>{ctx.name}</span>
            </div>
          );
        })}
      </div>

      {/* Inner Operational Pillar Orbit */}
      <div className="absolute inset-16 rounded-full border border-white/15 animate-orbit-slow flex items-center justify-center">
        {innerModules.map((mod) => {
          const rad = (mod.angle * Math.PI) / 180;
          const x = Math.cos(rad) * 40;
          const y = Math.sin(rad) * 40;
          const Icon = mod.icon;

          return (
            <div
              key={mod.name}
              className="absolute flex flex-col items-center justify-center w-24 h-24 rounded-2xl bg-[#11151B] border border-white/15 shadow-[0_10px_25px_rgba(0,0,0,0.5)] transition-all hover:border-[#C8FF3D]"
              style={{
                left: `${50 + x}%`,
                top: `${50 + y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <Icon className="w-6 h-6 mb-1" style={{ color: mod.color }} />
              <span className="text-[11px] font-bold font-mono tracking-wider text-[#F6F7F9]">
                {mod.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Center Core */}
      <div className="relative z-20">
        <DanteCore size="md" subtitle="INTELLIGENCE CORE" />
      </div>
    </div>
  );
};
