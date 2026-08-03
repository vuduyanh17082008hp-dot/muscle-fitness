"use client";

import Link from "next/link";
import { Dumbbell, Camera, MessageCircle, Apple, BarChart3 } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <nav className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-900">
      <Link href="/" className="flex items-center space-x-2">
        <Dumbbell className="w-6 h-6 text-blue-500" />
        <span className="font-bold text-xl text-gray-900 dark:text-white">MuscleFit</span>
      </Link>

      <div className="flex items-center space-x-6 text-gray-600 dark:text-gray-300">
        <Link href="/camera" className="hover:text-blue-500 flex items-center gap-1">
          <Camera className="w-4 h-4" /> Camera
        </Link>
        <Link href="/progress" className="hover:text-blue-500 flex items-center gap-1">
          <BarChart3 className="w-4 h-4" /> Progress
        </Link>
        <Link href="/nutrition" className="hover:text-blue-500 flex items-center gap-1">
          <Apple className="w-4 h-4" /> Nutrition
        </Link>
        <Link href="/community" className="hover:text-blue-500 flex items-center gap-1">
          <MessageCircle className="w-4 h-4" /> Community
        </Link>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
    </nav>
  );
}