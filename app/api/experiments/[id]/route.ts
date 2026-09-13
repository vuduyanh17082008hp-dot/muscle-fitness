import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { deleteExperiment, getExperiment } from "@/lib/experiments/mutations";
import { buildExperimentResultFor } from "@/lib/experiments/build-experiment-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/experiments/[id] — one experiment + its freshly-computed analysis. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const experiment = await getExperiment(supabase, user.id, id);

  if (!experiment) {
    return NextResponse.json({ ok: false, error: "Experiment not found." }, { status: 404 });
  }

  const result = await buildExperimentResultFor(supabase, user.id, experiment);

  return NextResponse.json({ ok: true, experiment, result });
}

/** DELETE /api/experiments/[id] — RLS-scoped; a foreign id is treated as not found, never silently affecting another user's row. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteExperiment(supabase, user.id, id);

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
