import { SQUAT_P0 } from "@/lib/setvision/squat-p0/config";
import type { RepEvent, RepOutcome, RepReason } from "@/lib/setvision/squat-p0/types";

/**
 * OPERATIONAL COUNTING CRITERION (P0, bodyweight squat, side view)
 *
 * A cycle starts when the 2D knee angle leaves the standing band
 * (< descentTriggerDeg, confirmed) and ends when it is back in the standing
 * band (≥ standMinDeg, confirmed). Boundaries: start = last sample within
 * onsetToleranceDeg of the standing peak before the descent; end = the
 * sample where the return rise flattens (< endRiseDeg per sample).
 *
 *   COMPLETED  — onset and end both observed, no tracking gap > bridgeGapMs
 *                inside, minimum knee angle ≤ cycleFlexionMaxDeg, duration
 *                ≥ minCycleMs.
 *   PARTIAL    — same, but the minimum stayed above cycleFlexionMaxDeg.
 *   UNCERTAIN  — the cycle was not fully observed: onset before the first
 *                usable frame, a tracking gap inside, tracking lost, video
 *                ended mid-cycle, or implausibly fast.
 *
 * COMPLETED means "a sufficiently observed movement cycle". It does not
 * certify depth, technique, safety or competition validity.
 *
 * Safeguards: median-of-3 smoothing (jitter); 5° stand/descent hysteresis
 * and a confirmMs hold on every transition (duplicate transitions); a pause
 * changes no condition (pauses); a bounce mid-cycle is a reversal inside
 * one cycle, not a new rep (duplicates).
 *
 * Streaming: push() one sample at a time, finish() at the end, so a live
 * adapter can drive the same machine (smoothing then needs a 1-sample delay).
 */

export type AngleSample = { t: number; kneeDeg: number };

/**
 * Median of 3 over valid samples (centered; at a series edge, the 3 nearest),
 * never across a gap > maxBridgeGapMs. Timestamps are kept, not shifted.
 */
export function smoothMedian3(samples: AngleSample[]): AngleSample[] {
  return samples.map((s, i) => {
    const lo = Math.max(0, Math.min(i - 1, samples.length - 3));
    const w = samples.slice(lo, lo + 3);
    if (w.length < 3) return s;
    if (w[1].t - w[0].t > SQUAT_P0.maxBridgeGapMs || w[2].t - w[1].t > SQUAT_P0.maxBridgeGapMs) return s;
    const v = w.map((x) => x.kneeDeg).sort((a, b) => a - b);
    return { t: s.t, kneeDeg: v[1] };
  });
}

type State = "unknown" | "standing" | "descending" | "ascending";

type Cycle = {
  startMs: number;
  startKneeDeg: number | null;
  onsetObserved: boolean;
  min: number;
  minMs: number;
  localExtreme: number;
  reversals: number;
  validFrames: number;
  maxGapMs: number;
  gap: boolean;
  lastT: number;
  lastDeg: number;
};

