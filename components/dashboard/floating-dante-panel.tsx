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
    <div className="mt-3 flex items-center justify-between border-t border-mf-glass-border pt-3">
      <Link href="/dashboard/ai-coach" className="text-xs font-bold text-mf-glass-dante hover:text-mf-glass-brand">
        Expand to Dante →
      </Link>
    </div>
  );
}

/**
 * Desktop: a small anchored card near the trigger, no backdrop —
 * deliberately not BottomSheet's centered-modal mode, which dims the
 * whole screen for what should read as a quick contextual popover, not
 * a full dialog. Closes on outside click or Escape.
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
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Ask Dante"
      className="fixed bottom-24 right-6 z-40 w-[380px] rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <DanteMascot size="xs" state="idle" />
          <div>
            <p className="text-sm font-bold text-mf-glass-text">Dante</p>
            <p className="text-[11px] text-mf-glass-text-muted">Muscle Fitness intelligence</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close Dante"
          className="grid size-8 shrink-0 place-items-center rounded-full text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <DanteChat compact heroSubtitle={contextualPrompt} />

      <PanelFooter />
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
