import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  fileExtension: z
    .string()
    .regex(/^[a-zA-Z0-9]{2,5}$/, "Unexpected file extension.")
    .default("mp4"),
});

/**
 * POST /api/setvision/upload-url — issues a short-lived signed upload
 * URL scoped to "<user_id>/<timestamp>.<ext>" in the private
 * 'setvision-videos' bucket (spec Part B §26: video never goes into a
 * normal DB row). The client uploads the video file directly to
 * Supabase Storage using this URL, then calls /api/setvision/results
 * with the resulting path and the already-computed analysis.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    // Empty body is fine — the extension defaults to mp4.
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const path = `${user.id}/${Date.now()}.${parsed.data.fileExtension}`;

  const { data, error } = await supabase.storage
    .from("setvision-videos")
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[SETVISION UPLOAD URL ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Could not create an upload URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
  });
}
