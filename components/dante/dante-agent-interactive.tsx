"use client";

import { useEffect, useState, useId } from "react";
import styles from "./dante-agent-interactive.module.css";

type ChipOption = {
  id: string;
  label: string;
  badge: string;
  response: string;
  tilt: number;
};

const CHIPS: ChipOption[] = [
  {
    id: "energetic",
    label: "🔥 Tràn đầy năng lượng",
    badge: "DANTE AI • ACTIVE MODE",
    response: "Tuyệt vời! Dante đã tối ưu hóa bài tập hôm nay để đẩy cao hiệu suất tối đa.",
    tilt: -2.5,
  },
  {
    id: "fatigued",
    label: "⚡ Hơi mỏi cơ",
    badge: "DANTE AI • AUTOREGULATING",
    response: "Ghi nhận! Dante khuyến nghị hạ 10% RPE và tăng cường giãn cơ phục hồi.",
    tilt: 0,
  },
  {
    id: "rest",
    label: "🛌 Cần nghỉ ngơi sâu",
    badge: "DANTE AI • RECOVERY MODE",
    response: "Hiểu rồi! Dante đã kích hoạt chế độ Active Recovery & tối ưu giấc ngủ đêm nay.",
    tilt: 2.5,
  },
];

const DEFAULT_GREETING = "Hôm nay bạn cảm thấy thế nào? Cơ thể sẵn sàng cho buổi phục hồi tích cực chưa?";
const DEFAULT_BADGE = "DANTE AI • ONLINE";