export function createSquatRepCounter(cfg = SQUAT_P0) {
  let state: State = "unknown";
  let cycle: Cycle | null = null;
  let lastT: number | null = null;
  let lastStand: AngleSample | null = null;
  let standMax = -Infinity;
  let gapSinceStand = 0;
  let refine: { ev: RepEvent; lastDeg: number } | null = null;

  /** Push a just-closed rep's end forward while the knee is still extending. */
  function refineEnd(s: AngleSample) {
    if (!refine) return;
    if (s.kneeDeg <= refine.lastDeg + cfg.endRiseDeg) {
      refine = null;
      return;
    }
    const ev = refine.ev;
    ev.endMs = s.t;
    ev.features.endKneeDeg = s.kneeDeg;
    const ascent = ev.phases.find((p) => p.phase === "ascent");
    if (ascent) ascent.endMs = s.t;
    refine.lastDeg = s.kneeDeg;
  }

  function enterStanding(s: AngleSample) {
    state = "standing";
    lastStand = s;
    standMax = s.kneeDeg;
    gapSinceStand = 0;
  }
  const events: RepEvent[] = [];

  // One pending condition at a time: (name, since). Confirmed once t - since ≥ confirmMs.
  let pending: { name: string; since: number; sinceDeg: number } | null = null;
  function confirm(name: string, cond: boolean, s: AngleSample): { since: number; sinceDeg: number } | null {
    if (!cond) {
      if (pending?.name === name) pending = null;
      return null;
    }
    if (pending?.name !== name) pending = { name, since: s.t, sinceDeg: s.kneeDeg };
    return s.t - pending.since >= cfg.confirmMs ? pending : null;
  }

  function close(endMs: number, endDeg: number | null, extra: RepReason[]) {
    const c = cycle!;
    const reasons: RepReason[] = [...extra];
    if (!c.onsetObserved) reasons.push("onset_not_observed");
    if (c.gap) reasons.push("tracking_gap");
    if (endMs - c.startMs < cfg.minCycleMs && reasons.length === 0) reasons.push("implausibly_fast");
    const partial = c.min > cfg.cycleFlexionMaxDeg;
    if (partial) reasons.push("below_cycle_flexion");

    const uncertain = reasons.some((r) => r !== "below_cycle_flexion");
    const outcome: RepOutcome = uncertain ? "UNCERTAIN" : partial ? "PARTIAL" : "COMPLETED";
    const bottomMs = Number.isFinite(c.min) ? c.minMs : null;
    const index = events.length + 1;

    events.push({
      id: `rep-${index}-${Math.round(c.startMs)}`,
      index,
      outcome,
      startMs: c.startMs,
      endMs,
      bottomMs,
      phases:
        bottomMs === null || !c.onsetObserved
          ? []
          : [
              { phase: "descent", startMs: c.startMs, endMs: bottomMs },
              { phase: "ascent", startMs: bottomMs, endMs },
            ],
      features: {
        startKneeDeg: c.startKneeDeg,
        minKneeDeg: Number.isFinite(c.min) ? c.min : null,
        endKneeDeg: endDeg,
        reversals: c.reversals,
        validFrames: c.validFrames,
        maxGapMs: c.maxGapMs,
      },
      reasons,
    });
    cycle = null;
    pending = null;
  }

  function open(startMs: number, startDeg: number | null, onsetObserved: boolean) {
    cycle = {
      startMs,
      startKneeDeg: startDeg,
      onsetObserved,
      min: Infinity,
      minMs: startMs,
      localExtreme: Infinity,
      reversals: 0,
      validFrames: 0,
      maxGapMs: 0,
      gap: false,
      lastT: startMs,
      lastDeg: startDeg ?? NaN,
    };
  }

  function track(s: AngleSample) {
    const c = cycle!;
    c.validFrames += 1;
    c.lastT = s.t;
    c.lastDeg = s.kneeDeg;
    if (s.kneeDeg < c.min) {
      c.min = s.kneeDeg;
      c.minMs = s.t;
    }
  }

  function push(s: AngleSample) {
    const gap = lastT === null ? 0 : s.t - lastT;
    if (lastT !== null) {
      if (gap > cfg.maxBridgeGapMs) {
        // Tracking lost: whatever happened in the gap is unknowable.
        if (cycle) close(cycle.lastT, cycle.lastDeg, ["tracking_lost"]);
        refine = null;
        state = "unknown";
        pending = null;
        lastStand = null;
        gapSinceStand = 0;
      } else if (cycle) {
        cycle.maxGapMs = Math.max(cycle.maxGapMs, gap);
        if (gap > cfg.bridgeGapMs) cycle.gap = true;
      }
    }
    lastT = s.t;

    switch (state) {
      case "unknown": {
        if (s.kneeDeg < cfg.descentTriggerDeg && !cycle) open(s.t, null, false);
        if (cycle) track(s);
        const stood = confirm("stand", s.kneeDeg >= cfg.standMinDeg, s);
        if (stood) {
          if (cycle) {
            close(stood.since, stood.sinceDeg, []);
            refine = { ev: events[events.length - 1], lastDeg: stood.sinceDeg };
            refineEnd(s);
          }
          enterStanding(s);
        }
        break;
      }
      case "standing": {
        refineEnd(s);
        gapSinceStand = Math.max(gapSinceStand, gap);
        if (s.kneeDeg >= cfg.standMinDeg) standMax = Math.max(standMax, s.kneeDeg);
        if (s.kneeDeg >= Math.max(cfg.standMinDeg, standMax - cfg.onsetToleranceDeg)) {
          lastStand = s;
          gapSinceStand = 0;
        }
        const left = confirm("descend", s.kneeDeg < cfg.descentTriggerDeg, s);
        if (left) {
          const start = lastStand ?? { t: left.since, kneeDeg: left.sinceDeg };
          open(start.t, start.kneeDeg, true);
          // A gap between the last standing sample and the onset is inside the cycle too.
          cycle!.maxGapMs = gapSinceStand;
          if (gapSinceStand > cfg.bridgeGapMs) cycle!.gap = true;
          // Samples between onset and confirmation belong to the cycle.
          track({ t: left.since, kneeDeg: left.sinceDeg });
          track(s);
          cycle!.localExtreme = cycle!.min;
          state = "descending";
        }
        break;
      }
      case "descending":
      case "ascending": {
        const c = cycle!;
        track(s);
        const stood = confirm("stand", s.kneeDeg >= cfg.standMinDeg, s);
        if (stood) {
          close(stood.since, stood.sinceDeg, []);
          refine = { ev: events[events.length - 1], lastDeg: stood.sinceDeg };
          refineEnd(s);
          enterStanding(s);
          break;
        }
        if (state === "descending") {
          c.localExtreme = Math.min(c.localExtreme, s.kneeDeg);
          if (pending?.name !== "stand" && confirm("turn", s.kneeDeg >= c.localExtreme + cfg.turnDeg, s)) {
            state = "ascending";
            c.localExtreme = s.kneeDeg;
            pending = null;
          }
        } else {
          c.localExtreme = Math.max(c.localExtreme, s.kneeDeg);
          if (pending?.name !== "stand" && confirm("reverse", s.kneeDeg <= c.localExtreme - cfg.turnDeg, s)) {
            state = "descending";
            c.reversals += 1;
            c.localExtreme = s.kneeDeg;
            pending = null;
          }
        }
        break;
      }
    }
  }

  function finish(): RepEvent[] {
    if (cycle) close(cycle.lastT, cycle.lastDeg, ["video_ended_mid_cycle"]);
    return events;
  }

  return { push, finish, getState: () => state };
}
