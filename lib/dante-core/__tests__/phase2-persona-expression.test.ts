/**
 * Dante Phase 2.5a / Task 5 — minimal adaptive persona + continual personalization.
 *
 * Library-level proof (state + semantic behaviour; prose is asserted only where a token or a gate is
 * deterministic). Route/provider/persistence-through-HTTP proof lives in phase2-persona-route.test.ts.
 *
 * Test ids A..AE follow the Task 5 spec.
 */
import { describe, expect, it, vi } from "vitest";
import { decisionBlocks } from "./support/authority-blocks";
import {
  activeCorrections,
  applyDelta,
  createInitialState,
  enforcePersonaGate,
  evaluatePersonaGate,
  finishCoherenceDraft,
  interpretExpressionFeedback,
  prepareCoherenceTurn,
  renderNeutralFallback,
  resolveExpressionPlan,
  runCoherenceTurn,
  type CoreConflictClassifier,
  type ExpressionPlan,
  type StateDelta,
  type VersionedState,
} from "@/lib/dante-core/coherence";
import { applyFamiliarity, baselinePlan, FAMILIARITY_RENDER_MAP, ADDRESS_RENDER_MAP, neutralPlan } from "@/lib/dante-core/coherence/expression";
import { restoreVersionedState, commitDelta } from "@/lib/dante-core/coherence/reducer";
import { classifyCoreConflict, decideCoreConflict, coreConflictGuard } from "@/lib/dante-core/coherence/core-conflict";
import {
  commitPostTurn,
  encodeState,
  prepareTurnWithPersistence,
  type CoherenceStateStore,
} from "@/lib/dante-core/coherence/persistence";
import { createSupabaseCoherenceStore } from "@/lib/dante-core/coherence/supabase-store";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";
import { LATERALITY_TOPIC } from "@/lib/dante-core/coherence/corrections";

const T0 = Date.parse("2026-09-19T12:00:00.000Z");
const iso = (minutes: number): string => new Date(T0 + minutes * 60_000).toISOString();

/** JS `\b` is ASCII-only, so it cannot bound Vietnamese words such as "ông". */
const hasWord = (text: string, word: string) =>
  new RegExp(`(?:^|[^\\p{L}])${word}(?:[^\\p{L}]|$)`, "iu").test(text);
const NO_VOCATIVE = ["bro", "dude", "mate", "buddy", "ông", "bạn", "cậu", "mày"];

/** A chain of independent turns; state is handed forward the way persistence hands it forward. */
function chat(options: { authenticated?: boolean } = {}) {
  let state: VersionedState | null = null;
  let minute = 0;
  return {
    say(
      message: string,
      extra: { gapMin?: number; draft?: string; forcePersonaRepairFail?: boolean; forcePersonaFail?: boolean; handled?: Parameters<typeof runCoherenceTurn>[0]["handledObligations"] } = {},
    ) {
      minute += extra.gapMin ?? 1;
      const result = runCoherenceTurn({
        message,
        now: iso(minute),
        prior: state,
        sessionId: "persona",
        authenticated: options.authenticated,
        phase1Draft: extra.draft,
        handledObligations: extra.handled,
        forcePersonaRepairFail: extra.forcePersonaRepairFail,
        forcePersonaFail: extra.forcePersonaFail,
      });
      state = result.state;
      return result;
    },
    get state(): VersionedState {
      if (!state) throw new Error("no turn yet");
      return state;
    },
  };
}

/**
 * A distinct five-paragraph draft per call. The repetition governor fingerprints the first words and ignores digits,
 * so the drafts must differ in WORDS or the (pre-existing) governor shortens the "repeated" advice.
 */
const TOPICS = ["squat", "bench", "deadlift", "row", "press", "curl"];
let draftSeq = 0;
const five = (): string => {
  const topic = TOPICS[draftSeq % TOPICS.length];
  draftSeq += 1;
  return ["mở đầu", "giữa", "tiếp theo", "cuối", "kết"].map((n) => `Đoạn ${n} về ${topic} ${topic} ${n}.`).join("\n\n");
};
const FIVE = five();
/** Blocks = non-empty lines: emitted text keeps single line breaks (pre-existing whitespace flattening, see STATE.md). */
const paragraphs = (text: string) => text.split(/\n+/).filter(Boolean).length;

describe("A. Dante baseline — unknown preference is Dante, not corporate-neutral (P-8)", () => {
  it("a new user resolves to NEUTRAL address / CASUAL / LIGHT humor / DEFAULT verbosity", () => {
    const r = chat().say("Tuần này bench thế nào?");
    expect(r.expressionPlan).toMatchObject({
      addressStyle: "NEUTRAL",
      familiarity: "CASUAL",
      humor: "LIGHT",
      verbosity: "DEFAULT",
      contextMode: "NORMAL",
    });
    expect(r.state.expression.profile).toEqual({});
  });
});

describe("B. explicit address", () => {
  it("'đừng gọi tao là bạn, mày-tao đi' → MAY_TAO, explicit, durable, stable in later turns", () => {
    const c = chat();
    const first = c.say("đừng gọi tao là bạn, mày-tao đi", { draft: "Ok." });
    expect(first.analysis.expression.kind).toBe("EXPRESSION_FEEDBACK");
    expect(first.state.expression.profile.addressStyle).toMatchObject({
      value: "MAY_TAO",
      source: "EXPLICIT",
      scope: "DURABLE",
      status: "ACTIVE",
    });
    for (const message of ["Tuần này bench thế nào?", "ok", "sure, sounds good"]) {
      const r = c.say(message, { draft: "Hôm nay bạn tập ngực nhẹ, ông giữ RPE 7." });
      expect(r.expressionPlan.addressStyle).toBe("MAY_TAO");
      expect(hasWord(r.response, "bạn")).toBe(false);
      expect(hasWord(r.response, "ông")).toBe(false);
    }
  });

  it("never reads the form the user REFUSED ('đừng gọi tao là bạn') as choosing it", () => {
    const r = chat().say("đừng gọi tao là bạn", { draft: "Ok." });
    expect(r.state.expression.profile.addressStyle).toBeUndefined();
  });
});

describe("C. neutral address never invents a vocative", () => {
  it("Vietnamese: bro/ông/mày/bạn as a vocative are removed when no address was chosen", () => {
    const r = chat().say("Tuần này bench thế nào?", { draft: "Bro, hôm nay giữ RPE 7 thôi, ông. Bạn nghỉ 2 phút nhé." });
    for (const w of NO_VOCATIVE) expect(hasWord(r.response, w), w).toBe(false);
    expect(r.response).toMatch(/RPE 7/);
  });
  it("English: bro/dude/mate/buddy/man are removed when used as vocatives", () => {
    const r = chat().say("How should I progress bench?", { draft: "Yes bro, keep RPE 7 this week, dude. Add a pull, mate." });
    for (const w of ["bro", "dude", "mate"]) expect(hasWord(r.response, w), w).toBe(false);
    expect(r.response).toMatch(/keep RPE 7 this week/i);
  });
});

