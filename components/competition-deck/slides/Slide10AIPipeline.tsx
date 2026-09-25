"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { ArrowRight, AlertTriangle, ShieldCheck } from "lucide-react";

export const Slide10AIPipeline: React.FC = () => {
  const genericSteps = ["User Input", "Raw Prompt", "Generic LLM", "Unfiltered Answer"];
  const danteSteps = [
    "User Intent",
    "Scope Filter",
    "Context Assembly",
    "Evidence Gate",
    "Safety Check",
    "Decision Synthesis",
    "Safe Coaching"
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="purple" position="top-right" size="md" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#8D7CFF] tracking-widest uppercase">
          PIPELINE COMPARISON
        </span>
        <h2 className="deck-title-headline mt-2">
          THE MODEL <span className="text-red-400">IS NOT</span> <span className="text-[#C8FF3D]">THE SYSTEM.</span>
        </h2>
      </div>

      {/* Pipeline Comparison Grid */}
      <div className="grid grid-cols-2 gap-8 my-auto">
        {/* Left: Generic AI Pipeline */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 rounded-2xl bg-[#11151B]/60 border border-red-500/30 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-red-400">GENERIC CHATBOT PIPELINE</span>
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <p className="text-xs text-[#989FAA] mb-6">
              Direct unconstrained pass-through to LLM. Prone to hallucinating exercises, diagnosing injuries, and giving dangerous weightlifting advice.
            </p>

            <div className="flex items-center space-x-2 overflow-x-auto pb-2">
              {genericSteps.map((step, idx) => (
                <React.Fragment key={step}>
                  <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-mono text-red-200 whitespace-nowrap">
                    {step}
                  </div>
                  {idx < genericSteps.length - 1 && <ArrowRight className="w-4 h-4 text-red-400/50 flex-shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-red-500/20 text-[11px] font-mono text-red-400">
            HIGH RISK • NO EVIDENCE CONTROL • NO CLINICAL SAFETY
          </div>
        </motion.div>

        {/* Right: Dante Controlled Pipeline */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="p-6 rounded-2xl bg-[#11151B] border-2 border-[#C8FF3D]/60 flex flex-col justify-between shadow-[0_0_30px_rgba(200,255,61,0.15)]"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-[#C8FF3D]">DANTE CONTROLLED PIPELINE</span>
              <ShieldCheck className="w-5 h-5 text-[#C8FF3D]" />
            </div>
            <p className="text-xs text-[#989FAA] mb-6">
              7-stage deterministic pipeline ensuring telemetry verification, clinical safety boundaries, and evidence gating before advice delivery.
            </p>

            <div className="grid grid-cols-4 gap-2">
              {danteSteps.map((step, idx) => (
                <div
                  key={step}
                  className={`p-2 rounded-lg text-center text-[10px] font-mono font-bold border transition-all ${
                    idx === 6
                      ? "bg-[#C8FF3D] text-[#050607] border-[#C8FF3D]"
                      : "bg-[#07090D] text-[#F6F7F9] border-white/10"
                  }`}
                >
                  {step}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#C8FF3D]/20 text-[11px] font-mono text-[#C8FF3D]">
            DETERMINISTIC SAFETY • TELEMETRY BACKED • ZERO HALLUCINATION INJURY ADVICE
          </div>
        </motion.div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        ENGINEERING RESPONSIBLE ARCHITECTURE OVER DIRECT UNCONSTRAINED PROMPTING
      </div>
    </div>
  );
};
