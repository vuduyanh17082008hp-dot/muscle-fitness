import type { PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Which moments of the clip the AI visual review sees. Evenly spaced stills can
 * miss the ends of a rep (S3: a labelled "half reps" clip never showed its
 * shallowest point), so the stills are chosen at the movement's TURNING POINTS —
 * local extremes of the main axis of body motion — then topped up with evenly
 * spaced times. Same image budget as before (6–12). Falls back to even spacing
 * when too few frames carry a tracked body (partial-body clips).
 *
 * The main axis is the first principal component of the body's own keypoint
 * layout (centred on its mean point, scaled by its spread), so it follows
 * whatever moves most — knees in a leg press, arms in a press — with no
 * per-exercise rule.
 */

const KEYS = [
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
] as const;
const MIN_SCORE = 0.3;
/** A turning point must swing at least this share of the clip's full range on the main axis. */
// ponytail: a-priori prominence; tune if real clips show too many/too few turning points.
const MIN_PROMINENCE = 0.25;
const MIN_GAP_MS = 400;

export function stillCount(durationMs: number): number {
  return Math.min(12, Math.max(6, Math.round(durationMs / 1000)));
}

/** The old schedule: evenly spaced from 3 % to 97 % of the clip. */
export function evenTimes(durationMs: number, count = stillCount(durationMs)): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(durationMs * (0.03 + (0.94 * i) / (count - 1))));
}

function features(frame: PoseFrame, keys: readonly string[]): number[] | null {
  const pts = keys.map((k) => frame[k]);
  if (pts.some((p) => !p || p.score < MIN_SCORE)) return null;
  const cx = pts.reduce((s, p) => s + p!.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p!.y, 0) / pts.length;
  const spread = Math.sqrt(pts.reduce((s, p) => s + (p!.x - cx) ** 2 + (p!.y - cy) ** 2, 0) / pts.length) || 1;
  return pts.flatMap((p) => [(p!.x - cx) / spread, (p!.y - cy) / spread]);
}

/** First principal component scores (power iteration on the covariance). */
function mainAxis(rows: number[][]): number[] {
  const d = rows[0].length;
  const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / rows.length);
  const centred = rows.map((r) => r.map((v, j) => v - mean[j]));
  let v: number[] = Array.from({ length: d }, (_, j) => (j % 2 ? 1 : 0.5));
  for (let it = 0; it < 50; it += 1) {
    const next = new Array(d).fill(0);
    for (const r of centred) {
      const dot = r.reduce((s, x, j) => s + x * v[j], 0);
      for (let j = 0; j < d; j += 1) next[j] += dot * r[j];
    }
    const norm = Math.hypot(...next) || 1;
    v = next.map((x) => x / norm);
  }
  return centred.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
}

/**
 * Times (ms) for the review stills: turning points first (at most `count - 2`, the most prominent),
 * then evenly spaced times that keep ≥ MIN_GAP_MS from those already chosen. Sorted.
 */
export function phaseTimes(frames: TimedPoseFrame[], durationMs: number, startMs = 0): { times: number[]; turningPoints: number } {
  const count = stillCount(durationMs);
  // `startMs` + `durationMs` = the trusted segment the stills must come from (the whole clip by default).
  const even = evenTimes(durationMs, count).map((t) => t + startMs);
  // Use the keypoints that are tracked in most frames, so a seated/partial view still has an axis.
  const keys = KEYS.filter((k) => frames.filter((f) => (f.frame[k]?.score ?? 0) >= MIN_SCORE).length >= frames.length * 0.7);
  const usable = keys.length >= 4 ? frames.map((f) => ({ t: f.timestampMs, x: features(f.frame, keys) })).filter((r): r is { t: number; x: number[] } => r.x !== null) : [];
  if (usable.length < Math.max(10, frames.length * 0.5)) return { times: even, turningPoints: 0 };

  const raw = mainAxis(usable.map((r) => r.x));
  const s = raw.map((_, i) => (raw[Math.max(0, i - 1)] + raw[i] + raw[Math.min(raw.length - 1, i + 1)]) / 3);
  const range = Math.max(...s) - Math.min(...s);
  if (range <= 0) return { times: even, turningPoints: 0 };

  // Peaks and valleys with hysteresis: an extreme is confirmed once the signal swings back by MIN_PROMINENCE × range.
  const h = MIN_PROMINENCE * range;
  const idx: number[] = [];
  let mode = 0; // +1 looking for a peak, -1 for a valley, 0 before the first swing
  let lo = 0;
  let hi = 0;
  let cand = 0;
  for (let i = 1; i < s.length; i += 1) {
    if (mode === 0) {
      if (s[i] < s[lo]) lo = i;
      if (s[i] > s[hi]) hi = i;
      if (s[i] - s[lo] >= h) {
        idx.push(lo); // rose from a valley
        mode = 1;
        cand = i;
      } else if (s[hi] - s[i] >= h) {
        idx.push(hi); // fell from a peak
        mode = -1;
        cand = i;
      }
    } else if (mode === 1) {
      if (s[i] > s[cand]) {
        cand = i;
      } else if (s[cand] - s[i] >= h) {
        idx.push(cand); // peak confirmed
        mode = -1;
        cand = i;
      }
    } else if (s[i] < s[cand]) {
      cand = i;
    } else if (s[i] - s[cand] >= h) {
      idx.push(cand); // valley confirmed
      mode = 1;
      cand = i;
    }
  }
  if (mode !== 0) idx.push(cand);
  // Rank by swing to the neighbouring extremes; keep the strongest, leaving room for two evenly spaced stills.
  const swing = (k: number) => Math.max(k > 0 ? Math.abs(s[idx[k]] - s[idx[k - 1]]) : 0, k < idx.length - 1 ? Math.abs(s[idx[k]] - s[idx[k + 1]]) : 0);
  const chosen = idx
    .map((ix, k) => ({ t: usable[ix].t, w: swing(k) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, count - 2)
    .map((x) => x.t)
    .filter((t, i, all) => all.findIndex((u) => Math.abs(u - t) < MIN_GAP_MS) === i);
  const turningPoints = chosen.length;
  for (const t of even) {
    if (chosen.length >= count) break;
    if (chosen.every((u) => Math.abs(u - t) >= MIN_GAP_MS)) chosen.push(t);
  }
  return { times: chosen.sort((a, b) => a - b), turningPoints };
}
