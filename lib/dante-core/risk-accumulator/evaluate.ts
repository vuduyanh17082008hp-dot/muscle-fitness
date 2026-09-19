import { MIN_SAMPLES_FOR_BASELINE } from "@/lib/dante-core/personal-baseline";
import { regionsMatch } from "@/lib/dante-core/risk-accumulator/body-region";
import type {
  BodyRegion,
  RiskEvaluationResult,
  RiskLevel,
  RiskLogFields,
  RiskRawObservation,
  RiskSignal,
} from "@/lib/dante-core/risk-accumulator/types";

/** Product heuristic windows — not medical recovery timelines. */
export const IRRITATION_WINDOW_DAYS = 10;
export const IRRITATION_ELEVATED_MIN = 2;
/** Reuse personal-baseline engine minimum — do not invent a second threshold. */
export const FATIGUE_BASELINE_MIN = MIN_SAMPLES_FOR_BASELINE;
export const FATIGUE_CONSECUTIVE_LOW = 3;
export const DECAY_TO_WATCH_DAYS = 10;
export const DECAY_TO_NONE_DAYS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

function hasTrustedTime(item: RiskRawObservation): item is RiskRawObservation & { observedAt: string } {
  return item.timestampTrusted && typeof item.observedAt === "string" && Number.isFinite(Date.parse(item.observedAt));
}

function withinDays(iso: string, now: Date, windowDays: number): boolean {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS <= windowDays;
}

