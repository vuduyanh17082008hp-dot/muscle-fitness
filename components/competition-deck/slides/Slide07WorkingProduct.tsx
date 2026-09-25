"use client";

import React from "react";
import { motion } from "framer-motion";
import { Glow } from "../components/Glow";
import { ProductFrame } from "../components/ProductFrame";
import { ScreenshotFrame } from "../components/ScreenshotFrame";

export const Slide07WorkingProduct: React.FC = () => {
  return (
    <div className="relative w-full h-full flex flex-col justify-between p-12 overflow-hidden z-10">
      <Glow color="blue" position="top-right" size="lg" />

      {/* Header */}
      <div>
        <span className="font-mono text-xs text-[#59A9FF] tracking-widest uppercase">
          PRODUCTION READY
        </span>
        <h2 className="deck-title-headline mt-2">
          THIS IS NOT A CONCEPT. <span className="text-[#C8FF3D]">A WORKING PRODUCT.</span>
        </h2>
      </div>

      {/* Product Screens Spatial Showcase */}
      <div className="grid grid-cols-12 gap-6 my-auto items-center">
        {/* Main Dashboard Screen (Large) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="col-span-7"
        >
          <ProductFrame title="MUSCLE FITNESS — ATHLETE DASHBOARD">
            <ScreenshotFrame
              src="/competition/screenshots/dashboard.png"
              alt="Muscle Fitness Dashboard"
              caption="Live Production Dashboard — Workouts, Readiness & Dante Context"
            />
          </ProductFrame>
        </motion.div>

        {/* Secondary Screens Stack (Right Side) */}
        <div className="col-span-5 flex flex-col space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <ScreenshotFrame
              src="/competition/screenshots/nutrition.png"
              alt="Nutrition Tracker"
              caption="Smart Macro & Calorie Engine"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <ScreenshotFrame
              src="/competition/screenshots/dante.png"
              alt="Dante AI Interface"
              caption="Dante Contextual Coaching Interface"
            />
          </motion.div>
        </div>
      </div>

      <div className="text-xs font-mono text-[#989FAA]">
        DEPLOYED ON NEXT.JS 16 APP ROUTER & SUPABASE INFRASTRUCTURE
      </div>
    </div>
  );
};
