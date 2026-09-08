"use client";

import Link from "next/link";

import {
  Apple,
  BarChart3,
  Camera,
  Dumbbell,
  MessageCircle,
  Moon,
  Sun,
} from "lucide-react";

import {
  useSyncExternalStore,
} from "react";

import {
  useTheme,
} from "next-themes";

/* =========================================================
   HYDRATION HELPER

   Avoid:
   useEffect(() => setMounted(true), [])

   React 19 ESLint flags synchronous setState inside effects.
========================================================= */

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/* =========================================================
   NAVBAR
========================================================= */

export default function Navbar() {
  const {
    resolvedTheme,
    setTheme,
  } =
    useTheme();

  const mounted =
    useSyncExternalStore(
      subscribe,
      getClientSnapshot,
      getServerSnapshot,
    );

  const isDark =
    mounted &&
    resolvedTheme ===
      "dark";

  function toggleTheme() {
    setTheme(
      isDark
        ? "light"
        : "dark",
    );
  }

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      {/* =================================================
          BRAND
      ================================================= */}

      <Link
        href="/"
        className="flex items-center gap-2"
      >
        <Dumbbell className="h-6 w-6 text-amber-500" />

        <span className="text-xl font-bold text-gray-900 dark:text-white">
          Muscle Fitness
        </span>
      </Link>

      {/* =================================================
          NAVIGATION
      ================================================= */}

      <div className="flex items-center gap-6 text-gray-600 dark:text-gray-300">
        <Link
          href="/camera"
          className="flex items-center gap-1 transition-colors hover:text-amber-500"
        >
          <Camera className="h-4 w-4" />

          <span>
            Camera
          </span>
        </Link>

        <Link
          href="/progress"
          className="flex items-center gap-1 transition-colors hover:text-amber-500"
        >
          <BarChart3 className="h-4 w-4" />

          <span>
            Progress
          </span>
        </Link>

        <Link
          href="/nutrition"
          className="flex items-center gap-1 transition-colors hover:text-amber-500"
        >
          <Apple className="h-4 w-4" />

          <span>
            Nutrition
          </span>
        </Link>

        <Link
          href="/community"
          className="flex items-center gap-1 transition-colors hover:text-amber-500"
        >
          <MessageCircle className="h-4 w-4" />

          <span>
            Community
          </span>
        </Link>

        {/* =================================================
            THEME
        ================================================= */}

        <button
          type="button"
          onClick={
            toggleTheme
          }
          aria-label={
            isDark
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
          title={
            isDark
              ? "Light mode"
              : "Dark mode"
          }
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {!mounted ? (
            <Moon className="h-4 w-4" />
          ) : isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>
    </nav>
  );
}