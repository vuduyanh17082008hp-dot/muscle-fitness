import { cn } from "@/lib/utils";

/*
 * Compact, static Dante mark for Iron & Paper surfaces (V4 reference,
 * idle face only). Decorative: the accessible name always comes from
 * adjacent text ("Dante"), so the SVG is aria-hidden. No animation,
 * no badge text — the label "Dante" lives in the UI, never "AI Coach".
 */
const SIZES = { sm: "size-10", md: "size-14", lg: "size-20" } as const;

export function DanteAvatar({ size = "sm", className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <svg viewBox="0 0 160 160" fill="none" aria-hidden="true" focusable="false" className={cn(SIZES[size], "shrink-0", className)}>
      <line x1="80" y1="20" x2="80" y2="45" stroke="#181B19" strokeWidth="5" strokeLinecap="round" />
      <circle cx="80" cy="18" r="8" fill="#D8F15A" stroke="#181B19" strokeWidth="3" />
      <rect x="22" y="60" width="12" height="34" rx="4" fill="#181B19" />
      <rect x="126" y="60" width="12" height="34" rx="4" fill="#181B19" />
      <rect x="30" y="42" width="100" height="74" rx="20" fill="#7B63A3" stroke="#181B19" strokeWidth="5" />
      <rect x="40" y="52" width="80" height="54" rx="14" fill="#181B19" />
      <circle cx="60" cy="76" r="7" fill="#D8F15A" />
      <circle cx="100" cy="76" r="7" fill="#D8F15A" />
      <circle cx="63" cy="74" r="2.5" fill="#181B19" />
      <circle cx="103" cy="74" r="2.5" fill="#181B19" />
      <rect x="68" y="92" width="24" height="6" rx="3" fill="#F4F1E8" />
      <path d="M52 116L80 135L108 116" stroke="#181B19" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 128C38 128 55 120 80 120C105 120 122 128 122 128L130 156H30L38 128Z" fill="#181B19" />
    </svg>
  );
}
