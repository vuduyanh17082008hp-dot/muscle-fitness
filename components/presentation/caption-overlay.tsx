/**
 * Persistent caption bar (spec Part F §33: "Provide captions").
 *
 * Always rendered when a beat has a caption — this IS the
 * presentation's narration for anyone who can't hear (or when no
 * audio file exists at all, which is the common case in this pass —
 * see docs/presentation.md "What is real vs demo"). Captions are
 * never optional decoration here; they're the primary way the
 * script's words reach the audience.
 */
export function CaptionOverlay({ text }: { text: string | null }) {
  if (!text) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-6 pb-10 sm:pb-16">
      <p
        className="max-w-3xl text-balance rounded-2xl bg-black/60 px-6 py-4 text-center text-lg font-bold leading-snug text-white backdrop-blur-sm sm:text-2xl"
        aria-live="polite"
      >
        {text}
      </p>
    </div>
  );
}
