"use client";

import React from "react";
import { motion } from "framer-motion";

interface DanteCoreProps {
  size?: "sm" | "md" | "lg";
  subtitle?: string;
  className?: string;
}

export const DanteCore: React.FC<DanteCoreProps> = ({
  size = "md",
  subtitle = "CONTEXT-AWARE ENGINE",
  className = ""
}) => {
  const dimensions = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-72 h-72",
  }[size];

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      {/* Outer Pulse Rings */}
      <div className={`relative flex items-center justify-center ${dimensions}`}>
        <motion.div
          className="absolute inset-0 rounded-full border border-[#C8FF3D]/30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-4 rounded-full border border-[#8D7CFF]/40"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
        <motion.div
          className="absolute inset-8 rounded-full border border-[#59A9FF]/40"
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        {/* Central Luminous Node */}
        <div className="w-1/2 h-1/2 rounded-full bg-gradient-to-tr from-[#11151B] via-[#161B22] to-[#1E2631] border border-[#C8FF3D]/60 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(200,255,61,0.25)] relative overflow-hidden z-10">
          <div className="absolute inset-0 bg-radial-gradient from-[#C8FF3D]/20 to-transparent pointer-events-none" />
          <span className="font-mono text-xs text-[#C8FF3D] font-bold tracking-widest">DANTE</span>
          <span className="text-[10px] text-[#989FAA] font-mono mt-0.5">v2.4</span>
        </div>
      </div>

      {subtitle && (
        <span className="mt-3 text-xs font-mono text-[#989FAA] tracking-wider uppercase">
          {subtitle}
        </span>
      )}
    </div>
  );
};
