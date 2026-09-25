"use client";

import React from "react";

interface GlowProps {
  color?: "lime" | "blue" | "purple";
  position?: "top-left" | "top-right" | "center" | "bottom-right" | "bottom-left";
  size?: "sm" | "md" | "lg";
}

export const Glow: React.FC<GlowProps> = ({
  color = "lime",
  position = "center",
  size = "md"
}) => {
  const colorMap = {
    lime: "rgba(200, 255, 61, 0.12)",
    blue: "rgba(89, 169, 255, 0.12)",
    purple: "rgba(141, 124, 255, 0.12)",
  };

  const posMap = {
    "top-left": "-top-40 -left-40",
    "top-right": "-top-40 -right-40",
    "center": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    "bottom-right": "-bottom-40 -right-40",
    "bottom-left": "-bottom-40 -left-40",
  };

  const sizeMap = {
    sm: "w-72 h-72 blur-2xl",
    md: "w-[500px] h-[500px] blur-3xl",
    lg: "w-[800px] h-[800px] blur-[120px]",
  };

  return (
    <div
      className={`absolute pointer-events-none rounded-full z-0 transition-opacity duration-1000 ${posMap[position]} ${sizeMap[size]}`}
      style={{
        background: `radial-gradient(circle, ${colorMap[color]} 0%, rgba(5, 6, 7, 0) 70%)`,
      }}
    />
  );
};
