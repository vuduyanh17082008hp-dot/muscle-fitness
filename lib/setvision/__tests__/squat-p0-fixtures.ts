import type { PoseObservation } from "@/lib/setvision/squat-p0";

/*
 * SYNTHETIC side-view squat observations shared by the P0 clip tests and the
 * Form Coach P1A live tests. They prove logic only, never real-world accuracy.
 */

export const STAND = 175;
export const BOTTOM = 85;
export const STEP = 100;

export type Key = [t: number, deg: number];

export function angleAtTime(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, a1] = keys[i];
    const [t0, a0] = keys[i - 1];
    if (t <= t1) return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
}

/** Side-view pose whose 2D knee angle equals `deg` (square frame, so normalized = pixel angles). */
export function poseFor(deg: number, opts: { hipSeparation?: number; visibility?: number; shiftX?: number } = {}) {
  const vis = opts.visibility ?? 0.95;
  const dx = opts.shiftX ?? 0;
  const ankle = { x: 0.5 + dx, y: 0.9 };
  const knee = { x: 0.52 + dx, y: 0.7 };
  const d = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const len = Math.hypot(d.x, d.y);
  const r = (deg * Math.PI) / 180;
  // Rotate the knee→ankle direction by `deg` (clockwise in image space) for knee→hip.
  const u = { x: (d.x * Math.cos(r) + d.y * Math.sin(r)) / len, y: (-d.x * Math.sin(r) + d.y * Math.cos(r)) / len };
  const hip = { x: knee.x + 0.2 * u.x, y: knee.y + 0.2 * u.y };
  const shoulder = { x: hip.x + 0.03, y: hip.y - 0.25 };
  const near = {
    shoulder: { ...shoulder, visibility: vis },
    hip: { ...hip, visibility: vis },
    knee: { ...knee, visibility: vis },
    ankle: { ...ankle, visibility: vis },
  };
  const sep = opts.hipSeparation ?? 0.01;
  const far = {
    shoulder: { ...shoulder, x: shoulder.x + sep, visibility: 0.3 },
    hip: { ...hip, x: hip.x + sep, visibility: 0.3 },
    knee: { ...knee, visibility: 0.3 },
    ankle: { ...ankle, visibility: 0.3 },
  };
  return { left: near, right: far };
}

export function observe(
  keys: Key[],
  durationMs: number,
  edit: (t: number, o: PoseObservation) => PoseObservation | null = (_t, o) => o,
  poseOpts: Parameters<typeof poseFor>[1] = {},
): PoseObservation[] {
  const out: PoseObservation[] = [];
  for (let t = 0; t <= durationMs; t += STEP) {
    const o: PoseObservation = {
      timestampMs: t,
      timestampSource: "seek",
      frameWidth: 1000,
      frameHeight: 1000,
      poseCount: 1,
      landmarks: poseFor(angleAtTime(keys, t), poseOpts),
    };
    const e = edit(t, o);
    if (e) out.push(e);
  }
  return out;
}

/** n reps: stand `lead` ms, then each rep = 1 s down + 1 s up, `rest` ms standing between. */
export function repKeys(n: number, { lead = 600, rest = 400, bottom = BOTTOM, down = 1000, up = 1000, hold = 0 } = {}) {
  const keys: Key[] = [[0, STAND]];
  const truth: Array<{ start: number; end: number }> = [];
  let t = lead;
  for (let i = 0; i < n; i += 1) {
    keys.push([t, STAND]);
    const start = t;
    t += down;
    keys.push([t, bottom]);
    if (hold) {
      t += hold;
      keys.push([t, bottom]);
    }
    t += up;
    keys.push([t, STAND]);
    truth.push({ start, end: t });
    t += rest;
  }
  keys.push([t, STAND]);
  return { keys, truth, end: t + 400 };
}