export function DanteAgentInteractive() {
  const uid = useId().replace(/[:]/g, "");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [hoveredChip, setHoveredChip] = useState<number | null>(null);

  const activeBadge = selectedChip
    ? CHIPS.find((c) => c.id === selectedChip)?.badge ?? DEFAULT_BADGE
    : DEFAULT_BADGE;

  const targetText = selectedChip
    ? CHIPS.find((c) => c.id === selectedChip)?.response ?? DEFAULT_GREETING
    : DEFAULT_GREETING;

  // Typewriter effect
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setDisplayedText("");
    setIsTyping(true);
    let index = 0;

    const timer = setInterval(() => {
      if (index < targetText.length) {
        setDisplayedText(targetText.slice(0, index + 1));
        index++;
      } else {
        setIsTyping(false);
        clearInterval(timer);
      }
    }, 22);

    return () => clearInterval(timer);
  }, [targetText]);

  // Determine current Dante head/body tilt based on hover or selection
  const currentTilt =
    hoveredChip !== null
      ? CHIPS[hoveredChip]?.tilt ?? 0
      : selectedChip
      ? CHIPS.find((c) => c.id === selectedChip)?.tilt ?? 0
      : 0;

  const isInteracting = hoveredChip !== null || selectedChip !== null;

  return (
    <div className={`relative flex flex-col items-center justify-between w-full h-full p-3 sm:p-4 rounded-2xl bg-black/20 border border-white/10 ${styles.agentContainer}`}>
      {/* 1. GLASSMORPHIC SPEECH BUBBLE */}
      <div className={`relative w-full p-3 sm:p-3.5 rounded-xl ${styles.dialogueBubble}`}>
        {/* Status Badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D4FF00]/10 border border-[#D4FF00]/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#D4FF00]">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#D4FF00] opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#D4FF00]" />
            </span>
            {activeBadge}
          </span>
          <span className="text-[9px] font-mono text-zinc-500">v4.0 AUTONOMOUS</span>
        </div>

        {/* Typewriter Dialogue Text */}
        <p className="min-h-[44px] text-xs leading-5 font-medium text-zinc-100">
          {displayedText}
          {isTyping && <span className={`inline-block w-1.5 h-3 ml-0.5 bg-[#D4FF00] align-middle ${styles.cursorBlink}`} />}
        </p>

        {/* Quick-Reply Interactive Chips */}
        <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-white/10">
          {CHIPS.map((chip, index) => {
            const isSelected = selectedChip === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedChip(isSelected ? null : chip.id)}
                onPointerEnter={() => setHoveredChip(index)}
                onPointerLeave={() => setHoveredChip(null)}
                className={`rounded-lg px-2.5 py-1 text-[10.5px] font-semibold tracking-wide ${styles.chipButton} ${
                  isSelected ? styles.chipButtonActive : "text-zinc-300"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. DANTE 3D/SVG CHARACTER & MOTION EFFECTS */}
      <div className="relative mt-4 flex flex-col items-center justify-center w-full min-h-[150px]">
        {/* Floating Robot Wrapper */}
        <div
          className={`relative flex items-center justify-center transition-transform duration-300 ease-out ${styles.danteFloatWrapper}`}
          style={{ transform: `rotate(${currentTilt}deg)` }}
        >
          <svg
            viewBox="0 0 160 170"
            className="w-[120px] h-[130px] sm:w-[135px] sm:h-[145px] drop-shadow-lg"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3c414a" />
                <stop offset="55%" stopColor="#23262c" />
                <stop offset="100%" stopColor="#131519" />
              </linearGradient>

              <linearGradient id={`${uid}-visor`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#101216" />
                <stop offset="100%" stopColor="#07080a" />
              </linearGradient>

              <radialGradient id={`${uid}-coreGlow`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#D4FF00" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#D4FF00" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* ARMS */}
            <path
              d="M44 110 C 30 112, 20 120, 18 135 C 17 142, 22 146, 28 145 C 35 144, 40 138, 41 130 L 45 114 Z"
              fill={`url(#${uid}-shell)`}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="1"
            />
            <path
              d="M116 110 C 130 112, 140 120, 142 135 C 143 142, 138 146, 132 145 C 125 144, 120 138, 119 130 L 115 114 Z"
              fill={`url(#${uid}-shell)`}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="1"
            />

            {/* TORSO */}
            <rect
              x="38"
              y="90"
              width="84"
              height="68"
              rx="22"
              fill={`url(#${uid}-shell)`}
              stroke="rgba(255,255,255,0.08)"
            />

            {/* CHEST EMBLEM - 'D' Core with Organic Breathing Pulse */}
            <circle
              cx="80"
              cy="124"
              r="16"
              fill={`url(#${uid}-coreGlow)`}
              className={styles.danteChestPulse}
            />
            <circle
              cx="80"
              cy="124"
              r="12"
              fill="#07080a"
              stroke="#D4FF00"
              strokeOpacity="0.8"
              strokeWidth="1.5"
            />
            <path
              d="M75 117 L75 131 L80 131 C 84.5 131 88 128 88 124 C 88 120 84.5 117 80 117 Z M78 120.5 L80 120.5 C 82.5 120.5 84 122 84 124 C 84 126 82.5 127.5 80 127.5 L78 127.5 Z"
              fill="#D4FF00"
            />

            {/* NECK */}
            <rect x="72" y="76" width="16" height="18" rx="4" fill="#131519" />

            {/* HEAD */}
            <rect
              x="36"
              y="14"
              width="88"
              height="68"
              rx="28"
              fill={`url(#${uid}-shell)`}
              stroke="rgba(255,255,255,0.08)"
            />

            {/* Top antenna status LED */}
            <circle cx="80" cy="10" r="2.5" fill="#D4FF00" className="animate-pulse" />

            {/* VISOR */}
            <rect
              x="50"
              y="32"
              width="60"
              height="34"
              rx="17"
              fill={`url(#${uid}-visor)`}
            />

            {/* NEON LIME PILL EYES (#D4FF00) WITH BLINK & AMBIENT GLOW */}
            <g
              className={`${styles.danteEyeGlow} ${isInteracting ? styles.danteEyeGlowActive : ""}`}
            >
              {/* Left Eye */}
              <rect
                x="62"
                y="43"
                width="11"
                height="12"
                rx="5.5"
                fill="#D4FF00"
                className={styles.danteEyeBlink}
              />
              {/* Right Eye */}
              <rect
                x="87"
                y="43"
                width="11"
                height="12"
                rx="5.5"
                fill="#D4FF00"
                className={styles.danteEyeBlink}
              />
            </g>
          </svg>
        </div>

        {/* Dynamic Floor Shadow underneath Dante (scales inversely with height) */}
        <div
          aria-hidden="true"
          className={`w-[70px] h-[8px] rounded-full bg-black/60 blur-xs ${styles.danteShadow}`}
        />
      </div>
    </div>
  );
}
