"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";

import { cn } from "@/lib/utils";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type DanteRobotState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "success"
  | "error";

export type DanteRobotSize = "sm" | "md" | "lg" | "hero";

export type DanteRobotProps = {
  state?: DanteRobotState;
  size?: DanteRobotSize;
  interactive?: boolean;
  className?: string;
  /** Accessible label. Omit to keep the mascot fully decorative. */
  ariaLabel?: string;
  onClick?: () => void;
};

/* =========================================================
   DESIGN TOKENS — Muscle Fitness / Dante identity
========================================================= */

const AMBER = "#f4bd25";
const AMBER_SOFT = "#ffd479";
const IVORY = "#fff4de";
const SHELL = "#23262c";
const SHELL_LIGHT = "#3c414a";
const SHELL_DARK = "#131519";
const VISOR = "#07080a";
const METAL = "#7b818a";
const METAL_DARK = "#4d525a";

const SIZE_PX: Record<DanteRobotSize, number> = {
  sm: 116,
  md: 168,
  lg: 216,
  hero: 272,
};

/* =========================================================
   TIMING HELPERS — deliberately non-mechanical
========================================================= */

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/* =========================================================
   COMPONENT
========================================================= */

export function DanteRobot({
  state = "idle",
  size = "md",
  interactive = false,
  className,
  ariaLabel,
  onClick,
}: DanteRobotProps) {
  const uid = useId().replace(/[:]/g, "");
  const reduceMotion = useReducedMotion();
  const px = SIZE_PX[size];

  const containerRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------------
     BLINK — irregular interval, never on a fixed cadence
  ------------------------------------------------------- */

  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;

    let timeoutId: number;

    const scheduleBlink = () => {
      timeoutId = window.setTimeout(
        () => {
          setBlinking(true);

          window.setTimeout(() => {
            setBlinking(false);
            scheduleBlink();
          }, 140);
        },
        randomBetween(3000, 7000),
      );
    };

    scheduleBlink();

    return () => window.clearTimeout(timeoutId);
  }, [reduceMotion]);

  /* -------------------------------------------------------
     OCCASIONAL HEAD TILT
  ------------------------------------------------------- */

  const [tilt, setTilt] = useState(0);
  const appliedTilt = state === "idle" && !reduceMotion ? tilt : 0;

  useEffect(() => {
    if (reduceMotion || state !== "idle") {
      return;
    }

    let timeoutId: number;

    const scheduleTilt = () => {
      timeoutId = window.setTimeout(
        () => {
          const direction = Math.random() > 0.5 ? 1 : -1;
          setTilt(direction * randomBetween(1, 2));

          window.setTimeout(() => {
            setTilt(0);
            scheduleTilt();
          }, 1200);
        },
        randomBetween(6000, 12000),
      );
    };

    scheduleTilt();

    return () => window.clearTimeout(timeoutId);
  }, [reduceMotion, state]);

  /* -------------------------------------------------------
     CURSOR EYE TRACKING — a few px only, pointer devices only
  ------------------------------------------------------- */

  const eyeX = useSpring(0, { stiffness: 120, damping: 14 });
  const eyeY = useSpring(0, { stiffness: 120, damping: 14 });

  const trackingEnabled = interactive && !reduceMotion;

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!trackingEnabled || !containerRef.current) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;

    eyeX.set(Math.max(-3, Math.min(3, relX * 7)));
    eyeY.set(Math.max(-2, Math.min(2, relY * 5)));
  }

  function handleMouseLeave() {
    eyeX.set(0);
    eyeY.set(0);
  }

  /* -------------------------------------------------------
     STATE-DRIVEN VARIANTS
  ------------------------------------------------------- */

  const headGroupAnimate = useMemo(() => {
    if (state === "listening") {
      return { y: -2, rotate: appliedTilt };
    }

    return { y: 0, rotate: appliedTilt };
  }, [state, appliedTilt]);

  const coreGlowAnimate = useMemo(() => {
    if (reduceMotion) {
      return { opacity: state === "thinking" || state === "listening" ? 0.55 : 0.35 };
    }

    if (state === "thinking") {
      return { opacity: [0.35, 0.7, 0.35], scale: [1, 1.08, 1] };
    }

    if (state === "listening") {
      return { opacity: 0.65, scale: 1.08 };
    }

    if (state === "speaking") {
      return { opacity: [0.4, 0.6, 0.42, 0.58, 0.4], scale: [1, 1.05, 1, 1.04, 1] };
    }

    if (state === "success") {
      return { opacity: 0.85, scale: 1.15 };
    }

    if (state === "error") {
      return { opacity: 0.2, scale: 0.92 };
    }

    return { opacity: [0.3, 0.42, 0.3], scale: [1, 1.03, 1] };
  }, [state, reduceMotion]);

  const eyeScale = getEyeScale(state, blinking);
  const eyeColor = state === "error" ? METAL : AMBER_SOFT;
  const eyeGlow = state === "error" ? 0.25 : state === "listening" ? 1 : 0.75;

  const showOrbit = state === "thinking" && !reduceMotion;
  const showSmile = state === "success";
  const showConcern = state === "error";

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={cn(
        "relative select-none",
        onClick && "cursor-pointer",
        className,
      )}
      style={{ width: px, height: px * 1.12 }}
      {...(ariaLabel
        ? { role: "img", "aria-label": ariaLabel }
        : { "aria-hidden": "true" })}
    >
      {/* FLOAT LAYER */}
      <motion.div
        className="h-full w-full"
        animate={
          reduceMotion
            ? { y: 0 }
            : { y: [0, -4, 0] }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: randomBetween(3.4, 4.6),
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
      >
        {/* HOVER LAYER */}
        <motion.div
          className="h-full w-full"
          whileHover={
            interactive
              ? { y: -2, scale: 1.015 }
              : undefined
          }
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <svg
            viewBox="0 0 200 224"
            width="100%"
            height="100%"
            fill="none"
          >
            <defs>
              <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SHELL_LIGHT} />
                <stop offset="55%" stopColor={SHELL} />
                <stop offset="100%" stopColor={SHELL_DARK} />
              </linearGradient>

              <linearGradient id={`${uid}-visor`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#101216" />
                <stop offset="100%" stopColor={VISOR} />
              </linearGradient>

              <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={AMBER} stopOpacity="0.9" />
                <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
              </radialGradient>

              <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={METAL} />
                <stop offset="100%" stopColor={METAL_DARK} />
              </linearGradient>

              <filter id={`${uid}-blur`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>

            {/* SHADOW */}
            <motion.ellipse
              cx="100"
              cy="214"
              rx={42}
              ry="7"
              fill="#000"
              opacity={0.3}
              animate={
                reduceMotion
                  ? { opacity: 0.28 }
                  : { opacity: [0.3, 0.18, 0.3], rx: [42, 37, 42] }
              }
              transition={
                reduceMotion
                  ? undefined
                  : {
                      duration: randomBetween(3.4, 4.6),
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
              }
            />

            {/* ARMS (behind torso) */}
            <path
              d="M62 148 C 46 150, 34 160, 32 178 C 31 186, 36 191, 44 190 C 52 189, 57 182, 58 174 L 63 152 Z"
              fill={`url(#${uid}-shell)`}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="1"
            />
            <circle cx="61" cy="148" r="9" fill={`url(#${uid}-metal)`} />

            <path
              d="M138 148 C 154 150, 166 160, 168 178 C 169 186, 164 191, 156 190 C 148 189, 143 182, 142 174 L 137 152 Z"
              fill={`url(#${uid}-shell)`}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="1"
            />
            <circle cx="139" cy="148" r="9" fill={`url(#${uid}-metal)`} />

            {/* HEAD + TORSO GROUP */}
            <motion.g
              style={{ originX: "100px", originY: "150px" }}
              animate={headGroupAnimate}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* TORSO */}
              <rect
                x="52"
                y="120"
                width="96"
                height="86"
                rx="28"
                fill={`url(#${uid}-shell)`}
                stroke="rgba(255,255,255,0.05)"
              />
              <rect
                x="60"
                y="126"
                width="80"
                height="18"
                rx="9"
                fill="rgba(255,255,255,0.05)"
              />

              {/* CORE EMBLEM */}
              <motion.circle
                cx="100"
                cy="162"
                r="20"
                fill={`url(#${uid}-glow)`}
                filter={`url(#${uid}-blur)`}
                opacity={0.3}
                animate={coreGlowAnimate}
                transition={
                  reduceMotion
                    ? { duration: 0.4 }
                    : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                }
              />
              <circle
                cx="100"
                cy="162"
                r="14"
                fill="#0c0d10"
                stroke={AMBER}
                strokeOpacity="0.55"
                strokeWidth="1.5"
              />
              <path
                d="M94 153 L94 171 L100 171 C 106.5 171 111 166.6 111 162 C 111 157.4 106.5 153 100 153 Z M99 157.4 L100 157.4 C 104 157.4 106.4 159.3 106.4 162 C 106.4 164.7 104 166.6 100 166.6 L99 166.6 Z"
                fill={state === "error" ? METAL : AMBER}
                opacity={state === "error" ? 0.5 : 1}
              />

              {/* NECK */}
              <rect x="90" y="100" width="20" height="24" rx="6" fill={SHELL_DARK} />

              {/* HEAD */}
              <rect
                x="54"
                y="18"
                width="92"
                height="86"
                rx="36"
                fill={`url(#${uid}-shell)`}
                stroke="rgba(255,255,255,0.06)"
              />

              {/* status light */}
              <motion.circle
                cx="100"
                cy="14"
                r="3"
                fill={AMBER}
                opacity={0.8}
                animate={
                  reduceMotion
                    ? { opacity: 0.8 }
                    : { opacity: [0.5, 1, 0.5] }
                }
                transition={
                  reduceMotion
                    ? undefined
                    : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                }
              />

              {/* VISOR */}
              <rect
                x="70"
                y="44"
                width="60"
                height="38"
                rx="19"
                fill={`url(#${uid}-visor)`}
              />
              <rect
                x="74"
                y="47"
                width="52"
                height="10"
                rx="5"
                fill="rgba(255,255,255,0.06)"
              />

              {/* EYES — cursor tracked as a pair */}
              <motion.g style={{ x: eyeX, y: eyeY }}>
                <Eye
                  cx={86}
                  cy={63}
                  scale={eyeScale}
                  color={eyeColor}
                  glow={eyeGlow}
                  state={state}
                  reduceMotion={!!reduceMotion}
                  glowFilterId={`${uid}-blur`}
                />
                <Eye
                  cx={114}
                  cy={63}
                  scale={eyeScale}
                  color={eyeColor}
                  glow={eyeGlow}
                  state={state}
                  reduceMotion={!!reduceMotion}
                  glowFilterId={`${uid}-blur`}
                />

                {/* SUCCESS — soft upward curve beneath the eyes */}
                <motion.path
                  d="M80 71 Q100 79 120 71"
                  stroke={IVORY}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  fill="none"
                  opacity={0}
                  animate={{ opacity: showSmile ? 0.9 : 0 }}
                  transition={{ duration: 0.3 }}
                />

                {/* ERROR — restrained downward concern */}
                <motion.path
                  d="M80 55 Q100 51 120 55"
                  stroke={METAL}
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  opacity={0}
                  animate={{ opacity: showConcern ? 0.55 : 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.g>

              {/* THINKING — restrained orbit indicator */}
              {showOrbit && (
                <motion.g
                  style={{ originX: "100px", originY: "162px" }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
                >
                  <circle cx="100" cy="140" r="2.4" fill={AMBER_SOFT} />
                </motion.g>
              )}
            </motion.g>
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* =========================================================
   EYE
========================================================= */

function getEyeScale(state: DanteRobotState, blinking: boolean) {
  if (blinking) return { rx: 7, ry: 0.6 };

  switch (state) {
    case "listening":
      return { rx: 8, ry: 10 };
    case "thinking":
      return { rx: 7, ry: 6.5 };
    case "success":
      return { rx: 6.5, ry: 4 };
    case "error":
      return { rx: 6.5, ry: 5 };
    default:
      return { rx: 7, ry: 8.5 };
  }
}

type EyeProps = {
  cx: number;
  cy: number;
  scale: { rx: number; ry: number };
  color: string;
  glow: number;
  state: DanteRobotState;
  reduceMotion: boolean;
  glowFilterId: string;
};

function Eye({ cx, cy, scale, color, glow, state, reduceMotion, glowFilterId }: EyeProps) {
  const thinkingShift =
    state === "thinking" && !reduceMotion ? { x: [-2, 2, -2] } : { x: 0 };

  const eyeAnimate =
    state === "speaking" && !reduceMotion
      ? {
          rx: scale.rx,
          ry: [scale.ry, scale.ry * 0.7, scale.ry, scale.ry * 0.85, scale.ry],
        }
      : { rx: scale.rx, ry: scale.ry };

  return (
    <motion.g animate={thinkingShift} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
      <ellipse cx={cx} cy={cy} rx={scale.rx + 4} ry={scale.ry + 4} fill={color} opacity={glow * 0.18} filter={`url(#${glowFilterId})`} />
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={scale.rx}
        ry={scale.ry}
        animate={eyeAnimate}
        transition={{ duration: state === "speaking" ? 1.6 : 0.35, repeat: state === "speaking" ? Infinity : 0, ease: "easeInOut" }}
        fill={color}
        opacity={state === "error" ? 0.55 : 0.95}
      />
    </motion.g>
  );
}

export default DanteRobot;
