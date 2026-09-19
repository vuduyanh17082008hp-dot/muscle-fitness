export type RiskSignalType =
  | "REPEATED_IRRITATION"
  | "SYSTEMIC_FATIGUE"
  | "LOAD_ESCALATION";

export type RiskLevel = "NONE" | "WATCH" | "ELEVATED";

export type BodyRegion =
  | "LEFT_SHOULDER"
  | "RIGHT_SHOULDER"
  | "SHOULDER_UNSPECIFIED"
  | "LEFT_ELBOW"
  | "RIGHT_ELBOW"
  | "LEFT_KNEE"
  | "RIGHT_KNEE"
  | "LOWER_BACK"
  | "UPPER_BACK"
  | "HIP"
  | "QUADS"
  | "OTHER";

export type RiskEvidenceSource =
  | "CURRENT_USER_REPORT"
  | "VERIFIED_LOG"
  | "TOOL_DATA";

export interface RiskEvidenceRef {
  id: string;
  /** ISO timestamp when trusted; null when timing is unknown. */
  observedAt: string | null;
  source: RiskEvidenceSource;
}

export interface RiskSignal {
  type: RiskSignalType;
  level: RiskLevel;
  bodyRegion?: BodyRegion;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  observationCount: number;
  evidence: RiskEvidenceRef[];
  confidence: "LOW" | "MODERATE" | "HIGH";
  reasons: string[];
  expiresAt?: string;
  resolvedAt?: string;
}

/** Immutable raw observation — never rewritten into diagnosis labels. */
export type RiskRawObservationKind =
  | "IRRITATION"
  | "DOMS"
  | "LOW_RECOVERY"
  | "LOAD_POINT"
  | "SYMPTOM_FREE_RESOLUTION";

export interface RiskRawObservation {
  id: string;
  kind: RiskRawObservationKind;
  /**
   * ISO timestamp when known and trusted.
   * Null when timing is unknown — never fabricate a calendar date.
   */
  observedAt: string | null;
  /** True only when observedAt comes from a real clock / metadata / verified log. */
  timestampTrusted: boolean;
  source: RiskEvidenceSource;
  bodyRegion?: BodyRegion;
  /** Movement family for load relevance, e.g. BENCH / OHP / SQUAT. */
  movementFamily?: "BENCH" | "OHP" | "SQUAT" | "DEADLIFT" | "OTHER";
  loadKg?: number;
  recoveryScore?: number | null;
  recoveryStatus?: "GOOD" | "POOR" | null;
  sessionKey: string;
}

export type RiskEvaluationResult = {
  signals: RiskSignal[];
  /** Conservative strategy bias for prompt / coaching. */
  conservativeBias: "NONE" | "LEAN" | "STRONG";
  reasons: string[];
};

export type RiskLogFields = {
  riskSignalType: RiskSignalType;
  riskLevel: RiskLevel;
  bodyRegion?: BodyRegion;
  observationCount: number;
  evidenceCount: number;
  lastObservedAt: string | null;
};

/** One active-chat user turn for risk reconstruction. */
export type RiskHistoryTurn = {
  content: string;
  /**
   * Real ISO timestamp when available (message metadata, event log, etc.).
   * Omit / null when unknown — never invent spacing.
   */
  observedAt?: string | null;
};
