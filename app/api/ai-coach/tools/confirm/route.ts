import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { asAiDatabaseClient } from "@/lib/ai/db";
import {
  cancelConfirmedToolAction,
  executeConfirmedToolAction,
} from "@/lib/ai/tools";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  toolLogId: z.string().uuid(),
  action: z.enum(["confirm", "cancel"]).default("confirm"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const db = asAiDatabaseClient(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = confirmSchema.safeParse(rawBody);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid confirmation payload." },
      { status: 400 },
    );
  }

  if (parsed.data.action === "cancel") {
    const result = await cancelConfirmedToolAction({
      db,
      userId: user.id,
      toolLogId: parsed.data.toolLogId,
    });

    if (result.ok) {
      await writeAuditLog({
        action: "ai_tool_proposal_cancelled",
        entityType: "ai_tool_log",
        entityId: parsed.data.toolLogId,
      });
    }

    return Response.json(result.body, { status: result.status });
  }

  const result = await executeConfirmedToolAction({
    db,
    userId: user.id,
    toolLogId: parsed.data.toolLogId,
  });

  if (result.ok) {
    await writeAuditLog({
      action: "ai_tool_proposal_confirmed",
      entityType: "ai_tool_log",
      entityId: parsed.data.toolLogId,
      metadata: {
        result: result.body.result ?? null,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
