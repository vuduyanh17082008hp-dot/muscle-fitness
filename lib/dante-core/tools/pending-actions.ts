import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getDanteTool } from "@/lib/dante-core/tools/registry";
import type { ToolContext } from "@/lib/dante-core/tools/types";
import { logToolEvent } from "@/lib/dante-core/tools/observability";
import { safeExecuteTool } from "@/lib/dante-core/tools/safe-execute";

/**
 * The pending-action model (Part 8/9) for a Dante WRITE tool call.
 * Every write tool's proposal becomes exactly one row in
 * `dante_tool_actions` (never the model, never the client — this
 * module is the only writer). CONFIRM and CANCEL are both atomic
 * compare-and-swap UPDATEs scoped to (id, user_id, status='pending',
 * not-yet-expired): only ONE concurrent request can ever win the
 * transition out of 'pending', which is what makes a double-click
 * CONFIRM, a CONFIRM after CANCEL, a CONFIRM on someone else's action,
 * and a CONFIRM past expiry all resolve to "0 rows updated" instead of
 * a race (Part 9: "avoid race-prone check-then-insert when
 * database-level protection is possible").
 */

export const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

export type PendingActionRow = {
  id: string;
  user_id: string;
  tool_name: string;
  status: "pending" | "confirmed" | "executed" | "cancelled" | "expired" | "failed";
  args: unknown;
  summary: string;
  result: unknown;
  created_at: string;
  expires_at: string;
  executed_at: string | null;
};

export type CreatePendingActionResult = {
  actionId: string;
  toolName: string;
  summary: string;
  expiresAt: string;
};

export async function createPendingAction(
  supabase: SupabaseClient,
  userId: string,
  toolName: string,
  args: unknown,
  summary: string,
  now: Date = new Date(),
): Promise<CreatePendingActionResult> {
  const expiresAt = new Date(now.getTime() + PENDING_ACTION_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("dante_tool_actions")
    .insert({
      user_id: userId,
      tool_name: toolName,
      status: "pending",
      args,
      summary,
      expires_at: expiresAt,
    })
    .select("id, summary, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create a pending action.");
  }

  logToolEvent("DANTE_CONFIRMATION_CREATED", { tool: toolName });

  return { actionId: data.id as string, toolName, summary: data.summary as string, expiresAt: data.expires_at as string };
}

export type ConfirmOutcome =
  | { ok: true; status: "executed"; result: unknown }
  | { ok: false; status: "failed"; error: string }
  | { ok: false; status: "not_found" | "already_handled" | "expired"; error: string };

/**
 * CONFIRM: claims the row (pending -> confirmed, atomically), then
 * runs the underlying tool exactly once, then records the outcome
 * (confirmed -> executed | failed). Never touches a row this
 * `userId` doesn't own — RLS enforces that independently, and the
 * WHERE clause below makes it explicit even against a service-role
 * caller in the future.
 */
export async function confirmPendingAction(
  supabase: SupabaseClient,
  context: ToolContext,
  actionId: string,
): Promise<ConfirmOutcome> {
  const nowIso = context.now.toISOString();

  const { data: claimed, error: claimError } = await supabase
    .from("dante_tool_actions")
    .update({ status: "confirmed" })
    .eq("id", actionId)
    .eq("user_id", context.userId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .select("id, tool_name, args")
    .maybeSingle();

  if (claimError) {
    return { ok: false, status: "failed", error: claimError.message };
  }

  if (!claimed) {
    const reason = await describeUnclaimableAction(supabase, context.userId, actionId, nowIso);
    return reason;
  }

  const toolName = claimed.tool_name as string;
  const tool = getDanteTool(toolName);

  if (!tool) {
    await supabase
      .from("dante_tool_actions")
      .update({ status: "failed", result: { error: "Tool no longer registered." }, executed_at: nowIso })
      .eq("id", actionId);

    logToolEvent("DANTE_TOOL_FAILED", { tool: toolName });
    return { ok: false, status: "failed", error: "This action is no longer available." };
  }

  const parsedArgs = tool.inputSchema.safeParse(claimed.args);

  if (!parsedArgs.success) {
    await supabase
      .from("dante_tool_actions")
      .update({ status: "failed", result: { error: "Stored arguments failed validation." }, executed_at: nowIso })
      .eq("id", actionId);

    return { ok: false, status: "failed", error: "This action's saved details are no longer valid." };
  }

  const executionResult = await safeExecuteTool(tool, context, parsedArgs.data);

  if (!executionResult.ok) {
    await supabase
      .from("dante_tool_actions")
      .update({ status: "failed", result: { error: executionResult.error }, executed_at: nowIso })
      .eq("id", actionId);

    logToolEvent("DANTE_TOOL_FAILED", { tool: toolName });
    return { ok: false, status: "failed", error: executionResult.error };
  }

  await supabase
    .from("dante_tool_actions")
    .update({ status: "executed", result: executionResult.data as Record<string, unknown>, executed_at: nowIso })
    .eq("id", actionId);

  logToolEvent("DANTE_CONFIRMATION_EXECUTED", { tool: toolName });
  logToolEvent("DANTE_TOOL_SUCCESS", { tool: toolName });

  return { ok: true, status: "executed", result: executionResult.data };
}

export type CancelOutcome = { ok: true } | { ok: false; status: "not_found" | "already_handled"; error: string };

/** CANCEL: pending -> cancelled, atomically. No mutation ever runs (Part 8/H). */
export async function cancelPendingAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<CancelOutcome> {
  const { data, error } = await supabase
    .from("dante_tool_actions")
    .update({ status: "cancelled" })
    .eq("id", actionId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id, tool_name")
    .maybeSingle();

  if (error) {
    return { ok: false, status: "already_handled", error: error.message };
  }

  if (!data) {
    const { data: existing } = await supabase.from("dante_tool_actions").select("id").eq("id", actionId).eq("user_id", userId).maybeSingle();
    return existing
      ? { ok: false, status: "already_handled", error: "This action was already handled." }
      : { ok: false, status: "not_found", error: "Action not found." };
  }

  logToolEvent("DANTE_CONFIRMATION_CANCELLED", { tool: data.tool_name as string });

  return { ok: true };
}

async function describeUnclaimableAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
  nowIso: string,
): Promise<ConfirmOutcome> {
  // RLS already scopes this to the caller's own rows — a wrong-owner
  // actionId and a genuinely missing one look identical here (Part 17/J),
  // which is the correct behavior: never confirm/deny existence of
  // another user's action.
  const { data } = await supabase
    .from("dante_tool_actions")
    .select("status, expires_at")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { ok: false, status: "not_found", error: "Action not found." };
  }

  if (data.status === "pending" && data.expires_at <= nowIso) {
    await supabase.from("dante_tool_actions").update({ status: "expired" }).eq("id", actionId).eq("status", "pending");
    logToolEvent("DANTE_CONFIRMATION_EXPIRED", { tool: "" });
    return { ok: false, status: "expired", error: "This confirmation has expired — please ask again." };
  }

  return { ok: false, status: "already_handled", error: `This action was already ${data.status}.` };
}
