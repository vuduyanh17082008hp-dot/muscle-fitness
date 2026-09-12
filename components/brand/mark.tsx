type BrandMarkProps = {
  className?: string;
};

/**
 * The Muscle Fitness monogram: an "M" whose outer uprights read as a
 * barbell's sleeves, capped by two plates, resting on a plinth line
 * for a quiet classical/columnar proportion. Single-color
 * (currentColor), no gradients or effects baked in — the wrapping
 * `Logo` component supplies color/background. Deliberately abstract
 * and geometric rather than a literal barbell/dumbbell illustration.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <line
        x1={5}
        y1={26.5}
        x2={27}
        y2={26.5}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.5}
      />

      <path
        d="M6 24 L6 9 L16 18.5 L26 9 L26 24"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx={6} cy={9} r={2.1} fill="currentColor" />
      <circle cx={26} cy={9} r={2.1} fill="currentColor" />
    </svg>
  );
}
