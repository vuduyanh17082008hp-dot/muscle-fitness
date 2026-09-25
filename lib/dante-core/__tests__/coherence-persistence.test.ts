/**
 * Dante Phase 2 / Task 1 — durable VersionedState across SEPARATE requests + reducer as single writer.
 *
 * Every "request" below does exactly what the chatbot route does and nothing more: it starts from the store
 * (never from an in-memory state object handed over by the test), prepares the turn, persists v_n+1, finishes
 * the draft, and persists the post-turn state. State is only ever read back out of the store.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  activeBoundaries,
  activeCorrections,
  applyDelta,
  createInitialState,
  finishCoherenceDraft,
  validateDelta,
  type StateDelta,
  type VersionedState,
} from "@/lib/dante-core/coherence";
import { commitDelta, restoreVersionedState } from "@/lib/dante-core/coherence/reducer";
import {
  commitPostTurn,
  createInMemoryCoherenceStore,
  encodeState,
  prepareTurnWithPersistence,
  type CoherenceStateStore,
} from "@/lib/dante-core/coherence/persistence";
import { createSupabaseCoherenceStore } from "@/lib/dante-core/coherence/supabase-store";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

const KEY = "user-1";
const T0 = Date.parse("2026-09-19T12:00:00.000Z");
const LATERALITY = "yesterday_shoulder_laterality";

let clock = 0;
function tick(minutes = 1): string {
  clock += minutes;
  return new Date(T0 + clock * 60_000).toISOString();
}

async function request(
  store: CoherenceStateStore,
  message: string,
  opts: { draft?: string; now?: string; history?: Parameters<typeof prepareTurnWithPersistence>[0]["history"] } = {},
) {
  const session = await prepareTurnWithPersistence({
    store,
    key: KEY,
    message,
    now: opts.now ?? tick(),
    history: opts.history,
  });
  const finished = finishCoherenceDraft({
    prepared: session.prepared,
    message,
    phase1Draft: opts.draft ?? "Noted.",
  });
  const post = await commitPostTurn(session, finished);
  return { session, finished, post };
}

async function durable(store: CoherenceStateStore): Promise<VersionedState> {
  const loaded = await store.load(KEY);
  if (loaded.status !== "found") throw new Error(`expected durable state, got ${loaded.status}`);
  return loaded.state;
}

describe("0. control — without durable state the original divergence reproduces", () => {
  /** Behaves like the pre-fix route: nothing is ever loaded back between requests. */
  const amnesiac: CoherenceStateStore = {
    load: async () => ({ status: "empty" }),
    commit: async () => ({ ok: true }),
  };

  it("safety phase resets to a fresh ENTER/NONE every request", async () => {
    await request(amnesiac, "I've had chest pain since my last set of bench press.");
    const follow = await request(amnesiac, "still there, not improved");
    expect(follow.finished.audit.safetyPhase).toBe("NONE");
  });

  it("corrections, preferences and signatures are all lost", async () => {
    await request(amnesiac, "Hôm qua vai phải tôi hơi đau.");
    const fix = await request(amnesiac, "À sửa lại, là vai trái chứ không phải vai phải.");
    expect(fix.session.prepared.analysis.corrections).toEqual([]);
    await request(amnesiac, "Nói ngắn thôi.");
    const later = await request(amnesiac, "Tuần này bench thế nào?");
    expect(later.session.prepared.snapshot.verbosity.value).toBe("default");
    expect(later.session.prepared.snapshot.lastResponseSignature).toBeNull();
  });
});

describe("A. correction persists across separate requests", () => {
  it("resolves laterality as LEFT in a brand-new request", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "Hôm qua vai phải tôi hơi đau.");
    const fix = await request(store, "À sửa lại, là vai trái chứ không phải vai phải.");
    expect(fix.session.prepared.analysis.corrections).toEqual([{ topic: LATERALITY, statement: "LEFT" }]);

    const third = await request(store, "Hôm qua tôi đau vai nào nhỉ?", { draft: "Bạn hỏi về vai hôm qua." });
    expect(third.session.source).toBe("durable");
    const active = activeCorrections(third.session.prepared.snapshot).filter((c) => c.value.topic === LATERALITY);
    expect(active).toHaveLength(1);
    expect(active[0]?.value.statement).toBe("LEFT");
    // The earlier RIGHT was superseded by the versioned slot mechanism, not deleted or overwritten in place.
    const all = (await durable(store)).corrections.filter((c) => c.value.topic === LATERALITY);
    expect(all.map((c) => [c.value.statement, c.status])).toEqual([
      ["RIGHT", "SUPERSEDED"],
      ["LEFT", "ACTIVE"],
    ]);
    expect(third.finished.response).toMatch(/trái|left/i);
  });

  it("does not guess a side when there is no durable referent for an anchorless correction", async () => {
    const store = createInMemoryCoherenceStore();
    const only = await request(store, "À sửa lại, là vai trái chứ không phải vai phải.");
    expect(only.session.prepared.analysis.corrections).toEqual([]);
    expect(activeCorrections(await durable(store))).toEqual([]);
  });
});

