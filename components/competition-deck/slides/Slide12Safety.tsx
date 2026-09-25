"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { Check, X, ShieldAlert, AlertTriangle, Stethoscope } from "lucide-react";

export const Slide12Safety: React.FC = () => {
  const safetyRules = [
    {
      title: "NO UNSUPPORTED DIAGNOSIS",
      desc: "Dante never offers medical or anatomical diagnoses for reported pain.",
      icon: ShieldAlert,
      color: "#C8FF3D"
    },
    {
      title: "UNCERTAINTY PRESERVED",
      desc: "Acknowledges limits of AI telemetry and refuses false confidence.",
      icon: AlertTriangle,
      color: "#59A9FF"
    },
    {
      title: "PROFESSIONAL ESCALATION",
      desc: "Recommends consulting a licensed physical therapist or physician.",
      icon: Stethoscope,
      color: "#8D7CFF"
    }
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="blue" position="top-left" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#59A9FF] tracking-widest uppercase">
          CLINICAL & PHYSICAL SAFETY
        </span>
        <h2 className="deck-title-headline mt-2">
          SAFE ENOUGH <span className="text-[#C8FF3D]">TO KNOW ITS LIMITS.</span>
        </h2>
      </div>

      {/* Real Scenario Comparison Box */}
      <div className="my-auto max-w-4xl mx-auto w-full">
        {/* User Prompt Scenario Banner */}
        <div className="p-4 rounded-xl bg-[#11151B] border border-white/10 mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-[#59A9FF] animate-pulse" />
            <span className="text-xs font-mono text-[#989FAA]">USER PROMPT:</span>
            <span className="text-sm font-semibold text-[#F6F7F9]">
              &quot;My knee hurts a little when I squat past 90 degrees.&quot;
            </span>
          </div>
        </div>

        {/* Incorrect vs Correct Response comparison */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Incorrect Dangerous AI */}
          <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/40">
            <div className="flex items-center space-x-2 text-red-400 font-mono font-bold text-xs mb-2">
              <X className="w-4 h-4" />
              <span>UNSAFE LLM RESPONSE (REJECTED)</span>
            </div>
            <p className="text-xs text-red-200 font-serif italic">
              &quot;You likely have a meniscus tear or patellar tendonitis. Take 400mg ibuprofen and continue squatting lighter.&quot;
            </p>
          </div>

          {/* Correct Dante Safe AI */}
          <div className="p-5 rounded-xl bg-[#C8FF3D]/10 border border-[#C8FF3D]/50">
            <div className="flex items-center space-x-2 text-[#C8FF3D] font-mono font-bold text-xs mb-2">
              <Check className="w-4 h-4" />
              <span>DANTE SAFE RESPONSE (ENFORCED)</span>
            </div>
            <p className="text-xs text-[#F6F7F9] font-serif italic">
              &quot;Stop squatting past the painful angle today. Substitute with painless step-ups. If discomfort persists, consult a licensed physical therapist.&quot;
            </p>
          </div>
        </div>

        {/* 3 Safety Boundary Cards */}
        <div className="grid grid-cols-3 gap-4">
          {safetyRules.map((rule, idx) => {
            const Icon = rule.icon;
            return (
              <motion.div
                key={rule.title}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-4 rounded-xl bg-[#11151B] border border-white/10 flex flex-col justify-between"
              >
                <div className="flex items-center space-x-3 mb-2">
                  <Icon className="w-4 h-4" style={{ color: rule.color }} />
                  <h4 className="font-mono font-bold text-xs text-[#F6F7F9]">
                    {rule.title}
                  </h4>
                </div>
                <p className="text-[11px] text-[#989FAA] leading-relaxed">
                  {rule.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        CLINICAL BOUNDARIES PREVENT AI HALLUCINATIONS FROM CAUSING PHYSICAL HARM
      </div>
    </div>
  );
};
