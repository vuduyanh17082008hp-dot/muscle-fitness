import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import { cn } from "@/lib/cn";

/**
 * ONE reusable anatomical muscle map — front + back outline, muscle
 * regions colored by involvement (primary/secondary/stabilizer).
 * Purely educational/schematic (simple ellipses over a body outline),
 * not a medical illustration. Muscle ids come from the same
 * lib/training/muscle-taxonomy.ts CanonicalMuscle taxonomy used by
 * the rest of Training Intelligence, so a workout's volume analytics
 * and its muscle-map highlight are guaranteed to agree on naming.
 */

export type MuscleInvolvement = "primary" | "secondary" | "stabilizer";

export type MuscleMapHighlights = Partial<Record<CanonicalMuscle, MuscleInvolvement>>;

type MuscleRegion = {
  muscle: CanonicalMuscle;
  view: "front" | "back" | "both";
  shape: { cx: number; cy: number; rx: number; ry: number };
  mirror?: boolean;
};

const REGIONS: MuscleRegion[] = [
  { muscle: "chest", view: "front", shape: { cx: 50, cy: 58, rx: 18, ry: 12 } },
  { muscle: "upper_chest", view: "front", shape: { cx: 50, cy: 46, rx: 16, ry: 7 } },
  { muscle: "anterior_deltoid", view: "front", shape: { cx: 28, cy: 46, rx: 7, ry: 8 }, mirror: true },
  { muscle: "lateral_deltoid", view: "both", shape: { cx: 25, cy: 44, rx: 6, ry: 7 }, mirror: true },
  { muscle: "rear_deltoid", view: "back", shape: { cx: 25, cy: 44, rx: 6, ry: 7 }, mirror: true },
  { muscle: "biceps", view: "front", shape: { cx: 22, cy: 66, rx: 5.5, ry: 10 }, mirror: true },
  { muscle: "triceps", view: "back", shape: { cx: 22, cy: 66, rx: 5.5, ry: 10 }, mirror: true },
  { muscle: "forearms", view: "both", shape: { cx: 18, cy: 88, rx: 4.5, ry: 11 }, mirror: true },
  { muscle: "abdominals", view: "front", shape: { cx: 50, cy: 84, rx: 12, ry: 16 } },
  { muscle: "trapezius", view: "back", shape: { cx: 50, cy: 38, rx: 14, ry: 9 } },
  { muscle: "upper_back", view: "back", shape: { cx: 50, cy: 56, rx: 17, ry: 11 } },
  { muscle: "latissimus_dorsi", view: "back", shape: { cx: 38, cy: 66, rx: 8, ry: 14 }, mirror: true },
  { muscle: "lower_back", view: "back", shape: { cx: 50, cy: 90, rx: 10, ry: 8 } },
  { muscle: "glutes", view: "back", shape: { cx: 50, cy: 108, rx: 14, ry: 10 } },
  { muscle: "quadriceps", view: "front", shape: { cx: 40, cy: 132, rx: 8, ry: 22 }, mirror: true },
  { muscle: "hamstrings", view: "back", shape: { cx: 40, cy: 132, rx: 8, ry: 22 }, mirror: true },
  { muscle: "calves", view: "both", shape: { cx: 40, cy: 176, rx: 6.5, ry: 16 }, mirror: true },
];

const INVOLVEMENT_FILL: Record<MuscleInvolvement, string> = {
  primary: "var(--color-domain-training)",
  secondary: "#f59e0b",
  stabilizer: "#60a5fa",
};

const INVOLVEMENT_OPACITY: Record<MuscleInvolvement, number> = {
  primary: 0.85,
  secondary: 0.55,
  stabilizer: 0.4,
};

function BodyOutline() {
  return (
    <path
      d="M50 8 C58 8 62 14 62 20 C62 26 58 30 58 34 C70 36 78 44 78 56 L78 96 C78 100 74 102 72 100 L70 108 C74 116 74 150 72 176 C71 190 69 200 66 214 L58 214 C57 198 56 180 55 164 C54 180 53 198 52 214 L44 214 C43 200 41 190 40 176 C38 150 38 116 42 108 L40 100 C38 102 34 100 34 96 L34 56 C34 44 42 36 54 34 C54 30 50 26 50 20 C50 14 42 8 50 8 Z"
      fill="none"
      stroke="rgba(255,255,255,0.14)"
      strokeWidth={1.5}
    />
  );
}

function MuscleLayer({
  view,
  highlights,
}: {
  view: "front" | "back";
  highlights: MuscleMapHighlights;
}) {
  return (
    <>
      {REGIONS.filter((region) => region.view === view || region.view === "both").map((region) => {
        const involvement = highlights[region.muscle];
        if (!involvement) return null;

        const fill = INVOLVEMENT_FILL[involvement];
        const opacity = INVOLVEMENT_OPACITY[involvement];
        const { cx, cy, rx, ry } = region.shape;

        return (
          <g key={`${view}-${region.muscle}`}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} opacity={opacity} />
            {region.mirror ? (
              <ellipse cx={100 - cx} cy={cy} rx={rx} ry={ry} fill={fill} opacity={opacity} />
            ) : null}
          </g>
        );
      })}
    </>
  );
}

export function MuscleMap({
  highlights,
  className,
}: {
  highlights: MuscleMapHighlights;
  className?: string;
}) {
  const legendEntries = Object.entries(highlights) as Array<[CanonicalMuscle, MuscleInvolvement]>;

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-4", className)}>
      <div className="grid grid-cols-2 gap-4">
        <figure>
          <svg viewBox="0 0 100 220" role="img" aria-label="Front muscle map" className="mx-auto h-48 w-full max-w-[110px]">
            <BodyOutline />
            <MuscleLayer view="front" highlights={highlights} />
          </svg>
          <figcaption className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            Front
          </figcaption>
        </figure>

        <figure>
          <svg viewBox="0 0 100 220" role="img" aria-label="Back muscle map" className="mx-auto h-48 w-full max-w-[110px]">
            <BodyOutline />
            <MuscleLayer view="back" highlights={highlights} />
          </svg>
          <figcaption className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            Back
          </figcaption>
        </figure>
      </div>

      {legendEntries.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-3">
          {legendEntries.map(([muscle, involvement]) => (
            <span key={muscle} className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: INVOLVEMENT_FILL[involvement], opacity: INVOLVEMENT_OPACITY[involvement] }}
              />
              {MUSCLE_DISPLAY_NAME[muscle]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