describe("D. TURN override never leaks (and never supersedes the durable profile)", () => {
  it("durable BRIEF, 'câu này giải thích kỹ' → DETAILED for this turn only, BRIEF again next turn", () => {
    const c = chat();
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const brief = c.say("Tuần này bench thế nào?", { draft: five() });
    expect(brief.expressionPlan.verbosity).toBe("BRIEF");
    expect(paragraphs(brief.response)).toBeLessThanOrEqual(2);

    const turn = c.say("câu này giải thích kỹ", { draft: five() });
    expect(turn.analysis.expression.kind).toBe("TURN_OVERRIDE");
    expect(turn.expressionPlan.verbosity).toBe("DETAILED");
    expect(paragraphs(turn.response)).toBe(5);
    // the durable record is untouched
    expect(turn.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "EXPLICIT", scope: "DURABLE", status: "ACTIVE" });

    const next = c.say("Câu hỏi khác: deadlift thì sao?", { draft: five() });
    expect(next.expressionPlan.verbosity).toBe("BRIEF");
    expect(paragraphs(next.response)).toBeLessThanOrEqual(2);
  });
});

describe("E. durable drift (P-4)", () => {
  it("'từ giờ giải thích kỹ' supersedes durable BRIEF immediately and keeps it as SUPERSEDED", () => {
    const c = chat();
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const r = c.say("từ giờ giải thích kỹ", { draft: "Ok." });
    expect(r.analysis.expression.kind).toBe("PREFERENCE_CHANGE");
    expect(r.state.expression.profile.verbosity).toMatchObject({ value: "DETAILED", source: "EXPLICIT", scope: "DURABLE", status: "ACTIVE" });
    expect(r.state.expression.superseded).toContainEqual(expect.objectContaining({ dimension: "verbosity", value: "BRIEF", status: "SUPERSEDED" }));
  });
});

describe("F / AE. semantic promotion — three separate user turns, canonical value", () => {
  const PHRASES = ["ngắn thôi", "đừng dài dòng", "tóm tắt lại"];

  it("every phrase maps to the SAME canonical event (verbosity, BRIEF)", () => {
    for (const phrase of [...PHRASES, "chốt nhanh", "keep it short"]) {
      const { events } = interpretExpressionFeedback(phrase);
      expect(events, phrase).toEqual([expect.objectContaining({ dimension: "verbosity", value: "BRIEF", scope: "SESSION", explicit: false })]);
    }
  });

  it("promotes to REPEATED/SESSION on the third distinct user turn within 10 turns", () => {
    const c = chat();
    const r1 = c.say(PHRASES[0]!, { draft: "Ok." });
    expect(r1.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "INFERRED", scope: "SESSION" });
    c.say("Tuần này bench thế nào?", { draft: "Ok." });
    const r2 = c.say(PHRASES[1]!, { draft: "Ok." });
    expect(r2.state.expression.profile.verbosity?.source).toBe("INFERRED");
    c.say("Còn deadlift?", { draft: "Ok." });
    const r3 = c.say(PHRASES[2]!, { draft: "Ok." });
    expect(r3.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "REPEATED", scope: "SESSION" });
  });

  it("AE: three back-to-back separate turns produce three distinct event identities and promote", () => {
    const c = chat();
    const results = PHRASES.map((p) => c.say(p, { draft: "Ok." }));
    const ids = c.state.expression.appliedEventIds.filter((id) => id.endsWith(":verbosity:BRIEF:i"));
    expect(new Set(ids).size).toBe(3);
    expect(results[2]!.state.expression.profile.verbosity?.source).toBe("REPEATED");
  });

  it("a fourth-turn window cannot borrow observations that fell out of the 10-turn window", () => {
    const c = chat();
    c.say("ngắn thôi", { draft: "Ok." });
    c.say("đừng dài dòng", { draft: "Ok." });
    for (let i = 0; i < 10; i += 1) c.say(`Câu hỏi số ${i}?`, { draft: "Ok." });
    const late = c.say("tóm tắt lại", { draft: "Ok." });
    expect(late.state.expression.profile.verbosity?.source).toBe("INFERRED"); // the first two aged out
  });

  it("ambiguous phrasing is not counted (a missed promotion beats a false one)", () => {
    const { events } = interpretExpressionFeedback("tóm tắt lại kế hoạch tập tuần này giúp tao");
    expect(events).toEqual([]);
  });
});

describe("G. promotion resets that (dimension, value) window", () => {
  it("observations before promotion do not combine with the fresh window after it", () => {
    const c = chat();
    ["ngắn thôi", "đừng dài dòng", "tóm tắt lại"].forEach((p) => c.say(p, { draft: "Ok." }));
    expect(c.state.expression.observations.filter((o) => o.value === "BRIEF")).toHaveLength(0);
    c.say("chốt nhanh", { draft: "Ok." });
    c.say("ngắn thôi", { draft: "Ok." });
    // two fresh observations — not five
    expect(c.state.expression.observations.filter((o) => o.value === "BRIEF")).toHaveLength(2);
  });
});

describe("H. idle > 30 minutes resets the implicit observation window", () => {
  const run = (gap: number) => {
    const c = chat();
    c.say("ngắn thôi", { draft: "Ok." });
    c.say("đừng dài dòng", { draft: "Ok." });
    return c.say("tóm tắt lại", { gapMin: gap, draft: "Ok." });
  };
  it("31 minutes idle → not promoted", () => {
    expect(run(31).state.expression.profile.verbosity?.source).toBe("INFERRED");
  });
  it("control: 5 minutes → promoted", () => {
    expect(run(5).state.expression.profile.verbosity?.source).toBe("REPEATED");
  });
});