describe("B. safety lifecycle survives separate requests", () => {
  it("ENTER → PERSIST → ESCALATE → DOWNGRADE → EXIT → NONE, each from durable state", async () => {
    const store = createInMemoryCoherenceStore();
    const phases: string[] = [];
    const steps: Array<[string, string]> = [
      ["I've had chest pain since my last set of bench press.", "ENTER"],
      ["still there, not improved", "PERSIST"],
      ["it's getting worse, the pain is spreading to my arm", "ESCALATE"],
      ["Currently no chest pain, no dizziness, no numbness. I'm fine. Can I squat?", "DOWNGRADE"],
      // Silence about the symptom is not resolution: the lifecycle holds until the user reports it.
      ["Thanks. Squat plan for tomorrow?", "DOWNGRADE"],
      ["Still no chest pain and no dizziness today. Squat plan for tomorrow?", "EXIT"],
      ["What about bench volume this week?", "NONE"],
    ];
    for (const [index, [message, expected]] of steps.entries()) {
      const r = await request(store, message);
      phases.push(r.finished.audit.safetyPhase);
      expect(r.session.source).toBe(index === 0 ? "new" : "durable");
      expect(r.session.turnPersistence).toBe("committed");
      expect(r.finished.audit.safetyPhase).toBe(expected);
      // What a *later* request will load is exactly this phase — read straight back from the store.
      expect((await durable(store)).safety.phase).toBe(expected);
    }
    expect(phases).toEqual(["ENTER", "PERSIST", "ESCALATE", "DOWNGRADE", "DOWNGRADE", "EXIT", "NONE"]);
  });

  it("keeps the follow-up on the safety path and records lifecycle metadata", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "I've had chest pain since my last set of bench press.");
    const follow = await request(store, "still there, not improved");
    expect(follow.session.prepared.entryClass).toBe("SAFETY_PRIORITY");
    expect(follow.finished.strategies).toContain("SAFETY_HANDLE");
    const state = await durable(store);
    expect(state.safety.category).toBe("chest_pain_cardiac");
    expect(state.safety.consecutiveSafetyTurns).toBe(2);
    expect(state.safety.lastEmittedTurn).not.toBeNull();
  });

  it("re-enters safety when symptoms come back during DOWNGRADE", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "I've had chest pain since my last set of bench press.");
    await request(store, "Currently no chest pain, no dizziness, no numbness. I'm fine.");
    expect((await durable(store)).safety.phase).toBe("DOWNGRADE");
    const back = await request(store, "it's getting worse again");
    expect(back.finished.audit.safetyPhase).toBe("ENTER");
  });

  it("a follow-up cue never creates safety from NONE, and history alone never hydrates it", async () => {
    const store = createInMemoryCoherenceStore();
    const cue = await request(store, "still there, not improved");
    expect(cue.finished.audit.safetyPhase).toBe("NONE");
    expect(cue.session.prepared.entryClass).not.toBe("SAFETY_PRIORITY");

    const fresh = createInMemoryCoherenceStore();
    const recentHistory = [
      { role: "user" as const, text: "I've had chest pain since my last set of bench press.", at: tick(-5) },
      { role: "assistant" as const, text: "Stop and get evaluated.", at: tick(0) },
    ];
    const fromHistory = await request(fresh, "Can I squat today?", { history: recentHistory });
    expect(fromHistory.session.source).toBe("history");
    expect(fromHistory.finished.audit.safetyPhase).toBe("NONE");
    expect((await durable(fresh)).safety.phase).toBe("NONE");
  });

  it("a historical-only symptom does not become current danger", async () => {
    const store = createInMemoryCoherenceStore();
    const r = await request(
      store,
      "last week my hand was numb, currently no numbness, no chest pain, no dizziness. Can I deadlift?",
      { draft: "Current state is clear. Deadlift submax is fine." },
    );
    expect(r.session.prepared.analysis.safetyCandidates.current).toBe(false);
    expect(["NONE", "EXIT"]).toContain(r.finished.audit.safetyPhase);
  });

  it("resuming after a long gap keeps an unresolved safety episode (time is not evidence) and dormants loops", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "I've had chest pain since my last set of bench press.");
    await request(store, "still there, not improved");
    expect((await durable(store)).safety.phase).toBe("PERSIST");

    const later = await request(store, "Can I squat today?", { now: tick(60 * 48) });
    expect(later.session.prepared.snapshot.lifecycle).toBe("RESUME_AFTER_GAP");
    expect(later.finished.lifecycle).toBe("RESUME_AFTER_GAP");
    // 48h passed but nothing said the symptom resolved: the phase is exactly where it was.
    expect(later.finished.audit.safetyPhase).toBe("PERSIST");
    expect(later.session.prepared.snapshot.safety.phase).toBe("PERSIST");
    expect(later.session.prepared.snapshot.appliedDeltaIds.some((id) => id.length > 0)).toBe(true);
  });
});

