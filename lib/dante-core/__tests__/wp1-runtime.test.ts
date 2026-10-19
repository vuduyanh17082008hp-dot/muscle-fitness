/**
 * H0 WP1 — runtime correctness, deterministic fault injection (no network: provider and sources are local fakes).
 * Each case is the brief's fault list: hang, abort, ignored abort, retryable / non-retryable errors, deadline before
 * retry, partial sources, late results, state change, language-only change, concurrency and mutation timeout.
 */
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { resolveConfirmationOutcome, createChatStreamResponse } from "@/lib/dante-core/chat-stream-protocol";
import { commitPostTurn, createInMemoryCoherenceStore, prepareTurnWithPersistence } from "@/lib/dante-core/coherence/persistence";
import { streamDanteReply } from "@/lib/dante-core/openai/client";
import { runDanteAgentTurn } from "@/lib/dante-core/tools/orchestrate";
import {
  createTurnBudget,
  MAX_PROVIDER_ATTEMPTS,
  MAX_SEMANTIC_REPAIRS,
  MIN_ATTEMPT_MS,
  retrievalPhaseStatus,
  untilAborted,
} from "@/lib/dante-core/turn-budget";
import { runVerifiedGeneration } from "@/lib/dante-core/verifier";
import { buildIntelligenceBrief } from "@/lib/intelligence/performance-core";
import { settleKnowledgeState } from "@/lib/intelligence/performance-core/registry";

const sse = (text: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });
const passingInput = (replyText: string) => ({ replyText, knownFacts: [], availableSources: [], safety: { triggered: false, responseOverride: null } });
// "Your readiness is 91" with no known fact behind it fails the numeric-grounding verifier every time.
const failingInput = (replyText: string) => ({ ...passingInput(replyText), replyText: `${replyText} Your readiness score is 91 today.` });
const elapsed = async <T,>(work: Promise<T>) => {
  const start = Date.now();
  const value = await work;
  return { value, ms: Date.now() - start };
};

let stalled: Server;
let stalledUrl = "";
beforeAll(async () => {
  // A real socket that sends headers and half a JSON body, then never finishes — the previous hang's shape.
  stalled = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"esearchresult":');
  });
  await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
  const address = stalled.address();
  stalledUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => {
  stalled.closeAllConnections();
  stalled.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("1 HANG — a dependency that never responds", () => {
  it("old pattern (timer cleared at headers) leaves the body read unbounded; the kept signal ends it", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 200);
    const response = await fetch(stalledUrl, { signal: controller.signal });
    clearTimeout(timer);
    const old = await Promise.race([response.json().then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("STILL_PENDING"), 600))]);
    expect(old).toBe("STILL_PENDING");

    const kept = await fetch(stalledUrl, { signal: AbortSignal.timeout(300) });
    const { value, ms } = await elapsed(kept.json().then(() => "resolved", (error: Error) => error.name));
    expect(value).toBe("TimeoutError");
    expect(ms).toBeLessThan(1500);
  });

  it("a never-settling dependency still lets the turn reach a terminal value inside its deadline", async () => {
    const budget = createTurnBudget(undefined, 250);
    const { value, ms } = await elapsed(untilAborted(new Promise<string>(() => {}), budget.signal, () => "TIMED_OUT"));
    expect(value).toBe("TIMED_OUT");
    expect(ms).toBeLessThan(1000);
  });
});

describe("2 ABORT — dependencies that support cancellation receive it", () => {
  it("a client disconnect (Next aborts with ResponseAborted) reaches the provider fetch and ends the stream", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const client = new AbortController();
    const budget = createTurnBudget(client);
    let seen: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      seen = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    }));
    const run = (async () => {
      for await (const _ of streamDanteReply("hi", budget.signal, budget)) void _;
    })();
    setTimeout(() => client.abort(Object.assign(new Error("aborted"), { name: "ResponseAborted" })), 30);
    await expect(run).rejects.toMatchObject({ name: "ResponseAborted" });
    expect(seen?.aborted).toBe(true);
    expect(budget.clientGone()).toBe(true);
    // ResponseAborted is not "AbortError": the next model must NOT be tried after the client left.
    expect(budget.counts.provider).toBe(1);
  });

  it("the agent loop passes the turn signal into each model call and stops when the budget is spent", async () => {
    const client = new AbortController();
    const budget = createTurnBudget(client);
    const signals: Array<AbortSignal | undefined> = [];
    const envelope = await runDanteAgentTurn({ supabase: {} as never, userId: "u", now: new Date(), timezone: null, cache: new Map() }, "add 100g rice to lunch", {
      budget,
      callModel: async (_messages, _tools, signal) => {
        signals.push(signal);
        return { type: "tool_calls", toolCalls: [{ id: `c${signals.length}`, name: "nonexistent_tool", arguments: { n: signals.length } }] };
      },
    });
    expect(signals.every((signal) => signal === budget.signal)).toBe(true);
    expect(budget.counts.provider).toBeLessThanOrEqual(MAX_PROVIDER_ATTEMPTS);
    expect(envelope.reply).toMatch(/couldn't finish/);
  });
});

