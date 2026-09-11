import { describe, expect, it } from "vitest";
import { computeMuscleVolume, type ExerciseSetLog } from "@/lib/training/volume-engine";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";

const BENCH_PRESS = "bench-press-id";
const CABLE_FLY = "cable-fly-id";

function contribution(
  muscle: ExerciseMuscleContribution["muscle"],
  role: ExerciseMuscleContribution["role"],
  value: number,
): ExerciseMuscleContribution {
  return { muscle, role, contribution: value, mappingVersion: 1, source: "system" };
}

const BENCH_PRESS_CONTRIBUTIONS: ExerciseMuscleContribution[] = [
  contribution("chest", "primary", 1.0),
  contribution("triceps", "secondary", 0.5),
  contribution("anterior_deltoid", "secondary", 0.5),
];

describe("computeMuscleVolume", () => {
  it("splits Bench Press working sets into direct chest and indirect triceps/anterior-deltoid volume", () => {
    const sets: ExerciseSetLog[] = [
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
    ];

    const contributions = new Map([[BENCH_PRESS, BENCH_PRESS_CONTRIBUTIONS]]);
    const result = computeMuscleVolume(sets, contributions);

    expect(result.get("chest")?.directSets).toBe(4);
    expect(result.get("chest")?.totalEffectiveSets).toBe(4);

    expect(result.get("triceps")?.indirectRawSets).toBe(4);
    expect(result.get("triceps")?.indirectEffectiveSets).toBe(2);
    expect(result.get("triceps")?.totalEffectiveSets).toBe(2);

    expect(result.get("anterior_deltoid")?.totalEffectiveSets).toBe(2);
  });

  it("excludes warm-up sets from volume entirely", () => {
    const sets: ExerciseSetLog[] = [
      { exerciseId: BENCH_PRESS, setType: "warmup", completed: true },
      { exerciseId: BENCH_PRESS, setType: "warmup", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
    ];

    const contributions = new Map([[BENCH_PRESS, BENCH_PRESS_CONTRIBUTIONS]]);
    const result = computeMuscleVolume(sets, contributions);

    expect(result.get("chest")?.directSets).toBe(2);
  });

  it("excludes sets marked not completed", () => {
    const sets: ExerciseSetLog[] = [
      { exerciseId: BENCH_PRESS, setType: "working", completed: false },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
    ];

    const contributions = new Map([[BENCH_PRESS, BENCH_PRESS_CONTRIBUTIONS]]);
    const result = computeMuscleVolume(sets, contributions);

    expect(result.get("chest")?.directSets).toBe(1);
  });

  it("aggregates across multiple exercises contributing to the same muscle", () => {
    const sets: ExerciseSetLog[] = [
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: BENCH_PRESS, setType: "working", completed: true },
      { exerciseId: CABLE_FLY, setType: "working", completed: true },
      { exerciseId: CABLE_FLY, setType: "working", completed: true },
    ];

    const contributions = new Map<string, ExerciseMuscleContribution[]>([
      [BENCH_PRESS, BENCH_PRESS_CONTRIBUTIONS],
      [
        CABLE_FLY,
        [contribution("chest", "primary", 1.0), contribution("anterior_deltoid", "secondary", 0.25)],
      ],
    ]);

    const result = computeMuscleVolume(sets, contributions);

    // 4 direct from bench + 2 direct from cable fly = 6
    expect(result.get("chest")?.totalEffectiveSets).toBe(6);
    // anterior deltoid: 4*0.5 (bench) + 2*0.25 (cable fly) = 2 + 0.5 = 2.5
    expect(result.get("anterior_deltoid")?.totalEffectiveSets).toBe(2.5);
  });

  it("skips exercises with no resolvable contribution mapping", () => {
    const sets: ExerciseSetLog[] = [
      { exerciseId: "unmapped-exercise", setType: "working", completed: true },
    ];

    const result = computeMuscleVolume(sets, new Map());

    expect(result.size).toBe(0);
  });
});
