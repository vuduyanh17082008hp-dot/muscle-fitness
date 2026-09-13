import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createExperiment, listExperiments } from "@/lib/experiments/mutations";
import { buildExperimentResultFor } from "@/lib/experiments/build-experiment-result";
import { EXPOSURE_TYPES, OUTCOME_TYPES, type ExposureTypeId, type OutcomeTypeId } from "@/lib/experiments/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPOSURE_IDS = EXPOSURE_TYPES.map((e) => e.id) as [ExposureTypeId, ...ExposureTypeId[]];
const OUTCOME_IDS = OUTCOME_TYPES.map((o) => o.id) as [OutcomeTypeId, ...OutcomeTypeId[]];

const createSchema = z.object({
  question: z.string().min(1).max(200),
  exposureType: z.enum(EXPOSURE_IDS),
  outcomeType: z.enum(OUTCOME_IDS),
  windowDays: z.number().int().min(7).max(90).optional(),
});

/**
 * GET /api/experiments — this user's active experiments, each with
 * its analysis computed fresh from real logged data (never cached
 * results that could go stale as new days are logged).
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const experiments = await listExperiments(supabase, user.id);

  const withResults = await Promise.all(
    experiments.map(async (experiment) => ({
      experiment,
      result: await buildExperimentResultFor(supabase, user.id, experiment),
    })),
  );

  return NextResponse.json({
    ok: true,
    experiments: withResults,
    catalog: { exposureTypes: EXPOSURE_TYPES, outcomeTypes: OUTCOME_TYPES },
  });
}

/** POST /api/experiments — define a new N-of-1 experiment (QUESTION -> DEFINE EXPOSURE -> DEFINE OUTCOME). */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await createExperiment(supabase, user.id, parsed.data);

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, experiment: result.data });
}
