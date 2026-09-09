export type RiskLevel = "low" | "moderate" | "high";

export interface MemberRiskSignals {
  daysSinceLastVisit: number;
  sessions30d: number;
  sessionsPrevious30d: number;
  workoutAdherence: number;
  engagementScore: number;
  progressSignal: number;
}

export interface RiskFactor {
  key:
    | "inactivity"
    | "session_decline"
    | "low_adherence"
    | "low_engagement"
    | "lack_of_progress";

  label: string;

  score: number;

  weight: number;

  contribution: number;
}

export interface ChurnRiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  factors: RiskFactor[];
}

function clamp(
  value: number,
  minimum = 0,
  maximum = 100
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function getInactivityScore(days: number): number {
  if (days <= 2) {
    return 0;
  }

  if (days <= 4) {
    return 20;
  }

  if (days <= 7) {
    return 45;
  }

  if (days <= 10) {
    return 70;
  }

  if (days <= 14) {
    return 85;
  }

  return 100;
}

function getSessionDeclineScore(
  currentSessions: number,
  previousSessions: number
): number {
  if (previousSessions <= 0) {
    return currentSessions <= 0 ? 50 : 0;
  }

  const declineRatio =
    (previousSessions - currentSessions) /
    previousSessions;

  return clamp(declineRatio * 100);
}

export function calculateChurnRisk(
  signals: MemberRiskSignals
): ChurnRiskResult {
  const inactivity = getInactivityScore(
    Math.max(0, signals.daysSinceLastVisit)
  );

  const sessionDecline =
    getSessionDeclineScore(
      Math.max(0, signals.sessions30d),
      Math.max(0, signals.sessionsPrevious30d)
    );

  const lowAdherence =
    100 - clamp(signals.workoutAdherence);

  const lowEngagement =
    100 - clamp(signals.engagementScore);

  const lackOfProgress =
    100 - clamp(signals.progressSignal);

  const factors: RiskFactor[] = [
    {
      key: "inactivity",
      label: "Recent inactivity",
      score: inactivity,
      weight: 0.35,
      contribution: inactivity * 0.35,
    },

    {
      key: "session_decline",
      label: "Training frequency decline",
      score: sessionDecline,
      weight: 0.25,
      contribution: sessionDecline * 0.25,
    },

    {
      key: "low_adherence",
      label: "Low workout adherence",
      score: lowAdherence,
      weight: 0.2,
      contribution: lowAdherence * 0.2,
    },

    {
      key: "low_engagement",
      label: "Low application engagement",
      score: lowEngagement,
      weight: 0.15,
      contribution: lowEngagement * 0.15,
    },

    {
      key: "lack_of_progress",
      label: "Weak progress signal",
      score: lackOfProgress,
      weight: 0.05,
      contribution: lackOfProgress * 0.05,
    },
  ];

  const riskScore = Math.round(
    clamp(
      factors.reduce(
        (total, factor) =>
          total + factor.contribution,
        0
      )
    )
  );

  let riskLevel: RiskLevel = "low";

  if (riskScore >= 65) {
    riskLevel = "high";
  } else if (riskScore >= 35) {
    riskLevel = "moderate";
  }

  return {
    riskScore,
    riskLevel,

    factors: [...factors].sort(
      (a, b) =>
        b.contribution - a.contribution
    ),
  };
}