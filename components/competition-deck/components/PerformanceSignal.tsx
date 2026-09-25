"use client";

import React from "react";
import { motion } from "framer-motion";

interface PerformanceSignalProps {
  variant?: "horizontal" | "vertical" | "curved";
  className?: string;
  activeStage?: number; // 0 to 5
}

export const PerformanceSignal: React.FC<PerformanceSignalProps> = ({
  className = "",
  activeStage = 2,
}) => {
  const stages = [
    { label: "USER", color: "#F6F7F9" },
    { label: "DATA", color: "#59A9FF" },
    { label: "CONTEXT", color: "#8D7CFF" },
    { label: "DECISION", color: "#C8FF3D" },
    { label: "ACTION", color: "#C8FF3D" },
    { label: "FEEDBACK", color: "#59A9FF" },
  ];

  return (
    <div className={`relative flex items-center justify-between w-full py-4 ${className}`}>
      {/* Background connecting beam */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/10 z-0">
        <motion.div
          className="h-full bg-gradient-to-r from-[#59A9FF] via-[#8D7CFF] to-[#C8FF3D]"
          initial={{ width: "0%" }}
          animate={{ width: `${((activeStage + 1) / stages.length) * 100}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>

      {/* Nodes */}
      {stages.map((stage, idx) => {
        const isActive = idx <= activeStage;
        const isCurrent = idx === activeStage;

        return (
          <div key={stage.label} className="relative z-10 flex flex-col items-center group">
            <motion.div
              className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                isCurrent
                  ? "bg-[#C8FF3D] border-[#C8FF3D] shadow-[0_0_15px_rgba(200,255,61,0.8)]"
                  : isActive
                  ? "bg-[#11151B] border-[#59A9FF]"
                  : "bg-[#07090D] border-white/20"
              }`}
              animate={{ scale: isCurrent ? 1.2 : 1 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isCurrent ? "bg-[#050607]" : isActive ? "bg-[#59A9FF]" : "bg-white/30"
                }`}
              />
            </motion.div>
            <span
              className={`mt-2 text-[11px] font-mono tracking-wider font-semibold transition-colors ${
                isCurrent
                  ? "text-[#C8FF3D]"
                  : isActive
                  ? "text-[#F6F7F9]"
                  : "text-[#989FAA]/50"
              }`}
            >
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
