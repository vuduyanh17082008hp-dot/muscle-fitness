import { confidentPoint } from "@/lib/setvision/exercise-config";
import { estimateTorsoLength } from "@/lib/setvision/normalization";
import { identityChangeTimes, sceneChangeSpans } from "@/lib/setvision/person-check";
import type { PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Segment-aware continuity for EVERY SetVision engine. A clip is split at each untrusted boundary
 * into independently assessable segments; nothing identity-dependent (rep state, side choice, tempo,
 * range, torso scale) is carried across a boundary, and a rep can never span one. Which boundary
 * kinds also break "same athlete" is decided by the caller (tracked analysis vs AI review).
 */

export type BoundaryKind =
  /** Hard edit: the whole picture changed at once. */
  | "cut"
  /** Cross-dissolve / fade between shots. */
  | "fade"
  /** Most of the picture changed without being a mix of two shots: the camera moved or zoomed. */
  | "camera_move"
  /** The tracked body teleported between close samples: another person, or an occluder pulled the tracker away. */
  | "track_jump"
  /** The MultiPose tracker's lone person changed identity. */
  | "identity_change"
  /** The athlete was out of view / hidden for longer than a brief occlusion. */
  | "tracking_loss"
  /** Samples missing or unusable (corrupt frames, non-monotonic timestamps, decoder gap). */
  | "frame_gap";

/** Frames strictly inside (startMs, endMs) are untrusted and dropped; a segment never spans the boundary. */
export type Boundary = { kind: BoundaryKind; startMs: number; endMs: number };

export const BOUNDARY_TEXT: Record<BoundaryKind, string> = {
  cut: "a cut to a different shot",
  fade: "a fade between shots",
  camera_move: "the camera moving or zooming",
  track_jump: "the tracked body jumping across the frame",
  identity_change: "the person tracker switching to a different identity",
  tracking_loss: "the athlete leaving view or being hidden",
  frame_gap: "missing or unreadable video frames",
};

/** Kinds after which the person in view need not be the same athlete. Camera motion alone does not change who it is. */
export const IDENTITY_BREAKING: ReadonlySet<BoundaryKind> = new Set(["cut", "fade", "track_jump", "identity_change", "tracking_loss", "frame_gap"]);

/** Hip-centre move between neighbouring samples, in the tracked body's own torso lengths, that no real lift produces. */
const TRACK_JUMP_TORSO_LENGTHS = 1.5;
const TRACK_JUMP_MAX_GAP_MS = 400;
/** A brief occlusion (an arm across the lens, a plate passing) stays inside a segment — the rep machine drops a rep it can't follow. */
// ponytail: a-priori; longer hidden stretches can re-emerge as someone else, so they break the segment.
export const MAX_TRACKING_GAP_MS = 2000;
/** Below this a segment is too short to hold a measured rep. */
export const MIN_SEGMENT_MS = 2000;
export const MIN_SEGMENT_FRAMES = 8;

/**
 * Timestamps where the single-person tracker's body teleported between two close samples — the detector
 * switched to another person (or a bystander / occlusion pulled it away). MoveNet SinglePose reports ONE body
 * per frame and cannot count people, so this jump is the only wrong-person evidence the single-pose track has.
 */
// ponytail: catches identity switches, not a second person the tracker never latched onto; a MultiPose person count is the upgrade.
export function trackJumpSpans(frames: TimedPoseFrame[]): Boundary[] {
  const out: Boundary[] = [];
  let prev: { t: number; x: number; y: number; torso: number } | null = null;
  for (const { timestampMs, frame } of frames) {
    const hips = [confidentPoint(frame, "left_hip"), confidentPoint(frame, "right_hip")].filter((p) => p !== null);
    const torso = estimateTorsoLength(frame);
    if (hips.length === 0 || !torso) continue;
    const cur = { t: timestampMs, x: hips.reduce((s, p) => s + p.x, 0) / hips.length, y: hips.reduce((s, p) => s + p.y, 0) / hips.length, torso };
    if (prev && cur.t - prev.t <= TRACK_JUMP_MAX_GAP_MS) {
      const moved = Math.hypot(cur.x - prev.x, cur.y - prev.y) / Math.max(prev.torso, cur.torso);
      if (moved > TRACK_JUMP_TORSO_LENGTHS) out.push({ kind: "track_jump", startMs: prev.t, endMs: cur.t });
    }
    prev = cur;
  }
  return out;
}

const finitePoint = (p: unknown) =>
  p === undefined || (typeof p === "object" && p !== null && [(p as { x: unknown }).x, (p as { y: unknown }).y, (p as { score: unknown }).score].every((v) => typeof v === "number" && Number.isFinite(v)));

/** A frame is usable when its timestamp is finite and every keypoint it reports is finite. */
function usable(f: TimedPoseFrame): boolean {
  return Number.isFinite(f.timestampMs) && f.timestampMs >= 0 && typeof f.frame === "object" && f.frame !== null && Object.values(f.frame as PoseFrame).every(finitePoint);
}

/** Drops corrupt frames and any frame whose timestamp does not move forward. */
export function sanitizeFrames(frames: TimedPoseFrame[]): { frames: TimedPoseFrame[]; dropped: number } {
  const kept: TimedPoseFrame[] = [];
  for (const f of frames) {
    if (!usable(f)) continue;
    if (kept.length > 0 && f.timestampMs <= kept[kept.length - 1].timestampMs) continue;
    kept.push(f);
  }
  return { frames: kept, dropped: frames.length - kept.length };
}

const athleteVisible = (f: TimedPoseFrame) =>
  Boolean(confidentPoint(f.frame, "left_shoulder") || confidentPoint(f.frame, "right_shoulder")) &&
  Boolean(confidentPoint(f.frame, "left_hip") || confidentPoint(f.frame, "right_hip"));

/** Every untrusted boundary in (sanitized) frames, sorted by start. */
export function findBoundaries(frames: TimedPoseFrame[]): Boundary[] {
  const out: Boundary[] = sceneChangeSpans(frames).map((s) => ({ kind: s.kind === "dissolve" ? "fade" : s.kind, startMs: s.startMs, endMs: s.endMs }));
  out.push(...trackJumpSpans(frames));

  for (const t of identityChangeTimes(frames)) {
    const i = frames.findIndex((f) => f.timestampMs === t);
    if (i > 0) out.push({ kind: "identity_change", startMs: frames[i - 1].timestampMs, endMs: t });
  }

  // The athlete out of view (or hidden) for longer than a brief occlusion.
  let lastSeen: number | null = null;
  for (const f of frames) {
    if (!athleteVisible(f)) continue;
    if (lastSeen !== null && f.timestampMs - lastSeen > MAX_TRACKING_GAP_MS) out.push({ kind: "tracking_loss", startMs: lastSeen, endMs: f.timestampMs });
    lastSeen = f.timestampMs;
  }

  // Missing samples (corrupt frames dropped, decoder stall).
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].timestampMs - frames[i - 1].timestampMs > MAX_TRACKING_GAP_MS) {
      out.push({ kind: "frame_gap", startMs: frames[i - 1].timestampMs, endMs: frames[i].timestampMs });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export type Segment = {
  index: number;
  startMs: number;
  endMs: number;
  frames: TimedPoseFrame[];
  /** The boundary that opened this segment (null for the first). */
  after: Boundary | null;
};

/**
 * Maximal runs of frames that no boundary crosses. A frame strictly inside a boundary's span is dropped;
 * consecutive kept frames a, c are split when any boundary overlaps (a.t, c.t).
 */
export function partition(frames: TimedPoseFrame[], boundaries: Boundary[]): Segment[] {
  const inside = (t: number) => boundaries.some((b) => b.startMs < t && t < b.endMs);
  const kept = frames.filter((f) => !inside(f.timestampMs));
  const segments: Segment[] = [];
  let current: TimedPoseFrame[] = [];
  let opened: Boundary | null = null;
  const close = () => {
    if (current.length === 0) return;
    segments.push({ index: segments.length, startMs: current[0].timestampMs, endMs: current[current.length - 1].timestampMs, frames: current, after: opened });
    current = [];
  };
  kept.forEach((f, i) => {
    const prev = kept[i - 1];
    const crossing = prev ? boundaries.find((b) => prev.timestampMs < b.endMs && b.startMs < f.timestampMs) : undefined;
    if (crossing) {
      close();
      opened = crossing;
    }
    current.push(f);
  });
  close();
  return segments;
}

export const assessableLength = (s: Segment) => s.endMs - s.startMs >= MIN_SEGMENT_MS && s.frames.length >= MIN_SEGMENT_FRAMES;

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
export const spanLabel = (startMs: number, endMs: number) => `${sec(startMs)}–${sec(endMs)}`;

/** "a cut to a different shot at 2.0 s and the camera moving or zooming at 5.1 s" — one entry per kind, first times only. */
export function describeBoundaries(boundaries: Boundary[]): string {
  const byKind = new Map<BoundaryKind, number[]>();
  // Instant changes are dated at the first new sample; spans (fade, camera move, loss, gap) where they began.
  const at = (b: Boundary) => (b.kind === "cut" || b.kind === "track_jump" || b.kind === "identity_change" ? b.endMs : b.startMs);
  for (const b of boundaries) byKind.set(b.kind, [...(byKind.get(b.kind) ?? []), at(b)]);
  const parts = [...byKind.entries()].map(([kind, times]) => `${BOUNDARY_TEXT[kind]} at ${times.slice(0, 3).map(sec).join(", ")}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
