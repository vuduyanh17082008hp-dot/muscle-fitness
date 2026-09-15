/**
 * Supabase / PostgREST "relation missing" detection.
 *
 * Phase 2C deliberately does NOT require applying every Dante adaptive-
 * intelligence migration. Call sites must degrade quietly when these
 * tables are absent instead of spamming schema-cache warnings on every
 * dashboard/Dante page load.
 */

export function isMissingRelationError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;

  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toUpperCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}
