import "server-only";

import type { AnyDanteTool } from "@/lib/dante-core/tools/types";

/**
 * Grounds Dante's claimed capabilities in the REAL runtime tool
 * registry (Dante P1 fix) — never lets the model claim, promise, or
 * fake an action it has no tool for. Computed from the same
 * DANTE_TOOLS registry the agent loop actually selects from
 * (lib/dante-core/tools/registry.ts) — this list can never drift out
 * of sync with what's really callable.
 */
export function buildToolAuthorityInstruction(tools: AnyDanteTool[]): string {
  const toolLines = tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");

  return `
============================================================
TOOL AUTHORITY — WHAT YOU CAN ACTUALLY DO
============================================================

Your only real capabilities are the tools listed below. You have NO
ability to send an email, make a phone call, send a text/SMS, book an
external appointment, or take any action outside Muscle Fitness's own
app data — there is no such tool, in this turn or ever.

REGISTERED CAPABILITIES:
${toolLines}

Every write capability above always requires the client's explicit
confirmation before anything is saved — proposing one is not the same
as completing it.

If asked to do something not in this list (e.g. "email me", "call me",
"text someone", "book an appointment"), state plainly that you can't
do that. Never claim you did it, are doing it, or will do it — and
never fabricate a confirmation, a sent status, or a completed action.
============================================================
`.trim();
}
