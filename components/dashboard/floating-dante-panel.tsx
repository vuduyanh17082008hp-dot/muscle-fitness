"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import DanteChat from "@/components/dante-chat";
import { DanteMascot } from "@/components/dante/dante-mascot";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import hudStyles from "@/components/dante/holographic-telemetry-pod.module.css";

type FloatingDantePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDesktop: boolean;
  contextualPrompt: string;
};

function PanelFooter() {
  return (
    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
      <Link href="/dashboard/ai-coach" className="text-xs font-bold text-[#D4FF00] hover:underline">
        Expand to Full Biometric HUD →
      </Link>
    </div>
  );
}

/**
 * Desktop: Holographic Telemetry Pod with 3D Parallax Hover.
 * Reacts organically to user cursor coordinates with constrained 3D tilt.
 */
function DesktopPanel({
  open,
  onOpenChange,
  contextualPrompt,
}: Omit<FloatingDantePanelProps, "isDesktop">) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    // Constrain tilt between -4deg and 4deg
    setTilt({
      x: Math.max(-4, Math.min(4, -py * 8)),
      y: Math.max(-4, Math.min(4, px * 8)),
    });
  }

  function handlePointerLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div
      className={hudStyles.parallaxPerspective}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Ask Dante"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        className={`fixed bottom-24 right-6 z-40 flex max-h-[min(80vh,640px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] border border-[#D4FF00]/30 bg-[#0e1014]/92 backdrop-blur-xl p-4 shadow-[0_24px_70px_rgba(0,0,0,0.85)] ${hudStyles.parallaxCard}`}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <DanteMascot size="xs" state="idle" />
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#D4FF00]">DANTE BIOMETRIC HUD</p>
              <p className="text-[10px] font-mono text-zinc-400">TELEMETRY POD v4.0</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close Dante"
            className="grid size-7 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <DanteChat compact heroSubtitle={contextualPrompt} />
        </div>

        <div className="shrink-0">
          <PanelFooter />
        </div>
      </div>
    </div>
  );
}

export function FloatingDantePanel({ open, onOpenChange, isDesktop, contextualPrompt }: FloatingDantePanelProps) {
  if (isDesktop) {
    return <DesktopPanel open={open} onOpenChange={onOpenChange} contextualPrompt={contextualPrompt} />;
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Dante">
      <DanteChat compact heroSubtitle={contextualPrompt} />
      <PanelFooter />
    </BottomSheet>
  );
}

export default FloatingDantePanel;
