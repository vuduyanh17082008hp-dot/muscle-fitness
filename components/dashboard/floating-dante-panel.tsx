"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import DanteChat from "@/components/dante-chat";
import { BottomSheet } from "@/components/ui/bottom-sheet";

type FloatingDantePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDesktop: boolean;
  contextualPrompt: string;
};

function PanelFooter() {
  return (
    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
      <Link href="/dashboard/ai-coach" className="text-xs font-bold text-mf-glass-dante hover:underline">
        Open full Dante chat →
      </Link>
    </div>
  );
}

/**
 * Desktop: Calm Dante Performance Assistant Panel.
 */
function DesktopPanel({
  open,
  onOpenChange,
  contextualPrompt,
}: Omit<FloatingDantePanelProps, "isDesktop">) {
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Ask Dante"
        className="pointer-events-auto fixed bottom-24 right-6 z-40 flex h-[min(80vh,640px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-mf-glass-bg-deep/95 backdrop-blur-xl p-4 shadow-2xl"
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div>
              <p className="text-xs font-bold text-mf-glass-text">Dante</p>
              <p className="text-xs text-mf-glass-text-muted">Training, nutrition and recovery</p>
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

        {/* The panel has a fixed height, so the chat fills what's left and its composer is never pushed below the footer. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <DanteChat compact heroSubtitle={contextualPrompt} restoreHistory className="h-full max-h-full min-h-0" />
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
      <DanteChat compact heroSubtitle={contextualPrompt} restoreHistory />
      <PanelFooter />
    </BottomSheet>
  );
}

export default FloatingDantePanel;
