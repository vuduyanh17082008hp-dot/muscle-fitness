import type { AthleteState } from "@/lib/athlete-state/types";

export type MuscleMapEntry = AthleteState["training"]["muscles"][number];

export type MuscleMapProps = {
  muscles: MuscleMapEntry[];
  exerciseNames: Record<string, string>;
  hasAnyLoggedData: boolean;
  dataWindow: AthleteState["dataWindow"];
  /** Threaded from AthleteState.profile.availableEquipment — powers the Exercises tab's default equipment filter. */
  availableEquipment: string[];
};