describe("2b ABORT survives the Request being otherwise unreachable (streaming route already returned)", () => {
  const gc = (globalThis as { gc?: () => void }).gc;
  // Runs only with GC exposed: NODE_OPTIONS=--expose-gc npx vitest run <this file>
  it.skipIf(!gc)("a client abort still reaches the budget after GC, because the budget holds the Request", async () => {
    const client = new AbortController();
    const budget = (() => createTurnBudget(new Request("http://localhost/api/chatbot", { method: "POST", signal: client.signal })))();
    for (let i = 0; i < 10; i += 1) gc!();
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (let i = 0; i < 10; i += 1) gc!();
    client.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(budget.signal.aborted).toBe(true);
    expect(budget.clientGone()).toBe(true);
  });
});

describe("3 ABORT UNSUPPORTED — a dependency that ignores the signal", () => {
  it("the turn stops waiting, the late value is rejected, and nothing claims the work was cancelled", async () => {
    const budget = createTurnBudget(undefined, 150);
    let finished = false;
    const work = new Promise<string>((resolve) => setTimeout(() => { finished = true; resolve("LATE_VALUE"); }, 400));
    const accepted = await untilAborted(work, budget.signal, () => "DEADLINE");
    expect(accepted).toBe("DEADLINE");
    expect(finished).toBe(false); // still running: timeout is not cancellation
    await work;
    expect(finished).toBe(true);
    expect(accepted).toBe("DEADLINE"); // the late value never replaced the accepted one
  });
});