describe("C. preference persists", () => {
  it("keeps 'nói ngắn thôi' as a verbosity preference in a later request", async () => {
    const store = createInMemoryCoherenceStore();
    const first = await request(store, "Nói ngắn thôi.");
    expect(first.session.prepared.state.verbosity.value).toBe("brief");
    // Phase 2.5a: a bare "nói ngắn thôi" carries no durable marker, so it is an INFERRED/SESSION observation (it still
    // applies immediately and persists across requests; only "từ giờ ..." is EXPLICIT/DURABLE).
    expect(first.session.prepared.state.verbosity.provenance).toBe("CURRENT_TURN_INFERRED");
    expect(first.session.prepared.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "INFERRED", scope: "SESSION" });

    const later = await request(store, "Tuần này bench thế nào?");
    expect(later.session.source).toBe("durable");
    expect(later.session.prepared.snapshot.verbosity.value).toBe("brief");
    expect((await durable(store)).verbosity.value).toBe("brief");
  });

  it("lets a later explicit request change it, versioned", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "keep it short please");
    // Phase 2.5a: an explicit durable request moves the value directly (an implicit one is bounded to one level per
    // turn, P-7 - covered in phase2-persona-expression.test.ts).
    await request(store, "from now on, explain in more detail");
    expect((await durable(store)).verbosity.value).toBe("detailed");
  });

  it("keeps boundaries across requests", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "Don't lecture me.");
    const later = await request(store, "so what's the squat plan?", { draft: "Add 2.5kg if clean." });
    expect(activeBoundaries(later.session.prepared.snapshot).some((b) => b.value.kind === "no_lecturing")).toBe(true);
    expect(later.finished.strategies).toContain("BOUNDARY_RESPECT");
  });
});

describe("D. language and address do not reset between requests", () => {
  it("holds Vietnamese + 'ông' through short and English follow-ups", async () => {
    const store = createInMemoryCoherenceStore();
    const first = await request(store, "Chào ông, hôm nay tôi nên tập ngực hay lưng?");
    expect(first.finished.language).toBe("vi");
    expect(first.finished.address).toBe("ong");

    const second = await request(store, "ok, bench 80kg 5x5 nhé.");
    expect(second.session.source).toBe("durable");
    expect(second.session.prepared.snapshot.language.value).toBe("vi");
    expect(second.session.prepared.snapshot.address.value).toBe("ong");

    const third = await request(store, "sure, sounds good to me");
    expect(third.finished.language).toBe("vi");
    expect(third.finished.address).toBe("ong");
  });

  it("persists an explicit language switch", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "Chào ông, hôm nay tôi nên tập gì?");
    await request(store, "answer in English please");
    const later = await request(store, "cảm ơn nhé");
    expect(later.session.prepared.snapshot.language.value).toBe("en");
    expect(later.finished.language).toBe("en");
  });
});

