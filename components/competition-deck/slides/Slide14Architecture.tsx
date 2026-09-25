"use client";

import React from "react";
import { Glow } from "../components/Glow";
import { ArchitectureDiagram } from "../components/ArchitectureDiagram";

export const Slide14Architecture: React.FC = () => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="blue" position="top-right" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#59A9FF] tracking-widest uppercase">
          TECHNICAL ARCHITECTURE
        </span>
        <h2 className="deck-title-headline mt-2">
          AI INSIDE A <span className="text-[#C8FF3D]">CONTROLLED PRODUCT SYSTEM.</span>
        </h2>
      </div>

      {/* Main Architecture Flowchart Diagram */}
      <div className="my-auto w-full flex items-center justify-center">
        <ArchitectureDiagram />
      </div>

      <div className="flex items-center justify-between text-xs font-mono text-[#989FAA]">
        <span>FRONTEND: NEXT.JS 16 APP ROUTER & TAILWIND</span>
        <span>BACKEND: SUPABASE POSTGRES + ROW LEVEL SECURITY</span>
        <span>AI: DANTE CONTEXT ENGINE + OPENAI / GEMINI</span>
      </div>
    </div>
  );
};
