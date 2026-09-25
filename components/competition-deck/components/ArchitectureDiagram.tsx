"use client";

import React from "react";
import { motion } from "framer-motion";
import { User, Server, Shield, Cpu, Database, Lock } from "lucide-react";

export const ArchitectureDiagram: React.FC = () => {
  const nodes = [
    { id: "user", label: "USER INTERFACE", sub: "Next.js 16 App Router", icon: User, color: "#F6F7F9" },
    { id: "app", label: "APP SERVER", sub: "Edge Runtime / Node", icon: Server, color: "#59A9FF" },
    { id: "dante", label: "DANTE CONTROL LAYER", sub: "Safety & Scope Engine", icon: Shield, color: "#C8FF3D" },
    { id: "ai", label: "LLM PROVIDER", sub: "OpenAI GPT-4o / Gemini", icon: Cpu, color: "#8D7CFF" },
  ];

  return (
    <div className="w-full max-w-4xl p-6 rounded-2xl bg-[#11151B]/80 border border-white/10 backdrop-blur-md">
      {/* Top Main Pipeline Flow */}
      <div className="grid grid-cols-4 gap-4 relative">
        {nodes.map((node, idx) => {
          const Icon = node.icon;
          return (
            <div key={node.id} className="relative flex flex-col items-center">
              <motion.div
                className="w-full p-4 rounded-xl bg-[#07090D] border border-white/10 flex flex-col items-center text-center relative z-10 shadow-lg"
                style={{ borderColor: idx === 2 ? "#C8FF3D" : undefined }}
                whileHover={{ y: -4 }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-2"
                  style={{ backgroundColor: `${node.color}15`, color: node.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono font-bold text-[#F6F7F9] tracking-wider">
                  {node.label}
                </span>
                <span className="text-[10px] text-[#989FAA] font-mono mt-1">
                  {node.sub}
                </span>
              </motion.div>

              {/* Connecting arrow line */}
              {idx < nodes.length - 1 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 text-[#59A9FF]">
                  →
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Infrastructure Layer */}
      <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4">
        <div className="p-3 rounded-lg bg-[#07090D] border border-white/10 flex items-center space-x-3">
          <Database className="w-5 h-5 text-[#59A9FF]" />
          <div>
            <div className="text-xs font-mono font-bold text-[#F6F7F9]">SUPABASE POSTGRES</div>
            <div className="text-[10px] text-[#989FAA]">Persistent User Telemetry</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#07090D] border border-white/10 flex items-center space-x-3">
          <Lock className="w-5 h-5 text-[#C8FF3D]" />
          <div>
            <div className="text-xs font-mono font-bold text-[#F6F7F9]">ROW LEVEL SECURITY</div>
            <div className="text-[10px] text-[#989FAA]">Isolated User Data Policy</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#07090D] border border-white/10 flex items-center space-x-3">
          <Shield className="w-5 h-5 text-[#8D7CFF]" />
          <div>
            <div className="text-xs font-mono font-bold text-[#F6F7F9]">DANTE SAFETY RULES</div>
            <div className="text-[10px] text-[#989FAA]">Deterministic Refusal Layer</div>
          </div>
        </div>
      </div>
    </div>
  );
};
