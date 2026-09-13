import type { BaselineDeviation } from "@/lib/dante-core/personal-baseline";

/**
 * Performance / Recovery Radar (spec Part "4. PERFORMANCE / RECOVERY
 * RADAR"). Exactly three statuses — never a diagnostic label. Language
 * throughout stays "unusual recovery pattern," never "you are sick"
 * or any other medical framing.
 */

export type RadarStatus = "normal" | "watch" | "significant_deviation";

export type RadarSignalName = "hrv" | "resting_hr" | "sleep" | "recovery_score";

export type RadarSignal = {
  name: RadarSignalName;
  label: string;
  /** "worse" means this signal moved in the direction associated with reduced recovery (HRV down, RHR up, sleep down, score down). */
  direction: "worse" | "better" | "flat" | "unknown";
  deviation: BaselineDeviation;
  concerning: "none" | "watch" | "significant";
};

export type RecoveryRadarResult = {
  status: RadarStatus;
  signals: RadarSignal[];
  dataSource: {
    wearable: boolean;
    isDemoWearable: boolean;
    recoveryCheckins: boolean;
  };
};