describe("4/5 RETRYABLE vs NON-RETRYABLE provider errors", () => {
  it("a transient 503 on the primary model is retried once on the fallback model, inside the budget", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("DANTE_OPENAI_MODEL", "model-a");
    vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "model-b");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      calls.push(model);
      return model === "model-a" ? new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 }) : sse("ok");
    }));
    const budget = createTurnBudget();
    let text = "";
    for await (const event of streamDanteReply("hi", budget.signal, budget)) if (event.kind === "delta") text += event.text;
    expect(text).toBe("ok");
    expect(calls).toEqual(["model-a", "model-b"]);
    expect(budget.counts.provider).toBe(2);
  });

  it("a 401 is not retried", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("DANTE_OPENAI_MODEL", "model-a");
    vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "model-b");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = createTurnBudget();
    await expect((async () => { for await (const _ of streamDanteReply("hi", budget.signal, budget)) void _; })()).rejects.toThrow(/OPENAI_API_KEY/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("6 DEADLINE — no attempt starts without enough budget left", () => {
  it("a provider attempt is refused when less than MIN_ATTEMPT_MS remains", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const fetchMock = vi.fn(async () => sse("never"));
    vi.stubGlobal("fetch", fetchMock);
    const budget = createTurnBudget(undefined, MIN_ATTEMPT_MS - 1);
    await expect((async () => { for await (const _ of streamDanteReply("hi", budget.signal, budget)) void _; })()).rejects.toThrow(/budget exhausted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the verifier loop stops regenerating when the budget refuses, and ships its fallback", async () => {
    let now = 0;
    const budget = createTurnBudget(undefined, 60_000, () => now);
    let generations = 0;
    const result = await runVerifiedGeneration(
      async () => {
        generations += 1;
        now = 60_000 - MIN_ATTEMPT_MS + 1; // the first draft used up the time a retry would need
        return "draft";
      },
      failingInput,
      () => "fallback",
      budget,
    );
    expect(generations).toBe(1);
    expect(result).toMatchObject({ usedFallback: true, replyText: "fallback", attempts: 1 });
  });

  it("semantic repairs share one cap across the verifier loop and every other repair site", async () => {
    const budget = createTurnBudget();
    // Two repairs already spent elsewhere in the turn (integrity + one obligation): the verifier gets what is left.
    expect(budget.tryStart("semantic")).toBe(true);
    expect(budget.tryStart("semantic")).toBe(true);
    let generations = 0;
    await runVerifiedGeneration(async () => { generations += 1; return "draft"; }, failingInput, () => "fallback", budget);
    expect(generations).toBe(2);
    expect(budget.counts.semantic).toBe(MAX_SEMANTIC_REPAIRS);
  });
});

describe("7 PARTIAL — some sources succeed, others fail", () => {
  const resolution = buildIntelligenceBrief({ message: "what does the research say about tudca for liver health", coach: "DANTE", canRetrieve: true }).knowledge;

  it("returned evidence + a failed source settles PARTIAL with the failed dependency kept, not SUCCESS", () => {
    const partial = settleKnowledgeState(resolution, true, "FAILED", ["HUMAN_RELEVANT"]);
    const full = settleKnowledgeState(resolution, true, undefined, ["HUMAN_RELEVANT"]);
    if (resolution.state === "RETRIEVAL_REQUIRED") {
      expect(partial.retrievalStatus).toBe("PARTIAL");
      expect(partial.retrievalReasons).toContain("retrieval_partial");
      expect(full.retrievalStatus).toBe("SUCCESS");
      // Only the dependent status changed: the evidence-derived fields are identical.
      expect({ ...partial, retrievalStatus: null, retrievalReasons: null }).toEqual({ ...full, retrievalStatus: null, retrievalReasons: null });
    } else {
      expect.fail(`fixture is not a retrieval turn: ${resolution.state}`);
    }
  });

  it("nothing returned + a failed source is FAILED, never a negative finding", () => {
    const failed = settleKnowledgeState(resolution, false, "FAILED");
    expect(failed.retrievalStatus).toBe("FAILED");
    expect(failed.coverage).toBe("NOT_ASSESSED");
  });

  it("the phase status is derived from per-source terminal states", () => {
    expect(retrievalPhaseStatus({})).toBe("NOT_RUN");
    expect(retrievalPhaseStatus({ pubmed: "SUCCESS", openfda: "SUCCESS" })).toBe("SUCCESS");
    expect(retrievalPhaseStatus({ pubmed: "SUCCESS", europepmc: "TIMED_OUT" })).toBe("PARTIAL");
    expect(retrievalPhaseStatus({ pubmed: "TIMED_OUT", europepmc: "FAILED" })).toBe("TIMED_OUT");
    expect(retrievalPhaseStatus({ pubmed: "CANCELLED" })).toBe("CANCELLED");
  });
});

describe("8 LATE RESULT — nothing lands after the turn is terminal", () => {
  it("a client abort during generation ends the verifier loop instead of producing a fallback nobody receives", async () => {
    const client = new AbortController();
    const budget = createTurnBudget(client);
    let generations = 0;
    const run = runVerifiedGeneration(
      async () => {
        generations += 1;
        client.abort(Object.assign(new Error("aborted"), { name: "ResponseAborted" }));
        throw client.signal.reason;
      },
      passingInput,
      () => "fallback",
      budget,
    );
    await expect(run).rejects.toMatchObject({ name: "ResponseAborted" });
    expect(generations).toBe(1);
  });

  it("an event emitted after the client cancelled the stream is dropped, not thrown", async () => {
    let lateEmit: (() => void) | null = null;
    let release: () => void = () => {};
    const response = createChatStreamResponse(async (emit) => {
      emit({ type: "delta", text: "first" });
      await new Promise<void>((resolve) => { release = resolve; });
      lateEmit = () => emit({ type: "delta", text: "late" });
      lateEmit();
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(lateEmit).not.toBeNull();
    expect(() => lateEmit!()).not.toThrow();
  });

  it("a slower request's post-turn state cannot overwrite a newer committed state (CAS)", async () => {
    const store = createInMemoryCoherenceStore();
    const a = await prepareTurnWithPersistence({ store, key: "u", message: "bench 3x5 at 80kg today?", now: new Date(0).toISOString() });
    const b = await prepareTurnWithPersistence({ store, key: "u", message: "and what about squats?", now: new Date(1000).toISOString() });
    expect(b.persistedVersion).toBeGreaterThan(a.persistedVersion ?? 0);
    const late = await commitPostTurn(a, { state: { ...a.prepared.state, version: (a.persistedVersion ?? 0) + 1 }, postTurnFailed: false });
    expect(late).toBe("conflict");
    expect(store.rows.get("u")?.version).toBe(b.persistedVersion);
  });
});

describe("9/10 SELECTIVE INVALIDATION — only dependent decisions move (counterfactual pairs)", () => {
  const tiers = (message: string, prior: string[] = []) =>
    Object.fromEntries(buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: prior, canRetrieve: true }).options.map((o) => [o.recordId, o.tier]));
  const ASK = "should I take whey and omega 3";

  it("protein old vs corrected: whey re-evaluates, omega-3 and creatine do not", () => {
    const low = tiers(ASK, ["I struggle to hit my protein"]);
    const corrected = tiers(ASK, ["I struggle to hit my protein", "actually I hit my protein target every day now"]);
    expect(low["supplement-whey"]).not.toBe(corrected["supplement-whey"]);
    expect(corrected["supplement-whey"]).toBe("LOW_VALUE");
    expect(corrected["supplement-omega3"]).toBe(low["supplement-omega3"]);
  });

  it("fish intake low vs corrected high: omega-3 re-evaluates, whey does not", () => {
    const low = tiers(ASK, ["I rarely eat fish"]);
    const high = tiers(ASK, ["I rarely eat fish", "correction: I eat salmon three times a week"]);
    expect(low["supplement-omega3"]).not.toBe(high["supplement-omega3"]);
    expect(high["supplement-omega3"]).toBe("LOW_VALUE");
    expect(high["supplement-whey"]).toBe(low["supplement-whey"]);
  });

  it("EN vs VI: language changes presentation, never the ranking", () => {
    const en = buildIntelligenceBrief({ message: "rank creatine, whey and omega 3 for me", coach: "DANTE", canRetrieve: true });
    const vi = buildIntelligenceBrief({ message: "rank creatine, whey and omega 3 for me, answer in Vietnamese", coach: "DANTE", canRetrieve: true });
    expect(vi.control.responseLanguage).not.toBe(en.control.responseLanguage);
    expect(vi.options).toEqual(en.options);
    expect(vi.recommendation).toEqual(en.recommendation);
  });

  it("evidence source present vs invalidated: the dependent claim status re-evaluates, the identity does not", () => {
    const resolution = buildIntelligenceBrief({ message: "what does the research say about tudca for liver health", coach: "DANTE", canRetrieve: true }).knowledge;
    const present = settleKnowledgeState(resolution, true, undefined, ["HUMAN_RELEVANT"]);
    const invalidated = settleKnowledgeState(resolution, false, "IRRELEVANT");
    expect(invalidated.coverage).not.toBe(present.coverage);
    expect(invalidated.entityStatus).toBe(present.entityStatus);
    expect(invalidated.records.map((r) => r.id)).toEqual(present.records.map((r) => r.id));
  });
});

describe("11 CONCURRENCY — no runaway fan-out", () => {
  it("each concurrent turn owns its budget; a stuck verifier can never exceed the per-turn caps", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("DANTE_OPENAI_MODEL", "model-a");
    vi.stubEnv("DANTE_OPENAI_FALLBACK_MODEL", "model-b");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const turn = async () => {
      const budget = createTurnBudget();
      await runVerifiedGeneration(
        async () => {
          let text = "";
          for await (const event of streamDanteReply("hi", budget.signal, budget)) if (event.kind === "delta") text += event.text;
          return text;
        },
        failingInput,
        () => "fallback",
        budget,
      );
      return budget.counts;
    };
    const results = await Promise.all([turn(), turn(), turn()]);
    for (const counts of results) {
      expect(counts.provider).toBeLessThanOrEqual(MAX_PROVIDER_ATTEMPTS);
      expect(counts.semantic).toBeLessThanOrEqual(MAX_SEMANTIC_REPAIRS);
    }
    // Before WP1: 2 models x 3 verifier attempts = 6 HTTP calls per turn. Now the provider cap holds per turn.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3 * MAX_PROVIDER_ATTEMPTS);
  });
});

describe("12 MUTATION TIMEOUT — the effect stays UNKNOWN unless the server confirms it", () => {
  it("maps confirm/cancel replies without inferring timeout = failed", () => {
    expect(resolveConfirmationOutcome("confirm", null)).toBe("unknown");
    expect(resolveConfirmationOutcome("confirm", { status: 504 })).toBe("unknown");
    expect(resolveConfirmationOutcome("confirm", { status: 500, ok: false })).toBe("unknown");
    expect(resolveConfirmationOutcome("confirm", { status: 200, ok: true })).toBe("confirmed");
    expect(resolveConfirmationOutcome("confirm", { status: 422, ok: false })).toBe("failed");
    expect(resolveConfirmationOutcome("cancel", { status: 200, ok: true })).toBe("cancelled");
    // A refused cancel means the action was already handled: never "cancelled — nothing changed".
    expect(resolveConfirmationOutcome("cancel", { status: 404, ok: false })).toBe("unknown");
  });
});
