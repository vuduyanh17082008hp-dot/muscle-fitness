/**
 * H0 WP1: one end-to-end budget per Dante turn. Transport retries (model fallback, agent rounds) and semantic repairs
 * (verifier regeneration, integrity repair, per-obligation repair) keep separate counters but share ONE deadline and
 * ONE abort signal, so no retry loop can ignore another. Every dependency deadline is <= the turn deadline because
 * every dependency signal is derived from `signal`.
 *
 * Values (measured from code, not invented):
 * - TURN_DEADLINE_MS = the existing OPENAI_STREAM_TIMEOUT_MS: one normal stream keeps exactly the allowance it had.
 * - RETRIEVAL_PHASE_MS: each evidence source already had a 7s timeout; PubMed is two sequential calls, so 10s lets
 *   esearch+efetch finish on a normal day and caps the phase at 1/6 of the turn instead of an unbounded body read.
 * - MIN_ATTEMPT_MS: no provider attempt starts with less time left than a short gpt-4o-mini answer needs.
 * - MAX_PROVIDER_ATTEMPTS = 4 = the legacy path's previous design maximum with one model (3 verifier + 1 integrity).
 * - MAX_SEMANTIC_REPAIRS = 3 = MAX_VERIFIER_RETRIES (2) + the one integrity repair.
 */
export const TURN_DEADLINE_MS = 60_000;
export const RETRIEVAL_PHASE_MS = 10_000;
export const MIN_ATTEMPT_MS = 8_000;
export const MAX_PROVIDER_ATTEMPTS = 4;
export const MAX_SEMANTIC_REPAIRS = 3;

export type BudgetKind = "provider" | "semantic" | "retrieval";

export type TurnBudget = {
  deadlineAt: number;
  /** Aborts on client disconnect OR turn deadline. Pass this (or a signal derived from it) to every dependency. */
  signal: AbortSignal;
  counts: Record<BudgetKind, number>;
  /** Per-turn caps. Defaults are Dante's; another coach on the same request may set its own design maximum (never raise the deadline). */
  limit: Record<BudgetKind, number>;
  remainingMs(): number;
  /** Reserve one attempt. False = do not start it (cap reached, deadline too close, or turn already aborted). */
  tryStart(kind: BudgetKind): boolean;
  /** The client went away: nothing produced from here on can reach anyone, so nothing may be committed for it. */
  clientGone(): boolean;
  /** Outcome per bounded dependency (`boundedDependency`), for the wp1 trace. */
  dependencies: Record<string, DependencyOutcome>;
};

const LIMIT: Record<BudgetKind, number> = { provider: MAX_PROVIDER_ATTEMPTS, semantic: MAX_SEMANTIC_REPAIRS, retrieval: Number.POSITIVE_INFINITY };

/**
 * `client` is the incoming Request (or anything owning a signal). Hold the OWNER, not just `request.signal`: undici's
 * Request.signal follows the caller's signal through a WeakRef to a controller only the Request keeps alive, so once a
 * streaming route has returned and the Request is collected, a client disconnect never reaches a bare `request.signal`.
 */
export function createTurnBudget(client?: { signal: AbortSignal }, deadlineMs = TURN_DEADLINE_MS, now: () => number = Date.now): TurnBudget {
  const clientSignal = client?.signal;
  const deadlineAt = now() + deadlineMs;
  const timeout = AbortSignal.timeout(deadlineMs);
  const signal = clientSignal ? AbortSignal.any([clientSignal, timeout]) : timeout;
  const counts: Record<BudgetKind, number> = { provider: 0, semantic: 0, retrieval: 0 };
  const limit = { ...LIMIT };
  const remainingMs = () => Math.max(0, deadlineAt - now());
  return {
    deadlineAt,
    signal,
    counts,
    limit,
    remainingMs,
    tryStart(kind) {
      if (signal.aborted || counts[kind] >= limit[kind]) return false;
      if (kind !== "retrieval" && remainingMs() < MIN_ATTEMPT_MS) return false;
      counts[kind] += 1;
      return true;
    },
    // Reads through `client` so the closure keeps the Request (and with it the abort link) alive for the whole turn.
    clientGone: () => client?.signal.aborted === true,
    dependencies: {},
  };
}