function uniqueBySession(items: RiskRawObservation[]): RiskRawObservation[] {
  const seen = new Set<string>();
  const out: RiskRawObservation[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.sessionKey}:${item.bodyRegion ?? ""}:${item.movementFamily ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortByTrustedTime(items: RiskRawObservation[]): RiskRawObservation[] {
  return [...items].sort((a, b) => {
    const aMs = hasTrustedTime(a) ? Date.parse(a.observedAt) : Number.POSITIVE_INFINITY;
    const bMs = hasTrustedTime(b) ? Date.parse(b.observedAt) : Number.POSITIVE_INFINITY;
    return aMs - bMs;
  });
}

function buildSignal(input: {
  type: RiskSignal["type"];
  level: RiskLevel;
  bodyRegion?: BodyRegion;
  observations: RiskRawObservation[];
  reasons: string[];
  confidence: RiskSignal["confidence"];
  resolvedAt?: string;
}): RiskSignal {
  const timed = sortByTrustedTime(input.observations).filter(hasTrustedTime);
  return {
    type: input.type,
    level: input.level,
    bodyRegion: input.bodyRegion,
    firstObservedAt: timed[0]?.observedAt ?? null,
    lastObservedAt: timed[timed.length - 1]?.observedAt ?? null,
    observationCount: input.observations.length,
    evidence: input.observations.map((item) => ({
      id: item.id,
      observedAt: hasTrustedTime(item) ? item.observedAt : null,
      source: item.source,
    })),
    confidence: input.confidence,
    reasons: input.reasons,
    resolvedAt: input.resolvedAt,
  };
}

function isShoulderRegion(region: BodyRegion | undefined): boolean {
  return (
    region === "LEFT_SHOULDER" ||
    region === "RIGHT_SHOULDER" ||
    region === "SHOULDER_UNSPECIFIED"
  );
}

function evaluateRepeatedIrritation(
  observations: RiskRawObservation[],
  now: Date,
): RiskSignal[] {
  const irritations = uniqueBySession(
    observations.filter((item) => item.kind === "IRRITATION" && item.bodyRegion),
  );
  const resolutions = observations.filter((item) => item.kind === "SYMPTOM_FREE_RESOLUTION");

  const byRegion = new Map<BodyRegion, RiskRawObservation[]>();
  for (const item of irritations) {
    const region = item.bodyRegion!;
    const list = byRegion.get(region) ?? [];
    list.push(item);
    byRegion.set(region, list);
  }

  const signals: RiskSignal[] = [];
  for (const [region, items] of byRegion) {
    // Strict rolling-window rule uses ONLY trusted timestamps.
    const timed = items.filter(hasTrustedTime);
    const recent = timed.filter((item) => withinDays(item.observedAt, now, IRRITATION_WINDOW_DAYS));

    const latestResolution = resolutions
      .filter((item) => {
        if (regionsMatch(item.bodyRegion, region)) return true;
        // Explicit shoulder resolution may clear unspecified shoulder, not invent laterality.
        if (isShoulderRegion(region) && isShoulderRegion(item.bodyRegion)) {
          return region === "SHOULDER_UNSPECIFIED" || item.bodyRegion === "SHOULDER_UNSPECIFIED" || regionsMatch(item.bodyRegion, region);
        }
        return !item.bodyRegion;
      })
      .sort((a, b) => {
        const aMs = hasTrustedTime(a) ? Date.parse(a.observedAt) : -1;
        const bMs = hasTrustedTime(b) ? Date.parse(b.observedAt) : -1;
        return bMs - aMs;
      })[0];

    const lastTimedIrritation = [...timed].sort(
      (a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt),
    )[0];

    if (latestResolution && lastTimedIrritation && hasTrustedTime(latestResolution)) {
      if (Date.parse(latestResolution.observedAt) >= Date.parse(lastTimedIrritation.observedAt)) {
        signals.push(
          buildSignal({
            type: "REPEATED_IRRITATION",
            level: "NONE",
            bodyRegion: region,
            observations: items,
            confidence: "HIGH",
            reasons: [
              "Explicit symptom-free resolution reported after prior irritation observations.",
              "Raw irritation history remains immutable; active pattern is resolved.",
            ],
            resolvedAt: latestResolution.observedAt,
          }),
        );
        continue;
      }
    } else if (latestResolution && !lastTimedIrritation) {
      // Resolution with only untimed prior evidence — still honor current resolution.
      signals.push(
        buildSignal({
          type: "REPEATED_IRRITATION",
          level: "NONE",
          bodyRegion: region,
          observations: items,
          confidence: "MODERATE",
          reasons: [
            "Explicit symptom-free resolution reported.",
            "Raw irritation history remains immutable; active pattern is resolved.",
          ],
          resolvedAt: hasTrustedTime(latestResolution) ? latestResolution.observedAt : undefined,
        }),
      );
      continue;
    }

    const daysSinceLast = lastTimedIrritation
      ? (now.getTime() - Date.parse(lastTimedIrritation.observedAt)) / DAY_MS
      : Number.POSITIVE_INFINITY;

    let level: RiskLevel = "NONE";
    if (recent.length >= IRRITATION_ELEVATED_MIN) {
      level = "ELEVATED";
    } else if (recent.length === 1) {
      level = "WATCH";
    } else if (timed.length >= IRRITATION_ELEVATED_MIN && daysSinceLast <= DECAY_TO_WATCH_DAYS) {
      level = "WATCH";
    } else if (timed.length > 0 && daysSinceLast <= DECAY_TO_NONE_DAYS) {
      level = "WATCH";
    } else if (items.length > 0) {
      // Untimed evidence may remain as WATCH — never fabricated into ELEVATED window.
      level = "WATCH";
    }

    if (level === "NONE") continue;

    signals.push(
      buildSignal({
        type: "REPEATED_IRRITATION",
        level,
        bodyRegion: region,
        observations: recent.length > 0 ? recent : items.slice(-1),
        confidence: recent.length >= 2 ? "HIGH" : "MODERATE",
        reasons: [
          "Product heuristic: same body region irritation observations within a rolling 10-day window of trusted timestamps.",
          "Unknown-timing observations are not fabricated into the rolling window.",
          "This is not a medical threshold or injury diagnosis.",
        ],
      }),
    );
  }

  return signals;
}

function evaluateSystemicFatigue(
  observations: RiskRawObservation[],
  now: Date,
  personalBaseline?: { mean: number; sampleSize: number } | null,
): RiskSignal | null {
  const lowsAll = uniqueBySession(observations.filter((item) => item.kind === "LOW_RECOVERY"));
  // Consecutive low-recovery elevation requires trusted timing in-window.
  const lowsTimed = lowsAll
    .filter(hasTrustedTime)
    .filter((item) => withinDays(item.observedAt, now, IRRITATION_WINDOW_DAYS))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  const untrustedLows = lowsAll.filter((item) => !hasTrustedTime(item));

  if (lowsTimed.length === 0 && untrustedLows.length === 0) return null;

  const hasBaseline =
    personalBaseline != null && personalBaseline.sampleSize >= FATIGUE_BASELINE_MIN;

  if (hasBaseline && lowsTimed.length >= FATIGUE_CONSECUTIVE_LOW) {
    const consecutive = lowsTimed.slice(-FATIGUE_CONSECUTIVE_LOW);
    const allBelow = consecutive.every((item) =>
      item.recoveryScore != null
        ? item.recoveryScore < personalBaseline.mean - 5
        : item.recoveryStatus === "POOR",
    );
    if (allBelow) {
      return buildSignal({
        type: "SYSTEMIC_FATIGUE",
        level: "ELEVATED",
        observations: consecutive,
        confidence: "MODERATE",
        reasons: [
          "Recovery ran below personal baseline across multiple consecutive comparable sessions.",
          "Not a diagnosis of overtraining.",
        ],
      });
    }
  }

  // Prefer in-window trusted lows; untrusted timing may only support WATCH.
  const watchPool = lowsTimed.length > 0 ? lowsTimed : untrustedLows;
  if (watchPool.length === 0) return null;

  if (watchPool.length >= 2) {
    return buildSignal({
      type: "SYSTEMIC_FATIGUE",
      level: "WATCH",
      observations: watchPool.slice(-3),
      confidence: hasBaseline ? "MODERATE" : "LOW",
      reasons: hasBaseline
        ? ["Repeated low-recovery observations warrant a watch bias."]
        : [
            "Repeated clearly low recovery reports — insufficient baseline to claim below personal average.",
            "Watch only.",
          ],
    });
  }

  return buildSignal({
    type: "SYSTEMIC_FATIGUE",
    level: "WATCH",
    observations: watchPool.slice(-1),
    confidence: "LOW",
    reasons: ["Isolated low-recovery observation."],
  });
}

function evaluateLoadEscalation(observations: RiskRawObservation[]): RiskSignal | null {
  const loads = uniqueBySession(
    observations
      .filter((item) => item.kind === "LOAD_POINT" && item.loadKg != null)
      .filter(hasTrustedTime)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)),
  );

  const byFamily = new Map<string, RiskRawObservation[]>();
  for (const item of loads) {
    const key = item.movementFamily ?? "OTHER";
    const list = byFamily.get(key) ?? [];
    list.push(item);
    byFamily.set(key, list);
  }

  for (const [family, items] of byFamily) {
    if (items.length < 3) continue;
    const last3 = items.slice(-3);
    const increasing =
      (last3[0].loadKg ?? 0) < (last3[1].loadKg ?? 0) &&
      (last3[1].loadKg ?? 0) < (last3[2].loadKg ?? 0);
    if (!increasing) continue;
    return buildSignal({
      type: "LOAD_ESCALATION",
      level: "WATCH",
      bodyRegion: last3[0].bodyRegion,
      observations: last3,
      confidence: "MODERATE",
      reasons: [
        `Rapid increasing load trend detected for ${family}.`,
        "Load escalation alone is not automatic danger.",
      ],
    });
  }

  return null;
}

