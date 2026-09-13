/**
 * Data Freshness (spec: "Dante must not treat stale values as
 * current facts"). One small, pure, deterministic helper reused for
 * every signal in the Digital Twin — recovery, nutrition, training,
 * SetVision, bodyweight — rather than each section inventing its own
 * ad hoc "is this old?" check.
 */

export type DataFreshnessStatus = "current" | "stale" | "missing";

export type DataFreshnessSignal = {
  status: DataFreshnessStatus;
  /** ISO timestamp of the underlying signal, or null if it has never existed. */
  lastUpdated: string | null;
  /** e.g. "Updated 8h ago", "Updated 11d ago", "No recent sample". */
  humanReadable: string;
};

export type FreshnessThresholds = {
  /** Hours within which a signal counts as "current". */
  currentWithinHours: number;
  /** A human label for what "missing" means for this specific signal, e.g. "No recent sample". */
  missingLabel: string;
};

function formatAgo(hours: number): string {
  if (hours < 1) return "Updated less than an hour ago";
  if (hours < 24) return `Updated ${Math.round(hours)}h ago`;

  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

export function computeFreshness(
  lastUpdated: string | Date | null,
  thresholds: FreshnessThresholds,
  now: Date = new Date(),
): DataFreshnessSignal {
  if (lastUpdated === null) {
    return {
      status: "missing",
      lastUpdated: null,
      humanReadable: thresholds.missingLabel,
    };
  }

  const updatedAt = typeof lastUpdated === "string" ? new Date(lastUpdated) : lastUpdated;

  if (Number.isNaN(updatedAt.getTime())) {
    return {
      status: "missing",
      lastUpdated: null,
      humanReadable: thresholds.missingLabel,
    };
  }

  const hoursSince = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

  return {
    status: hoursSince <= thresholds.currentWithinHours ? "current" : "stale",
    lastUpdated: updatedAt.toISOString(),
    humanReadable: formatAgo(hoursSince),
  };
}

/** Standard thresholds for the signals the Digital Twin tracks — kept in one place so they can't silently drift apart per call site. */
export const FRESHNESS_THRESHOLDS = {
  recoveryCheckin: { currentWithinHours: 24, missingLabel: "No check-in yet" },
  nutritionLog: { currentWithinHours: 24, missingLabel: "No food logged recently" },
  training: { currentWithinHours: 72, missingLabel: "No recent training session" },
  setVision: { currentWithinHours: 24 * 14, missingLabel: "No recent sample" },
  bodyweight: { currentWithinHours: 24 * 14, missingLabel: "No profile update on record" },
} as const satisfies Record<string, FreshnessThresholds>;
