import type { AthleteState } from "@/lib/athlete-state/types";

export type MuscleMapEntry = AthleteState["training"]["muscles"][number];

export type MuscleMapProps = {
  muscles: MuscleMapEntry[];
  exerciseNames: Record<string, string>;
  hasAnyLoggedData: boolean;
  dataWindow: AthleteState["dataWindow"];
};
