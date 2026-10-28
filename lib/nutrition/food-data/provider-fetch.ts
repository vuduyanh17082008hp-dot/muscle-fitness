import "server-only"

/**
 * One fetch policy for the external food databases (USDA, Open Food Facts).
 *
 * - The timeout is a single budget over every attempt and the body read.
 * - Only transient failures are retried, once, and only with budget left: a temporary DNS
 *   failure (EAI_AGAIN), a dropped connection, or HTTP 502/504. A 4xx is our request's fault
 *   and an ENOTFOUND or 503 will not fix itself in 250 ms — those are never retried.
 * - A 429, or a 503 that carries Retry-After, pauses that provider for the stated time so we stop
 *   adding load while it sheds it (Open Food Facts rate-limits by IP). A paused call fails fast.
 * - Each distinct failure is logged as one line, at most once a minute, with a count of the repeats.
 */

export type ProviderFailureKind = "timeout" | "dns" | "network" | "rate_limited" | "http_4xx" | "http_5xx" | "paused"

export class ProviderFetchError extends Error {
  constructor(
    readonly kind: ProviderFailureKind,
    readonly detail: string,
    readonly httpStatus?: number,
  ) {
    super(`${kind}: ${detail}`)
    this.name = "ProviderFetchError"
  }
}

const TRANSIENT_CODES = new Set(["EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"])
const RETRY_DELAY_MS = 250
const MIN_BUDGET_FOR_RETRY_MS = 1500
const DEFAULT_PAUSE_MS = 60_000
const MAX_PAUSE_MS = 5 * 60_000
const LOG_WINDOW_MS = 60_000

const pausedUntil = new Map<string, number>()
const lastLogged = new Map<string, { at: number; suppressed: number }>()

function causeCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause
  return typeof cause?.code === "string" ? cause.code : undefined
}

function classifyThrown(error: unknown): ProviderFetchError {
  if (error instanceof ProviderFetchError) return error
  const name = (error as { name?: unknown } | null)?.name
  if (name === "TimeoutError" || name === "AbortError") return new ProviderFetchError("timeout", "no response within the time budget")
  const code = causeCode(error)
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new ProviderFetchError("dns", code)
  return new ProviderFetchError("network", code ?? String((error as Error)?.message ?? error))
}

function retryable(error: ProviderFetchError): boolean {
  return (error.kind === "dns" && error.detail === "EAI_AGAIN") ||
    (error.kind === "network" && TRANSIENT_CODES.has(error.detail)) ||
    (error.kind === "http_5xx" && (error.httpStatus === 502 || error.httpStatus === 504))
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after")
  if (!header) return null
  const seconds = Number(header)
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now()
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_PAUSE_MS) : null
}

/** One line per provider + failure, at most once per LOG_WINDOW_MS, never the full stack. */
export function logProviderFailure(provider: string, operation: string, error: unknown): void {
  const failure = classifyThrown(error)
  const key = `${provider}:${operation}:${failure.kind}:${failure.detail}`
  const now = Date.now()
  const previous = lastLogged.get(key)
  if (previous && now - previous.at < LOG_WINDOW_MS) {
    previous.suppressed += 1
    return
  }
  const repeats = previous?.suppressed ? ` (${previous.suppressed} similar in the last minute)` : ""
  lastLogged.set(key, { at: now, suppressed: 0 })
  console.warn(`[${provider}] ${operation} unavailable: ${failure.kind} ${failure.detail}${repeats}`)
}

/**
 * fetch with the policy above. Resolves only with a 2xx response, or with a status listed in `acceptStatus`
 * (e.g. OFF's 404 "unknown product"). Every other outcome throws a ProviderFetchError.
 */
export async function providerFetch(
  provider: string,
  url: string,
  options: { timeoutMs: number; headers?: Record<string, string>; acceptStatus?: number[] },
): Promise<Response> {
  const paused = pausedUntil.get(provider)
  if (paused && paused > Date.now()) throw new ProviderFetchError("paused", `rate-limited for ${Math.ceil((paused - Date.now()) / 1000)} s more`)

  const deadline = Date.now() + options.timeoutMs
  // H0 WP1: the timeout stays on the request so it bounds the body read too (a cleared timer left `.json()` unbounded).
  const signal = AbortSignal.timeout(options.timeoutMs)

  for (let attempt = 1; ; attempt += 1) {
    let failure: ProviderFetchError
    try {
      const response = await fetch(url, { signal, headers: options.headers, cache: "no-store" })
      if (response.ok || options.acceptStatus?.includes(response.status)) return response

      const pause = response.status === 429 ? retryAfterMs(response) ?? DEFAULT_PAUSE_MS : response.status === 503 ? retryAfterMs(response) : null
      if (pause) pausedUntil.set(provider, Date.now() + pause)
      failure = response.status === 429
        ? new ProviderFetchError("rate_limited", `HTTP 429`, 429)
        : new ProviderFetchError(response.status < 500 ? "http_4xx" : "http_5xx", `HTTP ${response.status}`, response.status)
    } catch (error) {
      failure = classifyThrown(error)
    }

    if (attempt > 1 || !retryable(failure) || deadline - Date.now() < MIN_BUDGET_FOR_RETRY_MS) throw failure
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
}

/** Concurrent identical lookups share one upstream request. */
export function sharedInFlight<T>(map: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const existing = map.get(key)
  if (existing) return existing
  const pending = run().finally(() => map.delete(key))
  map.set(key, pending)
  return pending
}

/** Test-only: forget pauses and log throttling between cases. */
export function resetProviderFetchState(): void {
  pausedUntil.clear()
  lastLogged.clear()
}
