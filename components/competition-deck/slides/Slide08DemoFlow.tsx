"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { User, LayoutDashboard, Dumbbell, Utensils, Activity, Bot, LineChart } from "lucide-react";

export const Slide08DemoFlow: React.FC = () => {
  const steps = [
    { title: "01. PROFILE", sub: "Biometrics & Goals", icon: User, color: "#F6F7F9" },
    { title: "02. DASHBOARD", sub: "Daily Readiness Score", icon: LayoutDashboard, color: "#59A9FF" },
    { title: "03. TRAINING", sub: "Load & Set Telemetry", icon: Dumbbell, color: "#C8FF3D" },
    { title: "04. NUTRITION", sub: "Macro Fuel Balance", icon: Utensils, color: "#8D7CFF" },
    { title: "05. RECOVERY", sub: "Sleep & Fatigue Check", icon: Activity, color: "#38BDF8" },
    { title: "06. DANTE AI", sub: "Safety Gated Advice", icon: Bot, color: "#C8FF3D" },
    { title: "07. PROGRESS", sub: "Long-term Adaptations", icon: LineChart, color: "#10B981" },
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="center" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
          GOLDEN USER JOURNEY
        </span>
        <h2 className="deck-title-headline mt-2">
          FROM CONTEXT <span className="text-[#C8FF3D]">TO ACTION.</span>
        </h2>
      </div>

      {/* Timeline Journey Flow */}
      <div className="relative my-auto py-8">
        {/* Animated Connecting Line */}
        <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-1 bg-white/10 z-0">
          <motion.div
            className="h-full bg-gradient-to-r from-[#59A9FF] via-[#C8FF3D] to-[#10B981]"
            animate={{ width: ["0%", "100%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-7 gap-3 relative z-10">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-4 rounded-xl bg-[#11151B] border border-white/10 flex flex-col items-center text-center shadow-lg hover:border-[#C8FF3D] transition-all"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${step.color}15`, color: step.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-[11px] font-mono font-bold text-[#F6F7F9] mb-1">
                  {step.title}
                </div>
                <div className="text-[10px] text-[#989FAA] font-sans leading-tight">
                  {step.sub}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        SEAMLESS END-TO-END ATHLETE EXPERIENCE FROM INITIAL ONBOARDING TO CONTINUOUS COACHING
      </div>
    </div>
  );
};
