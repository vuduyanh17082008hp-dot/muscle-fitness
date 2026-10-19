"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import DanteChat from "@/components/dante-chat";
import { DanteMascot } from "@/components/dante/dante-mascot";
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
        Open full coach chat →
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
        className="fixed bottom-24 right-6 z-40 flex max-h-[min(80vh,640px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]/95 backdrop-blur-xl p-4 shadow-2xl"
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <DanteMascot size="xs" state="idle" />
            <div>
              <p className="text-xs font-bold text-mf-glass-text">Dante AI Coach</p>
              <p className="text-[11px] text-mf-glass-text-muted">Evidence-aware performance assistant</p>
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
