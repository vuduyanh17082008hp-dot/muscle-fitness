/**
 * Classifies a supabase-js / PostgREST query error so callers never
 * confuse an auth rejection or an outage with "row missing" or "column
 * missing". The disposition is safe to log; the raw message may not be.
 */
export type QueryErrorDisposition =
  | "AUTH_EXPIRED"
  | "AUTH_CLOCK_SKEW_OR_FUTURE_IAT"
  | "AUTH_INVALID"
  | "RLS_DENIED"
  | "SCHEMA_MISMATCH"
  | "NOT_FOUND"
  | "DEPENDENCY_FAILURE"
  | "QUERY_FAILED"

type QueryErrorLike = {
  code?: string | null
  message?: string | null
}

// PostgREST / Postgres codes: https://docs.postgrest.org/en/stable/references/errors.html
const SCHEMA_CODES = new Set([
  "42703", // undefined_column
  "42P01", // undefined_table
  "42883", // undefined_function
  "PGRST200", // relationship not found in schema cache
  "PGRST201", // ambiguous relationship
  "PGRST202", // function not found in schema cache
  "PGRST204", // column not found in schema cache
  "PGRST205", // table not found in schema cache
])

const DEPENDENCY_CODES = new Set([
  "57014", // statement_timeout
  "PGRST000", // could not connect to database
  "PGRST001", // database connection error
  "PGRST002", // schema cache not ready
  "PGRST003", // pool acquisition timeout
])

export function classifyQueryError(
  error: QueryErrorLike,
  status?: number,
): QueryErrorDisposition {
  const code = error.code ?? ""
  const message = (error.message ?? "").toLowerCase()

  if (code === "PGRST303" || code === "PGRST301" || code === "PGRST302" || status === 401) {
    if (message.includes("expired")) return "AUTH_EXPIRED"
    // "JWT issued at future" (iat) / not-yet-valid (nbf): the verifier's
    // clock is behind the issuer's. Never retried as a schema problem.
    if (message.includes("future") || message.includes("not yet valid")) {
      return "AUTH_CLOCK_SKEW_OR_FUTURE_IAT"
    }
    return "AUTH_INVALID"
  }
  if (code === "42501" || status === 403) return "RLS_DENIED"
  if (SCHEMA_CODES.has(code)) return "SCHEMA_MISMATCH"
  if (code === "PGRST116") return "NOT_FOUND"
  if (DEPENDENCY_CODES.has(code)) return "DEPENDENCY_FAILURE"
  // postgrest-js transport failures: no code, status 0 (or the HTTP status
  // when the body read failed), message "<ErrorName>: ...".
  if (!code && (status === 0 || (status ?? 0) >= 500 || /^\w*error: /.test(message))) {
    return "DEPENDENCY_FAILURE"
  }
  return "QUERY_FAILED"
}

export function isAuthDisposition(disposition: QueryErrorDisposition): boolean {
  return disposition.startsWith("AUTH_")
}
