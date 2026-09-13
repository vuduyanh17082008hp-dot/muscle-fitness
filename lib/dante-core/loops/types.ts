/**
 * Loop primitives (mission Part 10). These are thin, generic
 * formalizations of patterns already present in the codebase — this
 * file does not introduce new runtime behavior by itself, it names
 * the shape so the orchestrator and future callers build on one
 * documented contract instead of five ad-hoc variations.
 *
 * "The model is temporary. The athlete state is persistent." — every
 * loop here takes CURRENT PERSISTENT STATE as input and returns a
 * result; none of them carry conversation history as their source of
 * truth (the Dante chat's own message list is a UI convenience, not
 * what any loop below reasons from).
 */

/** A. REACT LOOP — reason -> respond/act -> observe, seconds/minutes. Used by the chatbot route today (detect intent -> load context -> reply) without a separate wrapper; formalized here for future skills that need the same shape explicitly. */
export type ReactLoopStep<TState, TResult> = {
  reason: (state: TState) => TResult;
  act?: (result: TResult) => void | Promise<void>;
};

export async function runReactLoop<TState, TResult>(
  state: TState,
  step: ReactLoopStep<TState, TResult>,
): Promise<TResult> {
  const result = step.reason(state);
  await step.act?.(result);
  return result;
}

/** B. PLAN-EXECUTE-VERIFY — for mutations. lib/dante-core/actions/apply-action.ts already implements this shape (validate ownership -> write -> return a real result); this type names the contract for new mutation paths (e.g. autonomy-gated auto-apply). */
export type PlanExecuteVerifyResult<TVerification> =
  | { status: "executed"; verification: TVerification }
  | { status: "rejected"; reason: string }
  | { status: "failed"; reason: string };

export type PlanExecuteVerifyStep<TPlan, TVerification> = {
  validate: (plan: TPlan) => { ok: true } | { ok: false; reason: string };
  execute: (plan: TPlan) => Promise<{ ok: true; verification: TVerification } | { ok: false; reason: string }>;
};

export async function runPlanExecuteVerify<TPlan, TVerification>(
  plan: TPlan,
  step: PlanExecuteVerifyStep<TPlan, TVerification>,
): Promise<PlanExecuteVerifyResult<TVerification>> {
  const validation = step.validate(plan);
  if (!validation.ok) {
    return { status: "rejected", reason: validation.reason };
  }

  const result = await step.execute(plan);
  if (!result.ok) {
    return { status: "failed", reason: result.reason };
  }

  return { status: "executed", verification: result.verification };
}

/** C. REFLECTION LOOP — action -> outcome -> evaluate -> learn, hours/days/weeks. Real implementation: lib/dante-core/memory-hierarchy/record-observation.ts (evaluate = resolveObservedOutcome, learn = recordEvidence/consolidate). */
export type ReflectionLoopInput<TOutcome> = {
  evaluate: () => TOutcome;
  learn: (outcome: TOutcome) => Promise<void>;
};

export async function runReflectionLoop<TOutcome>(input: ReflectionLoopInput<TOutcome>): Promise<TOutcome> {
  const outcome = input.evaluate();
  await input.learn(outcome);
  return outcome;
}

/**
 * D. FRESH-CONTEXT LOOP — load current canonical state -> decide ->
 * act -> persist -> terminate. Real implementation:
 * lib/dante-core/orchestrator/index.ts::runDanteCycle, which loads
 * AthleteState + ClientPolicy fresh on every call and holds no
 * in-memory session state between invocations.
 */
export type FreshContextLoopStep<TState, TDecision> = {
  loadState: () => Promise<TState>;
  decide: (state: TState) => TDecision;
  persist: (state: TState, decision: TDecision) => Promise<void>;
};

export async function runFreshContextLoop<TState, TDecision>(
  step: FreshContextLoopStep<TState, TDecision>,
): Promise<{ state: TState; decision: TDecision }> {
  const state = await step.loadState();
  const decision = step.decide(state);
  await step.persist(state, decision);
  return { state, decision };
}
