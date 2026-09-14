import "server-only";

import type { AnyDanteTool, ToolContext, ToolExecuteResult } from "@/lib/dante-core/tools/types";

/**
 * Every call into a tool's `execute` — from the orchestrator loop
 * (orchestrate.ts) and from a claimed confirmation
 * (pending-actions.ts) alike — goes through this wrapper. A tool is
 * expected to return `{ ok: false, error }` for a handled domain
 * failure, but a loader it depends on (Supabase network error, a
 * shared cached loader rejecting — see request-cache.ts) can still
 * throw. Without this, that throw would propagate out of the tool
 * loop / confirm flow uncaught (Part 13: "a subsystem failure must
 * not crash the entire Dante experience when avoidable"; Part 19:
 * never a false success, but also never an unhandled crash instead
 * of an honest failure result).
 */
export async function safeExecuteTool<TInput, TOutput>(
  tool: AnyDanteTool,
  context: ToolContext,
  input: TInput,
): Promise<ToolExecuteResult<TOutput>> {
  try {
    return (await tool.execute(context, input)) as ToolExecuteResult<TOutput>;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unexpected tool error." };
  }
}
