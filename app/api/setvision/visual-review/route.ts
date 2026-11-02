import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { isVisionConfigured, visionJson, type VisionContent } from "@/lib/ai/vision-client";
import { checkDanteRateLimit } from "@/lib/chatbot-rate-limit";
import { findExerciseOption, validateCustomExerciseName } from "@/lib/setvision/exercise-selection";
import {
  exerciseReference,
  REVIEW_SCOPES,
  sanitizeVisualReview,
  VISUAL_REVIEW_MAX_FRAMES,
  VISUAL_REVIEW_MIN_FRAMES,
  VISUAL_REVIEW_RESPONSE_FORMAT,
  VISUAL_REVIEW_SYSTEM_PROMPT,
  visualReviewUserText,
  type AthleteLens,
} from "@/lib/setvision/visual-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~512 px JPEG stills are 30–80 kB of base64; 12 × 300 kB stays under the 4.5 MB request limit. */
const MAX_FRAME_LENGTH = 300_000;
const MAX_BODY_BYTES = 4_000_000;
const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const TIMEOUT_MS = 45_000;
/** Per server instance: reviews running at once. The durable per-user quota is the shared AI limiter below. */
const MAX_INFLIGHT = 4;
const inflight = new Set<string>();

const requestSchema = z.object({
  /** `catalogue:<slug>` / `setvision:<slug>` option key, or null for a custom name. */
  exerciseKey: z.string().max(120).nullable().optional(),
  exerciseLabel: z.string().trim().min(1).max(80),
  /** The user said "yes, it's this exercise" after an ambiguous identity result. */
  userConfirmedExercise: z.boolean().optional(),
  /** What the on-device subject scan established (it can only narrow what is claimed, never widen it). */
  scope: z.enum(REVIEW_SCOPES).optional(),
  frames: z
    .array(
      z.object({
        tMs: z.number().int().min(0).max(10 * 60 * 1000),
        image: z.string().max(MAX_FRAME_LENGTH).regex(JPEG_DATA_URL),
      }),
    )
    .min(VISUAL_REVIEW_MIN_FRAMES)
    .max(VISUAL_REVIEW_MAX_FRAMES)
    .refine((frames) => frames.every((f, i) => i === 0 || f.tMs > frames[i - 1].tMs), "Frames must be in time order."),
});

const fail = (status: number, code: string, error: string, headers?: Record<string, string>) =>
  NextResponse.json({ ok: false, code, error }, { status, headers });

/**
 * POST /api/setvision/visual-review — qualitative AI review of stills from
 * the user's own clip (lib/setvision/visual-review.ts owns the rules). The
 * stills are sent to OpenAI for this one request and are not stored.
 *
 * Order matters: everything that can reject a request (auth, size, schema,
 * configuration, duplicate, quota) runs BEFORE the model call.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHORIZED", "Sign in to use AI visual review.");

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return fail(413, "TOO_LARGE", "The video frames are too large. Try a shorter clip.");

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, "TOO_LARGE", "The video frames are too large. Try a shorter clip.");
    body = JSON.parse(text);
  } catch {
    return fail(400, "INVALID_JSON", "The video frames could not be read. Try the video again.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "INVALID_FRAMES", "The video frames could not be read. Try the video again.");

  const { exerciseKey, frames, userConfirmedExercise = false, scope = "full" } = parsed.data;
  // The exercise is resolved on the server: a known option uses its own label and catalogue reference;
  // anything else must pass the same custom-name validation as a saved review.
  const option = exerciseKey ? findExerciseOption(exerciseKey) : null;
  if (exerciseKey && !option) return fail(400, "INVALID_EXERCISE", "Unknown exercise. Pick it again from the list.");
  const custom = option ? null : validateCustomExerciseName(parsed.data.exerciseLabel);
  if (custom && !custom.ok) return fail(400, "INVALID_EXERCISE", custom.error);
  const exerciseLabel = option ? option.label : custom && custom.ok ? custom.label : parsed.data.exerciseLabel;
  const reference = exerciseReference(option?.key ?? null);
  const reviewContext = { reference, userConfirmed: userConfirmedExercise, scope };

  if (!isVisionConfigured()) return fail(503, "NOT_CONFIGURED", "AI visual review is not available on this server.");

  // One review per user at a time (a double click or a second tab is a duplicate, not a new review).
  if (inflight.has(user.id)) return fail(409, "IN_PROGRESS", "A review of your video is already running — wait for it to finish.");
  if (inflight.size >= MAX_INFLIGHT) return fail(503, "BUSY", "AI visual review is busy. Try again in a moment.", { "Retry-After": "10" });

  inflight.add(user.id);
  try {
    // Durable per-user quota shared with Dante (one Postgres row per user, works across instances; fails closed).
    let limit: Awaited<ReturnType<typeof checkDanteRateLimit>>;
    try {
      limit = await checkDanteRateLimit(user.id);
    } catch {
      return fail(503, "RATE_LIMIT_UNAVAILABLE", "AI visual review is temporarily unavailable. Try again shortly.");
    }
    if (!limit.allowed) {
      return fail(429, "RATE_LIMITED", `Too many AI requests. Try again in ${limit.retryAfterSeconds} s.`, { "Retry-After": String(limit.retryAfterSeconds) });
    }

    // The athlete's own self-reported profile only tailors wording; a failed read just means generic wording.
    const { data: profile } = await supabase
      .from("fitness_profiles")
      .select("goal, experience, physical_limitations")
      .eq("user_id", user.id)
      .maybeSingle();
    const lens: AthleteLens | null = profile
      ? { experience: profile.experience ?? null, goal: profile.goal ?? null, limitations: profile.physical_limitations ?? null }
      : null;

    const times = frames.map((f) => f.tMs);
    const content: VisionContent[] = [
      { type: "text", text: visualReviewUserText(exerciseLabel, times, lens, reviewContext) },
      ...frames.flatMap((f, i): VisionContent[] => [
        { type: "text", text: `Frame ${i + 1} — ${(f.tMs / 1000).toFixed(1)} s` },
        { type: "image_url", image_url: { url: f.image, detail: "high" } },
      ]),
    ];

    // Two independent passes over the SAME stills (one quota unit, same 12-image bound): a form issue is
    // confirmed only when both confirm it on the same reference check. S3 eval (2026-11-03): single-pass
    // "confirmed" issues appeared in 1 of 3 runs on correct-form demos; agreement filters that instability.
    const model = process.env.OPENAI_SETVISION_VISION_MODEL?.trim() || "gpt-4.1-mini";
    const pass = (seed: number) => visionJson(VISUAL_REVIEW_SYSTEM_PROMPT, VISUAL_REVIEW_RESPONSE_FORMAT, 900, content, TIMEOUT_MS, model, { temperature: 0, seed });
    const replies = await Promise.all([pass(7), pass(11)]);
    // Both passes are needed to confirm anything; with one missing, nothing can be agreed, so no review.
    const review = replies.some((r) => r === null) ? null : sanitizeVisualReview(replies, times, exerciseLabel, reviewContext);
    if (!review) return fail(502, "UNAVAILABLE", "AI visual review is temporarily unavailable. Try again in a moment.");

    return NextResponse.json({ ok: true, review, personalized: Boolean(lens?.experience || lens?.goal || lens?.limitations) });
  } finally {
    inflight.delete(user.id);
  }
}
