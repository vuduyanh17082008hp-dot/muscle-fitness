"use client";

import React from "react";
import { Glow } from "../components/Glow";
import { EcosystemOrbit } from "../components/EcosystemOrbit";

export const Slide06Ecosystem: React.FC = () => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="lime" position="center" size="lg" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs text-[#C8FF3D] tracking-widest uppercase">
            SIGNATURE ARCHITECTURE
          </span>
          <h2 className="deck-title-headline mt-2">
            MUSCLE FITNESS <span className="text-[#C8FF3D]">ECOSYSTEM</span>
          </h2>
        </div>
        <div className="px-4 py-2 rounded-xl bg-[#11151B] border border-white/10 text-xs font-mono text-[#989FAA]">
          ORBITAL INTELLIGENCE MODEL
        </div>
      </div>

      {/* Center Orbital Diagram */}
      <div className="my-auto w-full flex items-center justify-center">
        <EcosystemOrbit />
      </div>

      <div className="flex items-center justify-between text-xs font-mono text-[#989FAA]">
        <span>CENTER: DANTE AI ENGINE</span>
        <span>INNER ORBIT: 4 ATHLETIC PILLARS</span>
        <span>OUTER ORBIT: USER TELEMETRY & CONTEXT</span>
      </div>
    </div>
  );
};