describe("E. repetition signatures and open loops persist", () => {
  it("makes request N's response/advice signatures visible to request N+1 and uses them", async () => {
    const store = createInMemoryCoherenceStore();
    const question = "How should I progress bench this block?";
    const draft = "Add 2.5kg only if last week was clean at RPE 7.";
    const first = await request(store, question, { draft });
    expect(first.post).toBe("committed");

    const stored = await durable(store);
    expect(stored.lastResponseSignature).toBe(first.finished.state.lastResponseSignature);
    expect(stored.lastAdviceSignature).toBe(first.finished.state.lastAdviceSignature);
    expect(stored.lastUserQuestionSignature).not.toBeNull();
    expect(stored.responseSignatures.length).toBeGreaterThan(0);

    const second = await request(store, question, { draft });
    expect(second.session.source).toBe("durable");
    expect(second.session.prepared.snapshot.lastResponseSignature).toBe(stored.lastResponseSignature);
    expect(second.session.prepared.snapshot.lastAdviceSignature).toBe(stored.lastAdviceSignature);
    // Same question + same advice as last request → the repetition governor acts on the persisted signatures.
    expect(second.finished.audit.adviceAction).toBe("rephrase");
  });

  it("keeps open loops and their aging across requests", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "How should I progress bench this block?", { draft: "Small jumps." });
    const second = await request(store, "huh? what do you mean", { draft: "If clean, add a small jump." });
    expect(second.session.prepared.snapshot.openLoops.some((l) => l.status === "ACTIVE" && l.topic !== "clarification")).toBe(true);
    expect(second.finished.response).toMatch(/open thread|quay lại đúng mạch/i);

    for (let i = 0; i < 6; i += 1) await request(store, "ok", { draft: "Got it." });
    const aged = (await durable(store)).openLoops.filter((l) => l.topic !== "clarification");
    expect(aged.some((l) => l.status === "AGING" || l.status === "DORMANT")).toBe(true);
  });

  it("persists commitments already in state and bounds the stored row", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "hello there, planning the week");
    let state = await durable(store);
    for (let i = 0; i < 40; i += 1) {
      state = applyDelta(state, {
        deltaId: `cmt-${i}`,
        class: "turn_delta",
        turnRef: `c${i}`,
        sourceVersion: state.version,
        ops: [{ op: "add_commitment", kind: "micro", text: `step ${i}`, provenance: "test" }],
      });
    }
    expect(state.commitments.length).toBeLessThanOrEqual(32);
    const outcome = await store.commit(KEY, state, (await durable(store)).version);
    expect(outcome).toEqual({ ok: true });
    expect((await durable(store)).commitments.at(-1)?.value.text).toBe("step 39");
  });
});

describe("E2. stored state stays bounded and restorable over a long-lived session", () => {
  it("prunes spent open loops so the persisted row can never outgrow its own validation", () => {
    let state = createInitialState({ now: "2026-09-19T12:00:00.000Z", sessionId: "soak" });
    for (let i = 0; i < 200; i += 1) {
      state = applyDelta(state, {
        deltaId: `loop-${i}`,
        class: "turn_delta",
        turnRef: `t${i}`,
        sourceVersion: state.version,
        ops: [
          { op: "open_loop", topic: `topic-${i}` },
          { op: "resolve_loop", topic: `topic-${i}` },
        ],
      });
    }
    expect(state.openLoops.length).toBeLessThanOrEqual(32);
    expect(state.appliedDeltaIds.length).toBeLessThanOrEqual(64);
    expect(restoreVersionedState(encodeState(state))).not.toBeNull();
  });

  it("never drops a live loop while trimming", () => {
    let state = createInitialState({ now: "2026-09-19T12:00:00.000Z", sessionId: "soak" });
    state = applyDelta(state, {
      deltaId: "keep",
      class: "turn_delta",
      turnRef: "t0",
      sourceVersion: 0,
      ops: [{ op: "open_loop", topic: "must-survive", ttlTurns: 10_000 }],
    });
    for (let i = 0; i < 100; i += 1) {
      state = applyDelta(state, {
        deltaId: `noise-${i}`,
        class: "turn_delta",
        turnRef: `n${i}`,
        sourceVersion: state.version,
        ops: [{ op: "open_loop", topic: `noise-${i}` }, { op: "resolve_loop", topic: `noise-${i}` }],
      });
    }
    expect(state.openLoops.some((l) => l.topic === "must-survive" && l.status !== "RESOLVED")).toBe(true);
  });

  it("120 real requests later the durable row is still valid and never fell back to a fresh state", async () => {
    const store = createInMemoryCoherenceStore();
    const messages = [
      "How should I progress bench this block?",
      "huh? what do you mean",
      "Don't lecture me.",
      "Nói ngắn thôi.",
      "ok",
    ];
    for (let i = 0; i < 120; i += 1) {
      const r = await request(store, messages[i % messages.length] ?? "ok", { draft: `Reply ${i % 7}.` });
      expect(r.session.turnPersistence).toBe("committed");
    }
    const state = await durable(store);
    expect(state.turnCount).toBe(120);
    expect(state.openLoops.length).toBeLessThanOrEqual(32);
    expect(activeBoundaries(state).some((b) => b.value.kind === "no_lecturing")).toBe(true);
    expect(state.verbosity.value).toBe("brief");
  });
});