function isLoadRelevantToIrritation(load: RiskSignal, irritation: RiskSignal): boolean {
  const region = irritation.bodyRegion;
  if (!region) return false;
  if (load.bodyRegion && load.bodyRegion === region) return true;
  const shoulder = isShoulderRegion(region);
  const kneeOrHip =
    region === "LEFT_KNEE" || region === "RIGHT_KNEE" || region === "HIP" || region === "LOWER_BACK";
  if (shoulder && isShoulderRegion(load.bodyRegion)) {
    return true;
  }
  if (kneeOrHip && load.bodyRegion && ["LEFT_KNEE", "RIGHT_KNEE", "HIP", "LOWER_BACK"].includes(load.bodyRegion)) {
    return true;
  }
  return false;
}

/**
 * Deterministic risk evaluation.
 * Product heuristics only — never injury probability or diagnosis.
 */
export function evaluateRiskSignals(
  observations: RiskRawObservation[],
  input: {
    now?: Date;
    personalRecoveryBaseline?: { mean: number; sampleSize: number } | null;
  } = {},
): RiskEvaluationResult {
  const now = input.now ?? new Date();
  const signals: RiskSignal[] = [];

  signals.push(...evaluateRepeatedIrritation(observations, now));

  const fatigue = evaluateSystemicFatigue(observations, now, input.personalRecoveryBaseline ?? null);
  if (fatigue) signals.push(fatigue);

  const load = evaluateLoadEscalation(observations);
  if (load) signals.push(load);

  const elevatedIrritation = signals.find(
    (signal) => signal.type === "REPEATED_IRRITATION" && signal.level === "ELEVATED",
  );
  const watchLoad = signals.find(
    (signal) => signal.type === "LOAD_ESCALATION" && signal.level !== "NONE",
  );
  const fatigueSignal = signals.find((signal) => signal.type === "SYSTEMIC_FATIGUE");

  let conservativeBias: RiskEvaluationResult["conservativeBias"] = "NONE";
  const reasons: string[] = [];

  if (elevatedIrritation) {
    conservativeBias = "LEAN";
    reasons.push("Repeated irritation pattern supports reversible / lower-risk strategy bias.");
  }
  if (
    elevatedIrritation &&
    watchLoad &&
    isLoadRelevantToIrritation(watchLoad, elevatedIrritation)
  ) {
    conservativeBias = "STRONG";
    reasons.push("Relevant load escalation overlaps the irritation region — stronger conservative bias.");
  }
  if (fatigueSignal && fatigueSignal.level === "ELEVATED") {
    conservativeBias = conservativeBias === "NONE" ? "LEAN" : "STRONG";
    reasons.push("Systemic fatigue pattern supports lower-cost session bias.");
  } else if (fatigueSignal && fatigueSignal.level === "WATCH" && conservativeBias === "NONE") {
    conservativeBias = "LEAN";
    reasons.push("Recovery watch bias.");
  }

  return { signals, conservativeBias, reasons };
}

export function toRiskLogFields(result: RiskEvaluationResult): RiskLogFields[] {
  return result.signals
    .filter((signal) => signal.level !== "NONE")
    .map((signal) => ({
      riskSignalType: signal.type,
      riskLevel: signal.level,
      bodyRegion: signal.bodyRegion,
      observationCount: signal.observationCount,
      evidenceCount: signal.evidence.length,
      lastObservedAt: signal.lastObservedAt,
    }));
}

export function getActiveIrritationRegion(result: RiskEvaluationResult): BodyRegion | undefined {
  const active = result.signals.find(
    (signal) =>
      signal.type === "REPEATED_IRRITATION" &&
      (signal.level === "ELEVATED" || signal.level === "WATCH") &&
      !signal.resolvedAt,
  );
  return active?.bodyRegion;
}
