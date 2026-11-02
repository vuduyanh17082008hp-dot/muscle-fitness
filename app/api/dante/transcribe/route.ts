import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

import { getOpenAiApiKey, isOpenAiConfigured } from "@/lib/dante-core/openai/config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dante/transcribe — MF-S1 Dante voice input. Speech → text ONLY: the transcript goes back to the composer,
 * where the user edits it and sends it through the normal /api/chatbot pipeline. Nothing here talks to Dante, writes
 * athlete data, or triggers an action.
 *
 * - Authenticated session required; per-user rate limit; server-side API key only.
 * - multipart field "audio": ≤ 4 MB (≈ 60 s of browser audio), one of the formats the model accepts.
 * - The audio lives in memory for this request only — never stored, never logged; the transcript is never logged.
 */

export const TRANSCRIBE_MODEL = process.env.DANTE_TRANSCRIBE_MODEL?.trim() || "gpt-transcribe";
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
/** Gym vocabulary the model should spell as lifters do (keywords is a gpt-transcribe parameter). */
const KEYWORDS = ["RDL", "Romanian deadlift", "Bulgarian split squat", "RPE", "RIR", "PR", "deload", "superset", "hypertrophy", "lat pulldown", "leg press", "calf raise", "kcal", "macros", "protein", "Dante", "Gemma"];

// ponytail: per-process window (one Node instance locally); move to the check_dante_rate_limit RPC with a bucket key
// if this runs on more than one instance.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const recent = new Map<string, number[]>();
function allow(userId: string, now: number): boolean {
  const hits = (recent.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(userId, hits);
    return false;
  }
  hits.push(now);
  recent.set(userId, hits);
  return true;
}

const fail = (status: number, error: string, code: string) => NextResponse.json({ ok: false, error, code }, { status });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Please sign in again.", "UNAUTHORIZED");

  if (!allow(user.id, Date.now())) return fail(429, "Too many voice messages in a minute. Wait a moment and try again.", "RATE_LIMITED");
  if (!isOpenAiConfigured()) return fail(503, "Voice input isn't available right now. You can type instead.", "UNAVAILABLE");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 64 * 1024) return fail(413, "That recording is too long. Keep it under a minute.", "TOO_LARGE");

  let audio: File | null = null;
  let language: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("audio");
    audio = value instanceof File ? value : null;
    const lang = form.get("language");
    language = lang === "en" || lang === "vi" ? lang : null;
  } catch {
    return fail(400, "That recording couldn't be read.", "INVALID");
  }
  if (!audio || audio.size === 0) return fail(400, "No audio was received.", "EMPTY");
  if (audio.size > MAX_BYTES) return fail(413, "That recording is too long. Keep it under a minute.", "TOO_LARGE");
  const baseType = audio.type.split(";")[0]!.trim().toLowerCase();
  const extension = TYPES[baseType];
  if (!extension) return fail(415, "That audio format isn't supported.", "UNSUPPORTED_TYPE");

  try {
    const client = new OpenAI({ apiKey: getOpenAiApiKey(), timeout: 30_000, maxRetries: 1 });
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), `speech.${extension}`, { type: baseType });
    const result = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      response_format: "json",
      // English and Vietnamese are what Dante answers in; the user's composer language goes first when known.
      languages: language === "vi" ? ["vi", "en"] : ["en", "vi"],
      keywords: KEYWORDS,
    });
    const text = (result.text ?? "").trim();
    if (!text) return fail(422, "I couldn't hear any speech in that. Try again a little closer to the mic.", "NO_SPEECH");
    return NextResponse.json({ ok: true, text: text.slice(0, 4000), model: TRANSCRIBE_MODEL });
  } catch (error) {
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    console.error("[DANTE TRANSCRIBE] provider failed:", status ?? (error instanceof Error ? error.name : "unknown"));
    return fail(502, "Voice transcription failed. Nothing was sent — try again or type instead.", "PROVIDER_FAILED");
  }
}
