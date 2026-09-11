/**
 * Technical/data overlay layer for the Muscle Fitness visual system
 * (docs/VISUAL_SYSTEM.md). Pure decorative SVG — no photography
 * dependency, renders instantly, never blocks or 404s.
 *
 * Variants map to the page-visual language from the art direction:
 *  - "telemetry": biomechanical lines / joint-style nodes (Training)
 *  - "waveform": breathing/HR-style rhythm line (Recovery)
 *  - "nodes": connected network topology (Dante, Business)
 *  - "grid": restrained technical grid only (neutral default)
 */
export type VisualOverlayVariant = "grid" | "telemetry" | "waveform" | "nodes";

type VisualOverlayProps = {
  variant?: VisualOverlayVariant;
  className?: string;
};

export function VisualOverlay({ variant = "grid", className = "" }: VisualOverlayProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="mf-grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path
            d="M 42 0 L 0 0 0 42"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="url(#mf-grid)" />

      {variant === "telemetry" ? <TelemetryLines /> : null}
      {variant === "waveform" ? <WaveformLine /> : null}
      {variant === "nodes" ? <NodeNetwork /> : null}
    </svg>
  );
}

function TelemetryLines() {
  return (
    <g stroke="var(--color-accent, #b87333)" strokeWidth="1" fill="none" opacity="0.5">
      <path d="M 8% 20% L 30% 34% L 26% 58% L 44% 70%" strokeDasharray="4 5" />
      <circle cx="8%" cy="20%" r="2.5" fill="var(--color-accent, #b87333)" stroke="none" />
      <circle cx="30%" cy="34%" r="2.5" fill="var(--color-accent, #b87333)" stroke="none" />
      <circle cx="26%" cy="58%" r="2.5" fill="var(--color-accent, #b87333)" stroke="none" />
      <circle cx="44%" cy="70%" r="2.5" fill="var(--color-accent, #b87333)" stroke="none" />
      <path d="M 62% 12% L 70% 40% L 60% 62% L 74% 84%" strokeDasharray="4 5" opacity="0.6" />
    </g>
  );
}

function WaveformLine() {
  return (
    <path
      d="M 0 60% Q 8% 40%, 16% 60% T 32% 60% T 48% 45% T 64% 60% T 80% 55% T 100% 60%"
      fill="none"
      stroke="var(--color-accent, #b87333)"
      strokeWidth="1.5"
      opacity="0.55"
    />
  );
}

function NodeNetwork() {
  const nodes = [
    { x: "18%", y: "24%" },
    { x: "18%", y: "50%" },
    { x: "18%", y: "76%" },
    { x: "62%", y: "50%" },
  ];

  return (
    <g opacity="0.55">
      {nodes.map((node, index) => (
        <line
          key={index}
          x1={node.x}
          y1={node.y}
          x2="62%"
          y2="50%"
          stroke="var(--color-accent, #b87333)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}
      {nodes.map((node, index) => (
        <circle
          key={`n-${index}`}
          cx={node.x}
          cy={node.y}
          r="3"
          fill="rgba(255,255,255,0.6)"
        />
      ))}
      <circle cx="62%" cy="50%" r="5" fill="var(--color-accent, #b87333)" />
    </g>
  );
}