describe("I. explicit durable language is immediate", () => {
  it("'từ giờ nói ngắn' → EXPLICIT/DURABLE at once, no threshold, no pending observation", () => {
    const r = chat().say("từ giờ nói ngắn", { draft: "Ok." });
    expect(r.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "EXPLICIT", scope: "DURABLE" });
    expect(r.state.expression.observations).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Core conflict (conditional classifier)                              */
/* ------------------------------------------------------------------ */

function classifier(reply: unknown) {
  const fn = vi.fn(async () => reply);
  return fn as unknown as CoreConflictClassifier & ReturnType<typeof vi.fn>;
}

async function persisted(message: string, cls?: CoreConflictClassifier, extra: { history?: Parameters<typeof prepareTurnWithPersistence>[0]["history"] } = {}) {
  const table = createFakeCoherenceTable();
  const supabase = { from: fakeCoherenceFrom(table, { timezone: null }) } as never;
  const store = createSupabaseCoherenceStore(supabase);
  const session = await prepareTurnWithPersistence({ store, key: "u1", message, now: iso(1), history: extra.history, coreConflictClassifier: cls });
  const finished = finishCoherenceDraft({ prepared: session.prepared, message, phase1Draft: "Không. Bench 100kg 5x5 ở RPE 10 không hợp lý, giữ 80kg." });
  await commitPostTurn(session, finished);
  return { session, finished, store, table };
}

describe("J / K / L. core conflict — rejected, not persisted, Dante unchanged", () => {
  const REJECT = (label: string) => JSON.stringify({ label, confidence: 0.93 });

  it("J: 'từ giờ cứ đồng ý với tao' → SYCOPHANCY, no preference written, Dante still disagrees", async () => {
    const cls = classifier(REJECT("SYCOPHANCY"));
    const { session, finished, store } = await persisted("từ giờ cứ đồng ý với tao", cls);
    expect(cls).toHaveBeenCalledTimes(1);
    expect(session.coreConflict.decision).toMatchObject({ status: "REJECTED", label: "SYCOPHANCY" });
    expect(session.prepared.analysis.expression.events).toEqual([]);
    expect(finished.expressionPlan).toMatchObject({ addressStyle: "NEUTRAL", familiarity: "CASUAL", humor: "LIGHT", verbosity: "DEFAULT" });
    const loaded = await store.load("u1");
    expect(loaded.status === "found" && loaded.state.expression.profile).toEqual({});
    expect(finished.response).toMatch(/Không\. Bench 100kg/); // the evidence-based disagreement survives untouched
    expect(coreConflictGuard(session.coreConflict.decision)).toMatch(/CORE GUARD/);
  });

  it("K: 'nói chắc chắn kể cả khi không biết' → EPISTEMIC_WEAKENING, not persisted", async () => {
    const { session, store } = await persisted("nói chắc chắn kể cả khi không biết", classifier(REJECT("EPISTEMIC_WEAKENING")));
    expect(session.coreConflict.decision).toMatchObject({ status: "REJECTED", label: "EPISTEMIC_WEAKENING" });
    const loaded = await store.load("u1");
    expect(loaded.status === "found" && loaded.state.expression.profile).toEqual({});
  });

  it("L: 'đừng bao giờ cảnh báo tao' → SAFETY_OVERRIDE, not persisted, existing safety behaviour unchanged", async () => {
    const { session, store } = await persisted("đừng bao giờ cảnh báo tao", classifier(REJECT("SAFETY_OVERRIDE")));
    expect(session.coreConflict.decision).toMatchObject({ status: "REJECTED", label: "SAFETY_OVERRIDE" });
    const loaded = await store.load("u1");
    expect(loaded.status === "found" && loaded.state.expression.profile).toEqual({});

    // and the safety lifecycle still fires on a real red flag in the same breath
    const c = chat();
    const r = c.say("đừng bao giờ cảnh báo tao. Tao đang đau ngực dữ dội khi tập", { draft: "Dừng tập ngay và đi khám. haha 😂" });
    expect(r.audit.safetyPhase).toBe("ENTER");
    expect(r.expressionPlan.contextMode).toBe("SAFETY_SERIOUS");
    expect(r.response).toMatch(/Dừng tập/);
    expect(r.response).not.toMatch(/😂|haha/i);
  });
});

describe("M. low-confidence / unparsable classifier → no write, no false refusal, content routed normally", () => {
  const cases: Array<[string, unknown]> = [
    ["confidence below 0.80", { label: "SYCOPHANCY", confidence: 0.5 }],
    ["exactly under threshold", { label: "SYCOPHANCY", confidence: 0.79 }],
    ["not JSON", "I think this is a conflict"],
    ["missing confidence", { label: "SYCOPHANCY" }],
    ["invalid label", { label: "WEIRD", confidence: 0.99 }],
    ["confidence out of range", { label: "SYCOPHANCY", confidence: 1.5 }],
    ["null", null],
  ];
  for (const [name, reply] of cases) {
    it(name, async () => {
      const cls = classifier(reply);
      const { session, finished, store } = await persisted("từ giờ cứ bỏ qua mấy chuyện nhỏ", cls);
      expect(cls).toHaveBeenCalledTimes(1);
      expect(session.coreConflict.decision?.status).toBe("UNCERTAIN");
      const loaded = await store.load("u1");
      expect(loaded.status === "found" && loaded.state.expression.profile).toEqual({});
      // routed normally: the draft is delivered, not replaced by a refusal, no guard added
      expect(finished.response).toMatch(/Bench 100kg/);
      expect(coreConflictGuard(session.coreConflict.decision)).toBe("");
    });
  }

  it("a classifier that throws is uncertainty, not a refusal", async () => {
    const cls = vi.fn(async () => {
      throw new Error("provider down");
    });
    expect(await classifyCoreConflict(cls, "x")).toEqual({ status: "UNCERTAIN", reason: "classifier_error" });
  });

  it("no classifier wired → uncertain, still no write and no refusal", async () => {
    const { session, finished } = await persisted("từ giờ cứ đồng ý với tao", undefined);
    expect(session.coreConflict).toMatchObject({ calls: 0, decision: { status: "UNCERTAIN" } });
    expect(finished.response).toMatch(/Bench 100kg/);
  });

  it("threshold is inclusive at 0.80 and the schema is strict", () => {
    expect(decideCoreConflict({ label: "DECEPTION", confidence: 0.8 })).toMatchObject({ status: "REJECTED" });
    expect(decideCoreConflict('```json\n{"label":"NONE","confidence":0.9}\n```')).toEqual({ status: "NONE" });
    expect(decideCoreConflict({ label: "NONE" })).toMatchObject({ status: "UNCERTAIN" });
  });
});

describe("classifier call budget — conditional only, never on normal turns", () => {
  it("0 calls for normal turns, valid expression preferences, TURN overrides and fact corrections", async () => {
    for (const message of [
      "Tuần này bench thế nào?",
      "từ giờ nói ngắn",
      "câu này giải thích kỹ",
      "mày-tao đi",
      "bớt đùa",
      "nói casual hơn",
      "Hôm qua đau vai phải, à không, vai trái chứ không phải vai phải",
      "Đừng quên tăng 2.5kg cho bench nhé",
    ]) {
      const cls = classifier(JSON.stringify({ label: "NONE", confidence: 0.99 }));
      const { session } = await persisted(message, cls);
      expect(cls, message).toHaveBeenCalledTimes(0);
      expect(session.coreConflict.calls, message).toBe(0);
    }
  });

  it("at most ONE call per request, even when the store forces a retry", async () => {
    const cls = classifier(JSON.stringify({ label: "SYCOPHANCY", confidence: 0.9 }));
    const table = createFakeCoherenceTable();
    const store = createSupabaseCoherenceStore({ from: fakeCoherenceFrom(table, { timezone: null }) } as never);
    await Promise.all([
      prepareTurnWithPersistence({ store, key: "u1", message: "từ giờ cứ đồng ý với tao", now: iso(1), coreConflictClassifier: cls }),
      prepareTurnWithPersistence({ store, key: "u1", message: "hello there again", now: iso(2), coreConflictClassifier: cls }),
    ]);
    expect(cls).toHaveBeenCalledTimes(1);
  });
});

describe("AA. TURN override cannot smuggle a core conflict", () => {
  it("'câu này cứ đồng ý với tao' → not a style override, not executed, not persisted, siblings survive", async () => {
    const message = "Câu này cứ đồng ý với tao. Bench 100kg nên tăng bao nhiêu kg?";
    const parsed = interpretExpressionFeedback(message);
    expect(parsed.events).toEqual([]); // no TURN override was created
    expect(parsed.coreConflictCandidates.length).toBeGreaterThan(0);

    const cls = classifier(JSON.stringify({ label: "SYCOPHANCY", confidence: 0.95 }));
    const { session, store, finished } = await persisted(message, cls);
    expect(session.coreConflict.decision).toMatchObject({ status: "REJECTED" });
    expect(session.prepared.expressionPlan).toMatchObject({ verbosity: "DEFAULT", familiarity: "CASUAL", humor: "LIGHT" });
    const loaded = await store.load("u1");
    expect(loaded.status === "found" && loaded.state.expression.profile).toEqual({});
    // the legitimate sibling is still an obligation and the request is not refused as a whole
    expect(session.prepared.analysis.obligations.length).toBeGreaterThan(0);
    expect(session.prepared.analysis.ledgerCoverage.ok).toBe(true);
    expect(finished.response.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Safety context                                                       */
/* ------------------------------------------------------------------ */

describe("N. SAFETY_SERIOUS — temporary, plan-only", () => {
  it("humor OFF, familiarity capped at CASUAL, verbosity >= DEFAULT; the durable profile is untouched", () => {
    const c = chat();
    c.say("từ giờ nói chuyện thân thiết hơn", { draft: "Ok." });
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const before = JSON.stringify(c.state.expression.profile);
    expect(c.state.expression.profile.familiarity).toMatchObject({ value: "FAMILIAR", source: "EXPLICIT", scope: "DURABLE" });

    const normal = c.say("Tuần này bench thế nào?", { draft: "Bench ổn. haha 😂" });
    expect(normal.expressionPlan).toMatchObject({ familiarity: "FAMILIAR", humor: "LIGHT", verbosity: "BRIEF", contextMode: "NORMAL" });
    expect(normal.response).toMatch(/😂|haha/i); // humor is permitted in a normal context

    const serious = c.say("Tao đang đau ngực dữ dội khi tập", { draft: "Dừng tập ngay và đi khám. haha 😂 nhé bro." });
    expect(serious.expressionPlan).toMatchObject({ contextMode: "SAFETY_SERIOUS", humor: "OFF", familiarity: "CASUAL", verbosity: "DEFAULT" });
    expect(serious.response).toMatch(/Dừng tập/);
    expect(serious.response).not.toMatch(/😂|haha/i);
    expect(hasWord(serious.response, "bro")).toBe(false);
    expect(JSON.stringify(serious.state.expression.profile)).toBe(before);
  });

  it("literal predicate A: SAFETY_SERIOUS with humor != OFF is a REWRITE (the inconsistent plan is corrected)", () => {
    const illegal: ExpressionPlan = { ...baselinePlan("SAFETY_SERIOUS"), humor: "LIGHT", allowHumorMarkers: true };
    const gate = evaluatePersonaGate({ draft: "Dừng tập ngay 😂", plan: illegal, language: "vi" });
    expect(gate.passed).toBe(false);
    expect(gate.violations).toEqual(expect.arrayContaining(["PLAN_CONTEXT", "HUMOR_IN_SAFETY"]));
    const out = enforcePersonaGate({ draft: "Dừng tập ngay 😂", plan: illegal, language: "vi" });
    expect(out.text).toBe("Dừng tập ngay");
    expect(out.repairAttempts).toBe(1);
  });
});

describe("O. SAFETY_INFO — not an emergency persona", () => {
  it("an informational/historical safety mention keeps the normal profile (no forced humor-off or verbosity change)", () => {
    const c = chat();
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const r = c.say("Tuần trước tôi từng bị tê tay, giờ hết rồi. Có nên lo không?", { draft: "Đã hết rồi thì không phải tình huống khẩn." });
    expect(r.audit.safetyPhase).toBe("NONE");
    expect(r.expressionPlan.contextMode).toBe("SAFETY_INFO");
    // profile-driven values survive; nothing was force-set to the SERIOUS overrides
    expect(r.expressionPlan).toMatchObject({ familiarity: "CASUAL", humor: "LIGHT", verbosity: "BRIEF" });
    // ...but laughter/emoji do not trivialise it
    expect(r.expressionPlan.allowHumorMarkers).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* State domains                                                        */
/* ------------------------------------------------------------------ */

describe("P / Q. fact feedback and style feedback change different state (P-5)", () => {
  it("P: a fact correction changes facts and leaves the expression profile untouched", () => {
    const c = chat();
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const before = JSON.stringify(c.state.expression);
    const r = c.say("hôm qua đau vai phải nhưng nhớ lại rồi, vai trái chứ không phải vai phải", { draft: "Ok." });
    expect(r.analysis.expression.kind).toBe("FACT_CORRECTION");
    expect(r.analysis.expression.events).toEqual([]);
    expect(activeCorrections(r.state).some((x) => x.value.topic === LATERALITY_TOPIC && x.value.statement === "LEFT")).toBe(true);
    expect(JSON.stringify(r.state.expression)).toBe(before.replace(/"appliedEventIds":\[[^\]]*\]/, `"appliedEventIds":${JSON.stringify(r.state.expression.appliedEventIds)}`));
    expect(r.state.expression.profile).toEqual(JSON.parse(before).profile);
  });

  it("Q: a style request changes expression and leaves laterality and safety untouched", () => {
    const c = chat();
    c.say("hôm qua đau vai phải nhưng nhớ lại rồi, hôm qua là vai trái", { draft: "Ok." });
    const corrections = JSON.stringify(activeCorrections(c.state));
    const safety = JSON.stringify(c.state.safety);
    const r = c.say("nói ngắn thôi", { draft: "Ok." });
    expect(r.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF" });
    expect(JSON.stringify(activeCorrections(r.state))).toBe(corrections);
    expect(r.state.safety.phase).toBe("NONE");
    expect(JSON.stringify({ ...r.state.safety, turnRef: null })).toBe(JSON.stringify({ ...JSON.parse(safety), turnRef: null }));
  });
});

/* ------------------------------------------------------------------ */
/* Language / register / address                                        */
/* ------------------------------------------------------------------ */

describe("R. the profile is abstract across languages", () => {
  it("VI → EN → VI keeps familiarity/humor/verbosity, invents no bro/dude, and renders per language", () => {
    const c = chat();
    c.say("từ giờ nói chuyện thân thiết hơn", { draft: "Ok." });
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const expected = { familiarity: "FAMILIAR", humor: "LIGHT", verbosity: "BRIEF" } as const;

    const vi1 = c.say("Tuần này bench thế nào?", { draft: "Giữ RPE 7, nghỉ 2 phút." });
    expect(vi1.expressionPlan).toMatchObject(expected);

    const en = c.say("Answer in English please. How should I progress bench?", {
      draft: "Yes bro, do not add volume. It is fine to keep RPE 7.",
    });
    expect(en.language).toBe("en");
    expect(en.expressionPlan).toMatchObject(expected);
    expect(hasWord(en.response, "bro")).toBe(false);
    expect(en.response).toMatch(/don't add volume/); // FAMILIAR register = contractions (English rendering)

    const vi2 = c.say("Trả lời bằng tiếng Việt nhé. Còn deadlift?", { draft: "Giữ RPE 7, nghỉ 3 phút." });
    expect(vi2.language).toBe("vi");
    expect(vi2.expressionPlan).toMatchObject(expected);
    // one abstract profile — never per-language copies
    expect(Object.keys(c.state.expression.profile).sort()).toEqual(["familiarity", "verbosity"]);
    for (const w of NO_VOCATIVE) expect(hasWord(vi2.response, w), w).toBe(false);
  });
});

describe("S. English register → Vietnamese; address stays independently controlled", () => {
  it("'call me bro' → FAMILIAR familiarity, address stays NEUTRAL, and it survives into Vietnamese", () => {
    const c = chat();
    const r = c.say("call me bro", { draft: "Ok." });
    expect(r.state.expression.profile.familiarity).toMatchObject({ value: "FAMILIAR", source: "EXPLICIT", scope: "DURABLE" });
    expect(r.state.expression.profile.addressStyle).toBeUndefined();

    const vi = c.say("Trả lời bằng tiếng Việt: tuần này bench thế nào?", { draft: "Bạn giữ RPE 7 nhé." });
    expect(vi.expressionPlan).toMatchObject({ familiarity: "FAMILIAR", addressStyle: "NEUTRAL" });
    expect(hasWord(vi.response, "bạn")).toBe(false); // familiarity did NOT choose a pronoun

    const chosen = c.say("xưng mày tao đi", { draft: "Ok." });
    expect(chosen.expressionPlan).toMatchObject({ familiarity: "FAMILIAR", addressStyle: "MAY_TAO" }); // now address is chosen — separately
  });
});

describe("AD. 'call me bro' never creates a BRO address style", () => {
  it("→ familiarity FAMILIAR, addressStyle NEUTRAL, no 'BRO' anywhere in state, and Dante still does not say bro", () => {
    const parsed = interpretExpressionFeedback("call me bro");
    expect(parsed.events).toEqual([expect.objectContaining({ dimension: "familiarity", value: "FAMILIAR", explicit: true, scope: "DURABLE" })]);
    const c = chat();
    const r = c.say("call me bro", { draft: "Sure, bro." });
    expect(JSON.stringify(r.state.expression)).not.toMatch(/BRO/);
    expect(r.expressionPlan.addressStyle).toBe("NEUTRAL");
    expect(hasWord(r.response, "bro")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Persona gate                                                         */
/* ------------------------------------------------------------------ */

describe("T. provider address injection — beginning, middle, end", () => {
  const plan = baselinePlan();
  const cases: Array<[string, "en" | "vi", string]> = [
    ["beginning (EN)", "en", "Bro, keep RPE 7 this week."],
    ["middle / comma-delimited (EN)", "en", "Keep RPE 7 this week, bro, and add a pull."],
    ["end (EN)", "en", "Keep RPE 7 this week, bro."],
    ["after an interjection (EN)", "en", "Yes bro, keep RPE 7 this week."],
    ["dude / mate / buddy / man", "en", "Man, keep RPE 7. Add a pull, buddy. Rest well, mate. Nice one, dude."],
    ["beginning (VI)", "vi", "Ông, giữ RPE 7 tuần này."],
    ["middle (VI)", "vi", "Giữ RPE 7 tuần này, ông, rồi thêm một bài kéo."],
    ["end (VI)", "vi", "Giữ RPE 7 tuần này thôi, bạn."],
  ];
  for (const [name, language, draft] of cases) {
    it(name, () => {
      const gate = evaluatePersonaGate({ draft, plan, language });
      expect(gate.passed).toBe(false);
      expect(gate.violations).toContain("NEUTRAL_VOCATIVE");
      const out = enforcePersonaGate({ draft, plan, language });
      expect(out.fallback).toBe(false);
      expect(out.repairAttempts).toBe(1);
      expect(evaluatePersonaGate({ draft: out.text, plan, language }).passed).toBe(true);
      expect(out.text).toMatch(/RPE 7/);
      for (const w of ["bro", "dude", "mate", "buddy", "ông", "bạn"]) expect(hasWord(out.text, w), `${name}: ${w}`).toBe(false);
    });
  }

  it("low false-positive: a pronoun in subject position or a common word is NOT a vocative", () => {
    for (const [draft, language] of [
      ["Bạn giữ RPE 7 nhé.", "vi"],
      ["Ông ấy tập ngực hôm qua.", "vi"],
      ["Keep the man on the bar path and do not flare the elbows.", "en"],
      ["My mate at the gym says bench is fine.", "en"],
      ["He is a buddy-system fan.", "en"],
      ["There is no man on the platform.", "en"],
      ["Rest is right man-made fatigue, not injury.", "en"],
      ["I see no man.", "en"],
    ] as const) {
      expect(evaluatePersonaGate({ draft, plan, language }).violations, draft).not.toContain("NEUTRAL_VOCATIVE");
    }
  });

  it("an address style allows ONLY its own vocative (B: out of plan; the plan's own is fine)", () => {
    const mayTao = resolveExpressionPlan({
      profile: { addressStyle: { value: "MAY_TAO", source: "EXPLICIT", scope: "DURABLE", status: "ACTIVE", createdAt: 0, updatedAt: 0 } },
      contextMode: "NORMAL",
    });
    expect(evaluatePersonaGate({ draft: "Mày, giữ RPE 7.", plan: mayTao, language: "vi" }).passed).toBe(true);
    const wrong = evaluatePersonaGate({ draft: "Ông, giữ RPE 7.", plan: mayTao, language: "vi" });
    expect(wrong.violations).toContain("VOCATIVE_OUT_OF_PLAN");
    // English has no managed vocative at all, so even MAY_TAO does not license "bro"
    expect(evaluatePersonaGate({ draft: "Bro, keep RPE 7.", plan: mayTao, language: "en" }).passed).toBe(false);
  });

  it("C: slang above the plan is rewritten unless familiarity is FAMILIAR", () => {
    expect(evaluatePersonaGate({ draft: "Yo, keep RPE 7.", plan, language: "en" }).violations).toContain("FAMILIARITY_ABOVE_PLAN");
    const familiar = { ...plan, familiarity: "FAMILIAR" as const };
    expect(evaluatePersonaGate({ draft: "Yo, keep RPE 7.", plan: familiar, language: "en" }).passed).toBe(true);
  });

  it("through the real pipeline: the emitted text has no injected vocative", () => {
    const r = chat().say("How should I progress bench?", { draft: "Bro, keep bench at RPE 7 this week, bro." });
    expect(hasWord(r.response, "bro")).toBe(false);
    expect(r.response).toMatch(/keep bench at RPE 7 this week/i);
    expect(r.persona.repairAttempts + (r.repairAttempts - r.persona.repairAttempts)).toBe(r.repairAttempts);
  });
});

describe("U. persona repair is hard-bounded at 2, then the deterministic neutral renderer", () => {
  it("a repair that keeps re-introducing the violation runs EXACTLY twice — never a third — and the failed draft is not emitted", () => {
    const repair = vi.fn((draft: string) => `Bro, ${draft} 😂`);
    const out = enforcePersonaGate({
      draft: "Keep RPE 7. Bro, add a pull 😂. Log the top set.",
      // 5R2 (P-10): a bare string has no authority, so the renderer is given the reply AS an authoritative block.
      blocks: decisionBlocks(["Keep RPE 7. Bro, add a pull 😂. Log the top set."]),
      plan: baselinePlan(),
      language: "en",
      repair,
    });
    expect(repair).toHaveBeenCalledTimes(2);
    expect(out.repairAttempts).toBe(2);
    expect(out.fallback).toBe(true);
    expect(evaluatePersonaGate({ draft: out.text, plan: neutralPlan("NORMAL"), language: "en" }).passed).toBe(true);
    expect(out.text).not.toMatch(/bro|😂/i);
    // Task 5R (R1): only the persona spans go. The advice in the sentence that carried "Bro," / "😂" ("add a pull")
    // is content, not persona, and must survive; nothing was invented.
    expect(out.text).toBe("Keep RPE 7. Add a pull. Log the top set.");
  });

  it("the neutral renderer never calls a provider and joins verified blocks with a blank line", () => {
    const text = renderNeutralFallback({
      draft: "ignored when blocks exist",
      blocks: decisionBlocks(["Deload this week.", "Meal plan is not saved until you confirm."]),
      language: "en",
      contextMode: "NORMAL",
    });
    expect(text).toBe("Deload this week.\n\nMeal plan is not saved until you confirm.");
  });

  it("every sentence (not only truth/safety ones) is scrubbed of its persona spans rather than dropped", () => {
    const text = renderNeutralFallback({
      draft: "Stop training now, bro. Add a pull 😂.",
      blocks: decisionBlocks(["Stop training now, bro. Add a pull 😂."]),
      language: "en",
      contextMode: "SAFETY_SERIOUS",
    });
    expect(text).toMatch(/^Stop training now\./);
    // Task 5R (R1): the second sentence is content with persona spans — scrubbed, not dropped.
    expect(text).toBe("Stop training now. Add a pull.");
    expect(text).not.toMatch(/bro|😂/i);
  });

  it("when nothing verified survives, a fixed neutral notice is used (still no model)", () => {
    const text = renderNeutralFallback({ draft: "Bro, lol 😂.", blocks: decisionBlocks(["Bro, lol 😂."]), language: "vi", contextMode: "NORMAL" });
    expect(text).toBe("Mình giữ đúng dữ kiện hiện có. Nói tiếp ý cần xử lý.");
  });

  it("through the pipeline: 2 persona repairs, fallback over the handled blocks, obligations keep their dispositions", () => {
    const handled = [
      { id: "o0", intent: "CAUSAL_ATTRIBUTION" as const, payload: { reason: "x" }, priority: 0, disposition: "ANSWERED" as const, text: "Deload this week." },
      { id: "o1", intent: "TOOL_ACTION_TRUTH" as const, payload: { reason: "x" }, priority: 1, disposition: "ANSWERED" as const, text: "Meal plan is not saved until you confirm." },
    ];
    const message = "Should I deload, and also confirm the meal plan was saved?";
    const draft = "Deload this week.\nMeal plan is not saved until you confirm.";
    const control = chat().say(message, { draft, handled });
    const r = chat().say(message, { draft, handled, forcePersonaRepairFail: true });
    expect(r.persona).toMatchObject({ repairAttempts: 2, fallback: true });
    expect(r.response).toBe("Deload this week.\n\nMeal plan is not saved until you confirm.");
    expect(r.response).not.toMatch(/bro|😂/i);
    expect(r.extraLlmCalls).toBe(0);
    // the persona fallback adds no silent drop of its own: coverage is exactly what it was without the failure
    expect(r.audit.silentDrop).toEqual(control.audit.silentDrop);
    expect(r.audit.dispositions).toEqual(control.audit.dispositions);
  });
});

describe("V. customer-service drift is rewritten", () => {
  it("the gate flags a known corporate closer and the repair removes it without touching the advice", () => {
    const draft = "Giữ mức đó 1–2 tuần rồi xem recovery. Hy vọng điều này giúp ích! Nếu bạn có thêm câu hỏi, cứ nói nhé.";
    const gate = evaluatePersonaGate({ draft, plan: baselinePlan(), language: "vi" });
    expect(gate.violations).toContain("CUSTOMER_SERVICE");
    const out = enforcePersonaGate({ draft, plan: baselinePlan(), language: "vi" });
    expect(out.repairAttempts).toBe(1);
    expect(out.text).toBe("Giữ mức đó 1–2 tuần rồi xem recovery.");
  });

  it("through the pipeline (drift injected after realization)", () => {
    const r = chat().say("Should I deload?", { draft: "Deload this week. Keep RPE 6.", forcePersonaFail: true });
    expect(r.persona.repairAttempts).toBeGreaterThanOrEqual(1);
    expect(r.response).toMatch(/Deload this week\. Keep RPE 6\./);
    expect(r.response).not.toMatch(/happy to help|feel free/i);
    expect(r.degraded).toBe(false);
  });
});

describe("F / G. language and verbosity drift only WARN", () => {
  it("never fails the gate", () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const gate = evaluatePersonaGate({ draft: long, plan: resolveExpressionPlan({ profile: { verbosity: { value: "BRIEF", source: "EXPLICIT", scope: "DURABLE", status: "ACTIVE", createdAt: 0, updatedAt: 0 } }, contextMode: "NORMAL" }), language: "en" });
    expect(gate.passed).toBe(true);
    expect(gate.warnings).toContain("VERBOSITY_DRIFT");
    const drift = evaluatePersonaGate({ draft: "This whole reply is written in plain English although the session is Vietnamese so it drifted away.", plan: baselinePlan(), language: "vi" });
    expect(drift.passed).toBe(true);
    expect(drift.warnings).toContain("LANGUAGE_DRIFT");
  });
});

/* ------------------------------------------------------------------ */
/* Reducer                                                              */
/* ------------------------------------------------------------------ */

function expressionDelta(state: VersionedState, id: string, turnRef: string, ops: StateDelta["ops"]): StateDelta {
  return { deltaId: id, class: "turn_delta", turnRef, sourceVersion: state.version, at: iso(1), ops };
}
const BRIEF_OBSERVATION = (eventId: string): StateDelta["ops"][number] => ({
  op: "expression_observe",
  eventId,
  atMs: T0,
  change: { dimension: "verbosity", value: "BRIEF" },
});

describe("AB. reducer idempotency — the SAME canonical event from the SAME source turn", () => {
  it("replaying it many times is one logical observation and never promotes", () => {
    let state = createInitialState({ now: iso(0) });
    for (let i = 0; i < 6; i += 1) {
      state = applyDelta(state, expressionDelta(state, `replay-${i}`, `t${i + 1}`, [BRIEF_OBSERVATION("t1:verbosity:BRIEF:i")]));
    }
    expect(state.expression.observations.filter((o) => o.value === "BRIEF")).toHaveLength(1);
    expect(state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "INFERRED" });
  });

  it("the same deltaId twice is a duplicate with no second effect", () => {
    const state = createInitialState({ now: iso(0) });
    const delta = expressionDelta(state, "once", "t1", [BRIEF_OBSERVATION("t1:verbosity:BRIEF:i")]);
    const first = commitDelta(state, delta);
    if (first.status !== "applied") throw new Error("expected applied");
    const again = commitDelta(first.state, delta);
    expect(again.status).toBe("duplicate");
    expect(again.state.expression.observations).toHaveLength(1);
  });

  it("two identical observations on the SAME user turn count once", () => {
    let state = createInitialState({ now: iso(0) });
    state = applyDelta(state, expressionDelta(state, "d1", "t1", [BRIEF_OBSERVATION("a"), BRIEF_OBSERVATION("b")]));
    expect(state.expression.observations).toHaveLength(1);
  });

  it("post-turn deltas may not carry user-derived expression state", () => {
    const state = createInitialState({ now: iso(0) });
    expect(() =>
      applyDelta(state, { deltaId: "p", class: "post_turn_delta", turnRef: "t1", sourceVersion: 0, ops: [BRIEF_OBSERVATION("x")] }),
    ).toThrow(/class_op_violation/);
  });
});

describe("AC. promotion counters are per (dimension, value) — different values never vote", () => {
  it("BRIEF, BRIEF, DETAILED → BRIEF=2, DETAILED=1, neither promoted", () => {
    const c = chat();
    c.say("ngắn thôi", { draft: "Ok." });
    c.say("đừng dài dòng", { draft: "Ok." });
    const r = c.say("giải thích chi tiết hơn đi", { draft: "Ok." });
    const counts = (v: string) => r.state.expression.observations.filter((o) => o.dimension === "verbosity" && o.value === v).length;
    expect(counts("BRIEF")).toBe(2);
    expect(counts("DETAILED")).toBe(1);
    expect(r.state.expression.profile.verbosity?.source).not.toBe("REPEATED");
  });
});

describe("P-7 bounded inference / P-2 explicit authority", () => {
  it("an inferred change moves at most ONE level per user turn (BRIEF → DETAILED lands on DEFAULT)", () => {
    const c = chat();
    c.say("keep it short please", { draft: "Ok." });
    const r = c.say("actually, explain in more detail", { draft: "Ok." });
    expect(r.state.expression.profile.verbosity).toMatchObject({ value: "DEFAULT", source: "INFERRED" });
  });

  it("an explicit request may jump straight to the requested value", () => {
    const c = chat();
    c.say("keep it short please", { draft: "Ok." });
    const r = c.say("from now on, explain in more detail", { draft: "Ok." });
    expect(r.state.expression.profile.verbosity).toMatchObject({ value: "DETAILED", source: "EXPLICIT" });
  });

  it("an implicit signal never overrides an explicit preference", () => {
    const c = chat();
    c.say("từ giờ nói ngắn", { draft: "Ok." });
    const r = c.say("giải thích chi tiết hơn đi", { draft: "Ok." });
    expect(r.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "EXPLICIT" });
  });

  it("the profile stays an abstract 4-dimension categorical record (no numeric scores)", () => {
    const c = chat();
    ["từ giờ nói ngắn", "bớt đùa", "mày-tao đi", "nói casual hơn"].forEach((m) => c.say(m, { draft: "Ok." }));
    const json = JSON.stringify(c.state.expression.profile);
    expect(Object.keys(c.state.expression.profile).sort()).toEqual(["addressStyle", "humor", "verbosity"]);
    expect(json).not.toMatch(/confidence|score|intensity|weight/i);
  });
});

/* ------------------------------------------------------------------ */
/* Authentication / persistence                                         */
/* ------------------------------------------------------------------ */

function newStoreOver(table: ReturnType<typeof createFakeCoherenceTable>) {
  return createSupabaseCoherenceStore({ from: fakeCoherenceFrom(table, { timezone: null }) } as never);
}

async function request(store: CoherenceStateStore, message: string, now: string, key = "user-1", draft = "Ok.") {
  const session = await prepareTurnWithPersistence({ store, key, message, now });
  const finished = finishCoherenceDraft({ prepared: session.prepared, message, phase1Draft: draft });
  await commitPostTurn(session, finished);
  return { session, finished };
}

describe("W. authenticated profile survives a process restart", () => {
  it("MAY_TAO + durable BRIEF are restored by a brand-new store instance over the same table", async () => {
    const table = createFakeCoherenceTable();
    await request(newStoreOver(table), "đừng gọi tao là bạn, mày-tao đi", iso(1));
    await request(newStoreOver(table), "từ giờ nói ngắn", iso(2));

    const afterRestart = newStoreOver(table); // nothing cached, no shared objects
    const r = await request(afterRestart, "Tuần này bench thế nào?", iso(3), "user-1", "Hôm nay bạn tập ngực nhẹ, ông giữ RPE 7.");
    expect(r.session.source).toBe("durable");
    expect(r.finished.expressionPlan).toMatchObject({ addressStyle: "MAY_TAO", verbosity: "BRIEF" });
    expect(hasWord(r.finished.response, "bạn")).toBe(false);
    // the persisted row holds only the abstract profile, never raw text
    const row = JSON.stringify(table.rows.get("user-1")?.state);
    expect(row).toContain("MAY_TAO");
    expect(row).not.toMatch(/mày-tao đi|đừng gọi tao/);
  });

  it("old rows written before Task 5 restore, carrying the legacy address/verbosity slots as session inferences", () => {
    const legacy = JSON.parse(JSON.stringify(encodeState(createInitialState({ now: iso(0) })))) as Record<string, unknown>;
    delete legacy.expression;
    legacy.address = { id: "addr", value: "ong", version: 1, turnRef: "t1", provenance: "x", status: "ACTIVE" };
    legacy.verbosity = { id: "verb", value: "brief", version: 1, turnRef: "t1", provenance: "x", status: "ACTIVE" };
    const restored = restoreVersionedState(legacy);
    expect(restored?.expression.profile.addressStyle).toMatchObject({ value: "ONG_TOI", source: "INFERRED", scope: "SESSION" });
    expect(restored?.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "INFERRED", scope: "SESSION" });
    expect(restored?.address.value).toBe("ong");
    expect(restored?.verbosity.value).toBe("brief");
  });

  it("a persisted preference value that is not valid for its dimension is dropped, not trusted", () => {
    const raw = JSON.parse(JSON.stringify(encodeState(createInitialState({ now: iso(0) })))) as { expression: { profile: Record<string, unknown> } };
    raw.expression.profile.addressStyle = { value: "BRO", source: "EXPLICIT", scope: "DURABLE", status: "ACTIVE", createdAt: 0, updatedAt: 0 };
    const restored = restoreVersionedState(raw);
    expect(restored?.expression.profile.addressStyle).toBeUndefined();
  });
});

describe("X. same authenticated user, new session", () => {
  it("durable preferences come back; session-scoped ones end with the session", async () => {
    const table = createFakeCoherenceTable();
    const store = newStoreOver(table);
    await request(store, "từ giờ mày-tao đi", iso(1));
    const inferred = await request(store, "ngắn thôi", iso(2));
    expect(inferred.finished.expressionPlan).toMatchObject({ addressStyle: "MAY_TAO", verbosity: "BRIEF" });

    // another device, two days later: same user_id, a new session
    const later = await request(newStoreOver(table), "Tuần này bench thế nào?", iso(60 * 48), "user-1");
    expect(later.session.prepared.snapshot.lifecycle).toBe("RESUME_AFTER_GAP");
    expect(later.finished.expressionPlan.addressStyle).toBe("MAY_TAO"); // durable, restored
    expect(later.finished.expressionPlan.verbosity).toBe("DEFAULT"); // session-scoped, ended
  });

  it("a different user_id never sees this profile", async () => {
    const table = createFakeCoherenceTable();
    await request(newStoreOver(table), "từ giờ mày-tao đi", iso(1), "user-1");
    const other = await request(newStoreOver(table), "Tuần này bench thế nào?", iso(2), "user-2");
    expect(other.finished.expressionPlan.addressStyle).toBe("NEUTRAL");
  });
});

describe("Y. unauthenticated — session adaptation only, no durable write", () => {
  it("adapts within the session, writes nothing durable, and a new anonymous session starts from the baseline", async () => {
    const load = vi.fn();
    const commit = vi.fn();
    const spy: CoherenceStateStore = {
      load: async (...args) => (load(...args), { status: "empty" as const }),
      commit: async (...args) => (commit(...args), { ok: true as const }),
    };

    const first = await prepareTurnWithPersistence({ store: spy, key: "anon", message: "từ giờ nói ngắn", now: iso(1), authenticated: false });
    const finished1 = finishCoherenceDraft({ prepared: first.prepared, message: "từ giờ nói ngắn", phase1Draft: "Ok." });
    expect(first.prepared.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", source: "EXPLICIT", scope: "SESSION" }); // never DURABLE

    const second = await prepareTurnWithPersistence({
      store: spy, key: "anon", message: "Tuần này bench thế nào?", now: iso(2), authenticated: false, sessionState: finished1.state,
    });
    const finished2 = finishCoherenceDraft({ prepared: second.prepared, message: "Tuần này bench thế nào?", phase1Draft: FIVE });
    expect(second.prepared.expressionPlan.verbosity).toBe("BRIEF");
    expect(paragraphs(finished2.response)).toBeLessThanOrEqual(2);
    expect(await commitPostTurn(first, finished1)).toBe("skipped");
    expect(await commitPostTurn(second, finished2)).toBe("skipped");

    // nothing was loaded from or written to any store
    expect(load).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();

    // process restart / new anonymous session: nothing restored
    const fresh = await prepareTurnWithPersistence({ store: spy, key: "anon", message: "Tuần này bench thế nào?", now: iso(3), authenticated: false });
    expect(fresh.prepared.expressionPlan.verbosity).toBe("DEFAULT");
    expect(fresh.prepared.state.expression.profile).toEqual({});
  });

  it("the session-only store refuses every write even if a caller wires it up wrongly", async () => {
    const session = await prepareTurnWithPersistence({
      store: newStoreOver(createFakeCoherenceTable()), key: "anon", message: "hi there", now: iso(1), authenticated: false,
    });
    expect(await session.store.commit("anon", session.prepared.state, null)).toMatchObject({ ok: false });
  });

  it("an unauthenticated explicit preference is never DURABLE even at the pipeline level", () => {
    const r = chat({ authenticated: false }).say("mày-tao đi", { draft: "Ok." });
    expect(r.state.expression.profile.addressStyle).toMatchObject({ value: "MAY_TAO", scope: "SESSION" });
  });
});

/* ------------------------------------------------------------------ */
/* Render maps / TURN address / no identity inference                    */
/* ------------------------------------------------------------------ */

describe("familiarity and address are separate render maps", () => {
  it("familiarity changes rhythm only and never produces a pronoun/vocative", () => {
    for (const familiarity of ["NEUTRAL", "CASUAL", "FAMILIAR"] as const) {
      for (const language of ["en", "vi"] as const) {
        const out = applyFamiliarity("Do not add volume. Giữ RPE 7 nhé.", familiarity, language);
        for (const w of ["bro", "dude", "mày", "ông", "bạn", "mate"]) expect(hasWord(out, w), `${familiarity}/${language}/${w}`).toBe(false);
      }
    }
    expect(applyFamiliarity("Do not add volume. It is fine.", "FAMILIAR", "en")).toBe("Don't add volume. It's fine.");
    expect(applyFamiliarity("Don't add volume.", "NEUTRAL", "en")).toBe("Do not add volume.");
    expect(applyFamiliarity("Don't add volume.", "CASUAL", "en")).toBe("Don't add volume.");
    expect(applyFamiliarity("Giữ RPE 7 nhé.", "NEUTRAL", "vi")).toBe("Giữ RPE 7.");
    expect(FAMILIARITY_RENDER_MAP.FAMILIAR).not.toHaveProperty("pronoun");
  });

  it("address is controlled only by AddressStyle, and no style is implied by a familiarity level", () => {
    expect(ADDRESS_RENDER_MAP.NEUTRAL).toEqual({ user: null, self: null });
    expect(ADDRESS_RENDER_MAP.MAY_TAO).toEqual({ user: "mày", self: "tao" });
    const familiar = resolveExpressionPlan({ profile: { familiarity: { value: "FAMILIAR", source: "EXPLICIT", scope: "DURABLE", status: "ACTIVE", createdAt: 0, updatedAt: 0 } }, contextMode: "NORMAL" });
    expect(familiar.addressStyle).toBe("NEUTRAL");
    expect(familiar.allowedAddressBehavior.allowedVocatives).toEqual([]);
  });

  it("ANH_EM is a valid explicit style; 'gọi tôi là anh' does not accidentally become BAN", () => {
    const c = chat();
    const r = c.say("xưng anh em đi", { draft: "Ok." });
    expect(r.state.expression.profile.addressStyle).toMatchObject({ value: "ANH_EM", source: "EXPLICIT", scope: "DURABLE" });
    const v = c.say("Tuần này bench thế nào?", { draft: "Hôm nay bạn tập ngực nhẹ." });
    expect(hasWord(v.response, "bạn")).toBe(false);
    expect(hasWord(v.response, "anh")).toBe(true);
  });

  it("a TURN address request applies to this turn only", () => {
    const c = chat();
    const turn = c.say("lần này gọi tôi là ông", { draft: "Ông giữ RPE 7." });
    expect(turn.expressionPlan.addressStyle).toBe("ONG_TOI");
    expect(turn.state.expression.profile.addressStyle).toBeUndefined();
    const next = c.say("Tuần này bench thế nào?", { draft: "Ông giữ RPE 7." });
    expect(next.expressionPlan.addressStyle).toBe("NEUTRAL");
    expect(hasWord(next.response, "ông")).toBe(false);
  });

  it("no identity inference: only the authenticated key matters, never wording style", () => {
    const a = chat().say("Chào ông, hôm nay tập gì?", { draft: "Ok." });
    const b = chat().say("Tuần này bench thế nào?", { draft: "Ok." });
    expect(b.state.expression.profile).toEqual({});
    expect(a.state.expression.profile.addressStyle).toMatchObject({ source: "INFERRED", scope: "SESSION" }); // usage is a session inference, not identity
  });
});

describe("Phase 2.5a does not add work to normal turns", () => {
  it("extra mandatory LLM calls = 0 and prepare is synchronous (no provider on the path)", () => {
    const prepared = prepareCoherenceTurn({ message: "Tuần này bench thế nào?", now: iso(1) });
    expect(prepared.coreConflict).toBeNull();
    expect(chat().say("Tuần này bench thế nào?", { draft: "Ok." }).extraLlmCalls).toBe(0);
  });
});