/** Retrieval lifecycle per source. RUNNING is never terminal: the phase signal guarantees every source leaves it. */
export type RetrievalSourceStatus = "RUNNING" | "SUCCESS" | "FAILED" | "TIMED_OUT" | "CANCELLED";

/** The phase's terminal state: some sources succeeding while others did not is PARTIAL, never SUCCESS or FAILED. */
export function retrievalPhaseStatus(sources: Record<string, RetrievalSourceStatus>): "NOT_RUN" | "SUCCESS" | "PARTIAL" | "FAILED" | "TIMED_OUT" | "CANCELLED" {
  const values = Object.values(sources);
  if (values.length === 0) return "NOT_RUN";
  if (values.every((v) => v === "SUCCESS")) return "SUCCESS";
  if (values.some((v) => v === "SUCCESS")) return "PARTIAL";
  if (values.includes("CANCELLED")) return "CANCELLED";
  return values.includes("TIMED_OUT") ? "TIMED_OUT" : "FAILED";
}

/**
 * Bound a dependency that CANNOT be cancelled (Supabase query, best-effort write): stop WAITING for it when `signal`
 * aborts. The work itself may still finish in the background; its late value is dropped here, never accepted.
 */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal, onAbort: () => T): Promise<T> {
  if (signal.aborted) return Promise.resolve().then(onAbort);
  return new Promise<T>((resolve, reject) => {
    const stop = () => {
      try {
        resolve(onAbort());
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

/**
 * Early Supabase point reads (auth, rate limit, timezone, coherence state, N-of-1) normally answer in < 300 ms. 3s is
 * the route's existing POST_TURN_COMMIT_WAIT_MS: one stalled read can cost at most that, and every read also stops at
 * the turn deadline because its signal is derived from `budget.signal`.
 */
export const EARLY_READ_MS = 3_000;

/** SKIPPED = never started (turn already over). CANCELLED = the client left while waiting. */
export type DependencyOutcome = "OK" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "SKIPPED";

export type DependencyResult<T> = { status: "OK"; value: T } | { status: Exclude<DependencyOutcome, "OK">; error?: unknown };

/**
 * Run one dependency under the turn budget: it does not start once the turn is over, and the caller stops waiting at
 * `waitMs` or the turn deadline, whichever is first. `start` receives the bounding signal so work that CAN be cancelled
 * (fetch, PostgREST `.abortSignal`) is; work that cannot keeps running and its late value is dropped (`untilAborted`).
 * The outcome is recorded on `budget.dependencies[name]` (last call wins).
 */
export async function boundedDependency<T>(
  budget: TurnBudget,
  name: string,
  start: (signal: AbortSignal) => PromiseLike<T>,
  waitMs = EARLY_READ_MS,
): Promise<DependencyResult<T>> {
  const stopped = (): DependencyResult<T> => ({ status: budget.clientGone() ? "CANCELLED" : "TIMED_OUT" });
  let result: DependencyResult<T>;
  if (budget.signal.aborted || budget.remainingMs() <= 0) {
    result = { status: budget.clientGone() ? "CANCELLED" : "SKIPPED" };
  } else {
    const signal = AbortSignal.any([budget.signal, AbortSignal.timeout(Math.min(waitMs, budget.remainingMs()))]);
    const work = Promise.resolve()
      .then(() => start(signal))
      .then(
        (value): DependencyResult<T> => ({ status: "OK", value }),
        (error: unknown): DependencyResult<T> => (signal.aborted ? stopped() : { status: "FAILED", error }),
      );
    result = await untilAborted(work, signal, stopped);
  }
  budget.dependencies[name] = result.status;
  return result;
}
