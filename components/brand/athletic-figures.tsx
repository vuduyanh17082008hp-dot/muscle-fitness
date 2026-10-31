/*
 * Iron & Paper illustrations (from the approved V4 reference). Pure
 * decoration: aria-hidden, no motion, and no numbers or labels drawn
 * into the art, so nothing here can read as an athlete's data.
 * Drawn for paper surfaces.
 */

const IRON = "#181B19";
const PAPER = "#F4F1E8";
const LIME = "#D8F15A";
const VIOLET = "#7B63A3";
const HAIRLINE = "#D7D4CA";

type FigureProps = { className?: string };

export function SquatLifterFigure({ className = "size-48" }: FigureProps) {
  return (
    <svg viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="120" cy="205" rx="60" ry="8" fill={IRON} opacity="0.15" />
      <line x1="20" y1="95" x2="220" y2="95" stroke={IRON} strokeWidth="8" strokeLinecap="round" />
      <rect x="35" y="65" width="12" height="60" rx="3" fill={IRON} />
      <rect x="50" y="70" width="10" height="50" rx="2" fill={LIME} stroke={IRON} strokeWidth="2" />
      <rect x="193" y="65" width="12" height="60" rx="3" fill={IRON} />
      <rect x="180" y="70" width="10" height="50" rx="2" fill={LIME} stroke={IRON} strokeWidth="2" />
      <circle cx="120" cy="80" r="14" fill={PAPER} stroke={IRON} strokeWidth="3" />
      <path d="M110 75C115 70 128 70 132 75" stroke={IRON} strokeWidth="3" strokeLinecap="round" />
      <circle cx="90" cy="95" r="7" fill={PAPER} stroke={IRON} strokeWidth="3" />
      <circle cx="150" cy="95" r="7" fill={PAPER} stroke={IRON} strokeWidth="3" />
      <path d="M120 95L120 145" stroke={IRON} strokeWidth="18" strokeLinecap="round" />
      <rect x="108" y="125" width="24" height="12" rx="2" fill={LIME} stroke={IRON} strokeWidth="2" />
      <path d="M112 145L75 160L85 198" stroke={IRON} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M128 145L165 160L155 198" stroke={IRON} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="75" y="196" width="20" height="8" rx="2" fill={IRON} />
      <rect x="145" y="196" width="20" height="8" rx="2" fill={IRON} />
    </svg>
  );
}

export function GymPartnersFigure({ className = "size-48" }: FigureProps) {
  return (
    <svg viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false" className={className}>
      <circle cx="120" cy="120" r="95" fill={PAPER} stroke={HAIRLINE} strokeWidth="2" strokeDasharray="4 4" />
      <ellipse cx="120" cy="210" rx="70" ry="10" fill={IRON} opacity="0.1" />
      <circle cx="80" cy="75" r="13" fill={PAPER} stroke={IRON} strokeWidth="3" />
      <path d="M80 90L85 145" stroke={IRON} strokeWidth="14" strokeLinecap="round" />
      <path d="M85 145L65 195" stroke={IRON} strokeWidth="11" strokeLinecap="round" />
      <path d="M85 145L100 195" stroke={IRON} strokeWidth="11" strokeLinecap="round" />
      <path d="M82 105L115 80" stroke={IRON} strokeWidth="9" strokeLinecap="round" />
      <circle cx="160" cy="75" r="13" fill={PAPER} stroke={IRON} strokeWidth="3" />
      <path d="M160 90L155 145" stroke={VIOLET} strokeWidth="14" strokeLinecap="round" />
      <path d="M155 145L140 195" stroke={IRON} strokeWidth="11" strokeLinecap="round" />
      <path d="M155 145L175 195" stroke={IRON} strokeWidth="11" strokeLinecap="round" />
      <path d="M158 105L125 80" stroke={IRON} strokeWidth="9" strokeLinecap="round" />
      <polygon points="120,65 124,75 135,77 126,84 128,95 120,88 112,95 114,84 105,77 116,75" fill={LIME} stroke={IRON} strokeWidth="1.5" />
    </svg>
  );
}

export function PlannerFigure({ className = "size-48" }: FigureProps) {
  return (
    <svg viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false" className={className}>
      <rect x="60" y="40" width="85" height="110" rx="8" fill="#FFFFFF" stroke={HAIRLINE} strokeWidth="2" transform="rotate(-6 60 40)" />
      <line x1="75" y1="65" x2="125" y2="60" stroke={HAIRLINE} strokeWidth="4" strokeLinecap="round" />
      <line x1="75" y1="80" x2="120" y2="75" stroke={HAIRLINE} strokeWidth="4" strokeLinecap="round" />
      <line x1="75" y1="95" x2="110" y2="90" stroke={LIME} strokeWidth="4" strokeLinecap="round" />
      <rect x="70" y="50" width="90" height="115" rx="8" fill={PAPER} stroke={IRON} strokeWidth="2" />
      <line x1="85" y1="75" x2="145" y2="75" stroke={IRON} strokeWidth="4" strokeLinecap="round" />
      <line x1="85" y1="95" x2="135" y2="95" stroke="#646A65" strokeWidth="3" strokeLinecap="round" />
      <line x1="85" y1="110" x2="140" y2="110" stroke={VIOLET} strokeWidth="3" strokeLinecap="round" />
      <circle cx="140" cy="135" r="8" fill={LIME} stroke={IRON} strokeWidth="2" />
      <ellipse cx="170" cy="195" rx="40" ry="7" fill={IRON} opacity="0.1" />
      <circle cx="175" cy="90" r="14" fill={PAPER} stroke={IRON} strokeWidth="3" />
      <circle cx="185" cy="82" r="6" fill={IRON} />
      <path d="M175 105L170 155" stroke={IRON} strokeWidth="16" strokeLinecap="round" />
      <path d="M170 115L145 130L125 125" stroke={IRON} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M170 155L160 195" stroke={IRON} strokeWidth="11" strokeLinecap="round" />
      <path d="M170 155L185 195" stroke={VIOLET} strokeWidth="11" strokeLinecap="round" />
      <rect x="40" y="165" width="160" height="12" rx="3" fill={IRON} />
    </svg>
  );
}
