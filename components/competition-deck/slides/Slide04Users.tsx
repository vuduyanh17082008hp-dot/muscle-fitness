"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { UserCheck, GraduationCap, Dumbbell, Globe, HelpCircle } from "lucide-react";

export const Slide04Users: React.FC = () => {
  const userGroups = [
    {
      role: "BEGINNERS",
      description: "Intimidated by gym equipment and complex exercise jargon.",
      icon: UserCheck,
      tag: "Need Clarity"
    },
    {
      role: "STUDENTS & BUSY WORKERS",
      description: "Constrained by tight schedules and limited fitness budgets.",
      icon: GraduationCap,
      tag: "Need Efficiency"
    },
    {
      role: "EVERYDAY GYM GOERS",
      description: "Stuck on plateaus without specialized coaching guidance.",
      icon: Dumbbell,
      tag: "Need Progression"
    },
    {
      role: "MULTILINGUAL ATHLETES",
      description: "Seeking fitness guidance in their native language.",
      icon: Globe,
      tag: "Need Inclusion"
    },
    {
      role: "LOW FITNESS LITERACY",
      description: "Overwhelmed by statistical charts and medical acronyms.",
      icon: HelpCircle,
      tag: "Need Simplicity"
    }
  ];

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="blue" position="top-right" size="md" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#59A9FF] tracking-widest uppercase">
          HUMAN-CENTERED FOCUS
        </span>
        <h2 className="deck-title-headline mt-2">
          BUILT FOR PEOPLE WHO DON&apos;T HAVE <br />
          <span className="text-[#C8FF3D]">A COACH BESIDE THEM EVERY DAY.</span>
        </h2>
      </div>

      {/* User Groups Grid */}
      <div className="grid grid-cols-5 gap-4 my-auto">
        {userGroups.map((u, idx) => {
          const Icon = u.icon;
          return (
            <motion.div
              key={u.role}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="p-5 rounded-2xl bg-[#11151B] border border-white/10 flex flex-col justify-between hover:border-[#C8FF3D]/40 transition-all shadow-lg"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#59A9FF]/10 text-[#59A9FF] flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h4 className="font-mono font-bold text-sm text-[#F6F7F9] mb-2 leading-tight">
                  {u.role}
                </h4>
                <p className="text-xs text-[#989FAA] leading-relaxed">
                  {u.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5">
                <span className="text-[10px] font-mono text-[#C8FF3D] bg-[#C8FF3D]/10 px-2 py-0.5 rounded">
                  {u.tag}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        DEMOCRATIZING HIGH-PERFORMANCE ATHLETIC INTELLIGENCE FOR EVERYONE
      </div>
    </div>
  );
};