describe("F. reducer is the only writer", () => {
  const base = () => createInitialState({ now: "2026-09-19T12:00:00.000Z", sessionId: "r" });
  const delta = (over: Partial<StateDelta> = {}): StateDelta => ({
    deltaId: "d-1",
    class: "turn_delta",
    turnRef: "t1",
    sourceVersion: 0,
    at: "2026-09-19T12:00:00.000Z",
    ops: [
      { op: "upsert_correction", topic: LATERALITY, statement: "LEFT", provenance: "CURRENT_TURN_EXPLICIT" },
      { op: "set_safety_phase", phase: "ENTER", category: "chest_pain_cardiac" },
    ],
    ...over,
  });

  it("same state + same delta → equivalent output (deterministic)", () => {
    expect(applyDelta(base(), delta())).toEqual(applyDelta(base(), delta()));
  });

  it("same deltaId twice → no duplicate effect", () => {
    const once = applyDelta(base(), delta());
    const twice = applyDelta(once, delta());
    expect(twice).toEqual(once);
    expect(twice.version).toBe(1);
    expect(twice.corrections).toHaveLength(1);
    expect(twice.turnCount).toBe(1);
    expect(commitDelta(once, delta()).status).toBe("duplicate");
  });

  it("stale sourceVersion → rejected, state untouched", () => {
    const once = applyDelta(base(), delta());
    const stale = delta({ deltaId: "d-2", sourceVersion: 0 });
    expect(validateDelta(once, stale)).toEqual({ ok: false, reason: "version_mismatch" });
    const result = commitDelta(once, stale);
    expect(result.status).toBe("rejected");
    expect(result.state).toBe(once);
    expect(() => applyDelta(once, stale)).toThrow(/version_mismatch/);
  });

  it("enforces which delta class may carry which op", () => {
    const s = base();
    const post = commitDelta(s, delta({ class: "post_turn_delta", deltaId: "p", ops: [{ op: "set_safety_phase", phase: "ENTER", category: null }] }));
    expect(post.status === "rejected" && post.reason).toMatch(/class_op_violation:post_turn_delta:set_safety_phase/);
    const session = commitDelta(s, delta({ class: "session_delta", deltaId: "s", ops: [{ op: "upsert_correction", topic: "x", statement: "y", provenance: "p" }] }));
    expect(session.status === "rejected" && session.reason).toMatch(/class_op_violation:session_delta/);
    const turn = commitDelta(s, delta({ deltaId: "t", ops: [{ op: "resume_after_gap" }] }));
    expect(turn.status === "rejected" && turn.reason).toMatch(/class_op_violation:turn_delta:resume_after_gap/);
    const okPost = commitDelta(s, delta({ class: "post_turn_delta", deltaId: "p2", ops: [{ op: "record_response", signature: "sig" }] }));
    expect(okPost.status).toBe("applied");
  });

  it("returned state is frozen — a stage cannot write it in place", () => {
    const state = applyDelta(base(), delta());
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.safety)).toBe(true);
    expect(Object.isFrozen(state.corrections)).toBe(true);
    expect(() => {
      (state as unknown as { lifecycle: string }).lifecycle = "NEW";
    }).toThrow(TypeError);
    expect(() => {
      (state.corrections as unknown as unknown[]).push({});
    }).toThrow(TypeError);
    expect(() => {
      (state.safety as unknown as { phase: string }).phase = "NONE";
    }).toThrow(TypeError);
  });

  it("every state a turn hands out is frozen (snapshot, turn state, post-turn state)", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "Chào ông, hôm nay tôi nên tập gì?");
    const r = await request(store, "How should I progress bench?", { draft: "Small jumps." });
    expect(Object.isFrozen(r.session.prepared.snapshot)).toBe(true);
    expect(Object.isFrozen(r.session.prepared.state)).toBe(true);
    expect(Object.isFrozen(r.finished.state)).toBe(true);
    expect(Object.isFrozen((await durable(store)).openLoops)).toBe(true);
  });

  it("session init/resume mutate nothing in place — they are session_delta commits", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "I've had chest pain since my last set of bench press.");
    const before = await durable(store);
    const snapshotIn = JSON.stringify(before);
    const resumed = await request(store, "Can I squat?", { now: tick(60 * 48) });
    expect(JSON.stringify(before)).toBe(snapshotIn);
    expect(resumed.session.prepared.snapshot.version).toBe(before.version + 1);
    // An unresolved episode is not reset by time; the resume itself is still a reducer-owned session_delta.
    expect(resumed.session.prepared.snapshot.safety.phase).toBe("ENTER");
  });

  it("no Phase 2 module other than reducer.ts assigns into state or builds a VersionedState literal", () => {
    const dir = path.resolve(__dirname, "../coherence");
    const offenders: string[] = [];
    const assign =
      /\b(?:state|snapshot|frozen|initial|next|prior|base)\s*\.\s*(?:version|turnCount|lastTurnRef|lastActivityAt|lifecycle|language|address|verbosity|corrections|boundaries|commitments|openLoops|topicStack|safety|adviceSignatures|responseSignatures|lastAdviceSignature|lastResponseSignature|lastUserQuestionSignature|lastAnswerUnclear|safetyWarningSignature|safetyWarningCount|appliedDeltaIds)\b(?:\s*\.\s*\w+)?\s*(?:=(?!=)|\+=|-=)/;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "reducer.ts")) {
      const source = readFileSync(path.join(dir, file), "utf8");
      source.split("\n").forEach((line, index) => {
        if (assign.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        if (/\bappliedDeltaIds\s*:/.test(line) && file !== "types.ts") offenders.push(`${file}:${index + 1}: state literal`);
        if (/\bstructuredClone\(/.test(line)) offenders.push(`${file}:${index + 1}: clone-and-mutate`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("G. persistence: versioning, stale writers, fail-open", () => {
  it("a stale writer cannot overwrite a newer state (CAS)", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "hello there");
    const v = await store.load(KEY);
    if (v.status !== "found") throw new Error("expected state");
    const newer = applyDelta(v.state, {
      deltaId: "n1",
      class: "turn_delta",
      turnRef: "tn",
      sourceVersion: v.state.version,
      ops: [{ op: "set_verbosity", value: "brief", provenance: "t" }],
    });
    expect(await store.commit(KEY, newer, v.rowVersion)).toEqual({ ok: true });

    const stale = applyDelta(v.state, {
      deltaId: "n2",
      class: "turn_delta",
      turnRef: "tn",
      sourceVersion: v.state.version,
      ops: [{ op: "set_verbosity", value: "detailed", provenance: "t" }],
    });
    expect(await store.commit(KEY, stale, v.rowVersion)).toEqual({ ok: false, reason: "conflict" });
    expect((await durable(store)).verbosity.value).toBe("brief");
  });

  it("two concurrent requests from the same v_n never lose an update", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "hello there");
    const [a, b] = await Promise.all([
      prepareTurnWithPersistence({ store, key: KEY, message: "Nói ngắn thôi.", now: tick() }),
      prepareTurnWithPersistence({ store, key: KEY, message: "Don't lecture me.", now: tick() }),
    ]);
    expect(a.turnPersistence).toBe("committed");
    expect(b.turnPersistence).toBe("committed");
    const state = await durable(store);
    // Both turns are present in durable state: the loser reloaded the winner's state and re-derived on top of it.
    expect(state.turnCount).toBe(3);
    expect(state.verbosity.value).toBe("brief");
    expect(activeBoundaries(state).some((x) => x.value.kind === "no_lecturing")).toBe(true);
  });

  it("refuses to persist a rewound (non-monotonic) state", async () => {
    const store = createInMemoryCoherenceStore();
    const first = await prepareTurnWithPersistence({ store, key: KEY, message: "hello there", now: tick() });
    const session = { ...first, persistedVersion: first.prepared.state.version };
    const outcome = await commitPostTurn(session, { state: createInitialState({ now: tick() }), postTurnFailed: false });
    expect(outcome).toBe("skipped");
    expect((await durable(store)).version).toBe(first.prepared.state.version);
  });

  it("is fail-open when the store is down: the turn still runs from chat history", async () => {
    const down: CoherenceStateStore = {
      load: async () => {
        throw new Error("store down");
      },
      commit: async () => {
        throw new Error("store down");
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await request(down, "Chào ông, hôm nay tôi nên tập gì?", {
      history: [{ role: "user", text: "Chào ông, hôm qua tôi tập ngực rất nặng.", at: tick() }],
    });
    warn.mockRestore();
    expect(r.session.turnPersistence).toBe("unavailable");
    expect(r.session.persistedVersion).toBeNull();
    expect(r.post).toBe("skipped");
    expect(r.finished.response.length).toBeGreaterThan(0);
    expect(r.finished.language).toBe("vi");
  });

  it("does not throw when a commit errors", async () => {
    const good = createInMemoryCoherenceStore();
    const flaky: CoherenceStateStore = {
      load: good.load,
      commit: async () => {
        throw new Error("write failed");
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await request(flaky, "hello there");
    warn.mockRestore();
    expect(r.session.turnPersistence).toBe("error");
    expect(r.finished.response.length).toBeGreaterThan(0);
  });

  it("replaces an unusable stored row instead of staying stateless forever", async () => {
    const store = createInMemoryCoherenceStore();
    store.rows.set(KEY, { version: 9, json: JSON.stringify({ not: "a state" }) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await request(store, "Nói ngắn thôi.");
    warn.mockRestore();
    expect(r.session.turnPersistence).toBe("committed");
    expect((await durable(store)).verbosity.value).toBe("brief");
  });

  it("restores rows written before newer fields existed, with defaults", () => {
    const legacy = JSON.parse(JSON.stringify(encodeState(createInitialState({ now: "2026-09-19T12:00:00.000Z" })))) as Record<string, unknown>;
    delete legacy.verbosity;
    const restored = restoreVersionedState(legacy);
    expect(restored?.verbosity.value).toBe("default");
    expect(restoreVersionedState({ ...legacy, safety: { phase: "BOGUS" } })).toBeNull();
    expect(restoreVersionedState(null)).toBeNull();
  });

  it("stores structured state only — no raw user text", async () => {
    const store = createInMemoryCoherenceStore();
    await request(store, "Hôm qua vai phải tôi hơi đau. CANARY-RAW-TEXT-9271", { draft: "Noted the shoulder." });
    const row = store.rows.get(KEY);
    expect(row?.json).not.toMatch(/CANARY-RAW-TEXT-9271/);
    expect(row?.json).not.toMatch(/tôi hơi đau/);
  });
});

describe("H. Supabase store maps CAS onto the table correctly", () => {
  function client() {
    const table = createFakeCoherenceTable();
    const supabase = { from: fakeCoherenceFrom(table, { timezone: null }) } as never;
    return { table, store: createSupabaseCoherenceStore(supabase) };
  }

  it("round-trips state and refuses stale/duplicate writes", async () => {
    const { table, store } = client();
    const first = await request(store, "Nói ngắn thôi.");
    expect(first.session.turnPersistence).toBe("committed");
    expect(table.rows.get(KEY)?.schema_version).toBe(1);

    const second = await request(store, "Tuần này bench thế nào?");
    expect(second.session.source).toBe("durable");
    expect(second.session.prepared.snapshot.verbosity.value).toBe("brief");

    const loaded = await store.load(KEY);
    if (loaded.status !== "found") throw new Error("expected state");
    // duplicate create
    expect(await store.commit(KEY, loaded.state, null)).toEqual({ ok: false, reason: "conflict" });
    // stale expected version
    expect(await store.commit(KEY, loaded.state, loaded.rowVersion - 1)).toEqual({ ok: false, reason: "conflict" });
    expect(table.writes.filter((w) => !w.applied).length).toBe(2);
    expect(table.rows.get(KEY)?.state_version).toBe(loaded.rowVersion);
  });

  it("will not read or overwrite a row written by a newer schema", async () => {
    const { table, store } = client();
    await request(store, "hello there");
    const row = table.rows.get(KEY);
    if (!row) throw new Error("row missing");
    table.rows.set(KEY, { ...row, schema_version: 99 });
    expect((await store.load(KEY)).status).toBe("error");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await request(store, "hello again");
    warn.mockRestore();
    expect(r.session.turnPersistence).toBe("unavailable");
    expect(table.rows.get(KEY)?.schema_version).toBe(99);
  });
});
