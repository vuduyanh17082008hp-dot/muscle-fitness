"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { ShieldAlert, CheckCircle2, Lock, FileText, Activity } from "lucide-react";

export const Slide11Evidence: React.FC = () => {
  const tiers = [
    {
      tier: "TIER 1 — GENERAL GUIDANCE",
      example: "'Hydration supports muscle recovery.'",
      rule: "ALLOWED (Public Knowledge)",
      status: "PASS",
      icon: FileText,
      color: "#59A9FF"
    },
    {
      tier: "TIER 2 — USER-STATE DEPENDENT",
      example: "'You worked out 4 days this week.'",
      rule: "REQUIRES VERIFIED LOGS",
      status: "CHECKED",
      icon: Activity,
      color: "#8D7CFF"
    },
    {
      tier: "TIER 3 — VERIFIED DATA CLAIM",
      example: "'Your sleep readiness score is 72/100.'",
      rule: "STRICT HARD TELEMETRY REQUIRED",
      status: "VERIFIED",
      icon: CheckCircle2,
      color: "#C8FF3D"
    },
    {
      tier: "TIER 4 — SAFETY GUIDANCE",
      example: "'Deload weight after 3 consecutive failures.'",
      rule: "ENFORCED SAFETY RULE",
      status: "ENFORCED",
      icon: ShieldAlert,
      color: "#F59E0B"
    },
    {
      tier: "TIER 5 — DIAGNOSTIC CLAIM",
      example: "'You have patellar tendonitis.'",
      rule: "BLOCKED (No Medical Diagnosis)",
      status: "BLOCKED",
      icon: Lock,
      color: "#EF4444"
    }
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="top-right" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
          EVIDENCE CONTROL LAYER
        </span>
        <h2 className="deck-title-headline mt-2">
          PERSONAL CLAIMS <span className="text-[#C8FF3D]">NEED EVIDENCE.</span>
        </h2>
      </div>

      {/* Tiered Evidence Gates Stack */}
      <div className="flex flex-col space-y-3 my-auto max-w-4xl mx-auto w-full">
        {tiers.map((t, idx) => {
          const Icon = t.icon;
          return (
            <motion.div
              key={t.tier}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.08 }}
              className="p-4 rounded-xl bg-[#11151B] border border-white/10 flex items-center justify-between shadow-md hover:border-white/25"
            >
              <div className="flex items-center space-x-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs"
                  style={{ backgroundColor: `${t.color}15`, color: t.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-[#F6F7F9]">
                    {t.tier}
                  </div>
                  <div className="text-xs font-serif italic text-[#989FAA]">
                    {t.example}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-xs font-mono text-[#989FAA] hidden md:inline">
                  {t.rule}
                </span>
                <span
                  className="px-3 py-1 rounded-full text-[11px] font-mono font-bold"
                  style={{ backgroundColor: `${t.color}20`, color: t.color }}
                >
                  {t.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        UNSUBSTANTIATED PHYSIOLOGICAL CLAIMS ARE AUTOMATICALLY INTERCEPTED AND BLOCKED
      </div>
    </div>
  );
};
