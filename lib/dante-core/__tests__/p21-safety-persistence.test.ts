/**
 * P-21 — scoped safety persistence. PERSIST is context, not a conversation lock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const provider = vi.hoisted(() => ({
  text: "Based on your current plan and recovery, follow today's scheduled session.",
  prompts: [] as string[],
}));

vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: provider.text };
    yield { kind: "model", model: "stub-provider" };
  },
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import {
  derivePersistedSafetyScope,
  finishCoherenceDraft,
  prepareCoherenceTurn,
  resolvePersistedSafetyApplication,
} from "@/lib/dante-core/coherence";
import { createInitialState, restoreVersionedState } from "@/lib/dante-core/coherence/reducer";
import {
  createFakeCoherenceTable,
  fakeCoherenceFrom,
  type FakeCoherenceTable,
} from "./support/fake-coherence-supabase";

const NOW = "2026-09-22T12:00:00.000Z";
const KNEE =
  "My knee hurts a little when I squat — don't diagnose me. Should I keep training today?";
const TRAIN_TODAY = "What should I train today based on my current plan and recovery?";
const EAT = "What should I eat after training?";
const MAX_SQUAT = "Can I max squat today?";
const WORKOUT = "Can you give me a workout?";
const CHEST = "I've had chest pain since my last set of bench press.";
const LOCK = /this is still unresolved|other questions are on hold/i;

function chain(sessionId = "p21") {
  let prior: ReturnType<typeof prepareCoherenceTurn>["state"] | null = null;
  let minute = 0;
  return (message: string, draft?: string) => {
    minute += 1;
    const now = new Date(Date.parse(NOW) + minute * 60_000).toISOString();
    const prepared = prepareCoherenceTurn({ message, now, sessionId, prior });
    const finished = finishCoherenceDraft({
      prepared,
      message,
      ...(draft !== undefined ? { phase1Draft: draft } : {}),
    });
    prior = finished.state;
    return { prepared, finished };
  };
}

describe("P-21 scope record", () => {
  it("carries issue, domain, area, activity, constraints, lifecycle", () => {
    const base = createInitialState({ now: NOW, sessionId: "p21-scope" });
    const snapshot = {
      ...base,
      safety: { ...base.safety, phase: "PERSIST" as const, category: "possible_injury", turnRef: "t1" },
      topicStack: [...base.topicStack, "knee_pain"],
    };
    const scope = derivePersistedSafetyScope(snapshot);
    expect(scope).toMatchObject({
      safetyIssueId: "possible_injury:t1",
      affectedDomain: "TRAINING",
      affectedBodyArea: "KNEE",
      affectedActivity: "squat",
      lifecycleState: "PERSIST",
    });
    expect(scope?.relevantConstraints.length).toBeGreaterThan(0);
  });
});

describe("P-21 A. prior knee + today's plan/recovery", () => {
  it("answers the current question and only constrains the knee", () => {
    const say = chain();
    const first = say(KNEE);
    expect(first.finished.state.safety.phase).toBe("ENTER");
    expect(first.finished.state.safety.category).toBe("possible_injury");
    const next = say(
      TRAIN_TODAY,
      "Based on your current plan and recovery, follow today's scheduled session.",
    );
    expect(["ENTER", "PERSIST"]).toContain(next.finished.audit.safetyPhase);
    expect(resolvePersistedSafetyApplication({
      message: TRAIN_TODAY,
      snapshot: next.finished.state,
      followUp: next.prepared.analysis.safetyFollowUp,
      safetyPhase: next.finished.audit.safetyPhase,
    }).mode).toBe("CONSTRAIN");
    const text = next.finished.response;
    expect(text).toMatch(/plan|recovery|scheduled session/i);
    expect(text).toMatch(/knee|conservative|reproduce the pain/i);
    expect(text).not.toMatch(LOCK);
  });
});

describe("P-21 B. prior knee + nutrition", () => {
  it("answers food normally with no knee takeover", () => {
    const say = chain("p21-b");
    say(KNEE);
    const next = say(EAT, "Eat protein and carbs in the next meal.");
    expect(resolvePersistedSafetyApplication({
      message: EAT,
      snapshot: next.finished.state,
      followUp: next.prepared.analysis.safetyFollowUp,
      safetyPhase: next.finished.audit.safetyPhase,
    }).mode).toBe("IGNORE");
    expect(next.finished.response).toMatch(/protein|carbs|meal/i);
    expect(next.finished.response).not.toMatch(/knee|unresolved|on hold/i);
  });
});

describe("P-21 C. prior knee + max squat", () => {
  it("strongly constrains the directly relevant lift", () => {
    const say = chain("p21-c");
    say(KNEE);
    const next = say(MAX_SQUAT, "You asked about a max squat.");
    expect(resolvePersistedSafetyApplication({
      message: MAX_SQUAT,
      snapshot: next.finished.state,
      followUp: next.prepared.analysis.safetyFollowUp,
      safetyPhase: next.finished.audit.safetyPhase,
    }).mode).toBe("CONSTRAIN");
    expect(next.finished.response).toMatch(/don['’]?t max squat|conservative|knee/i);
    expect(next.finished.response).not.toMatch(LOCK);
  });
});

describe("P-21 D. chest-pain emergency still dominates a workout ask", () => {
  it("keeps emergency-wide blocking when the episode is still current", () => {
    const say = chain("p21-d");
    const first = say(CHEST);
    expect(first.finished.state.safety.category).toBe("chest_pain_cardiac");
    const next = say(WORKOUT, "PROVIDER-COACHING: try a full workout.");
    expect(resolvePersistedSafetyApplication({
      message: WORKOUT,
      snapshot: next.finished.state,
      followUp: next.prepared.analysis.safetyFollowUp,
      safetyPhase: next.finished.audit.safetyPhase,
    }).mode).toBe("DOMINATE");
  });
});

describe("P-21 E. resolved safety does not surface later", () => {
  it("drops old knee constraint after a credible resolution", () => {
    const say = chain("p21-e");
    say(KNEE);
    const resolved = say("Currently no knee pain, I'm fine. Nothing hurts.");
    expect(["DOWNGRADE", "EXIT", "NONE"]).toContain(resolved.finished.state.safety.phase);
    const next = say(TRAIN_TODAY, "Follow today's scheduled session from the plan.");
    expect(resolvePersistedSafetyApplication({
      message: TRAIN_TODAY,
      snapshot: next.finished.state,
      followUp: next.prepared.analysis.safetyFollowUp,
      safetyPhase: next.finished.audit.safetyPhase,
    }).mode).toBe("IGNORE");
    expect(next.finished.response).toMatch(/scheduled session|plan/i);
    expect(next.finished.response).not.toMatch(/stresses the knee|still unresolved|on hold/i);
  });
});

const USER_ID = "00000000-0000-4000-8000-000000000021";

function clientFor(table: FakeCoherenceTable) {
  const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
  };
}

async function post(message: string) {
  const before = provider.prompts.length;
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    }),
  );
  const events = parseChatStreamChunk("", await response.text()).events;
  const delta = events.find((e) => e.type === "delta");
  const done = events.find((e) => e.type === "done");
  return {
    text: delta && delta.type === "delta" ? delta.text : "",
    model: done && done.type === "done" ? done.model : null,
    providerCalls: provider.prompts.length - before,
  };
}

describe("P-21 production route", () => {
  let table: FakeCoherenceTable;
  beforeEach(() => {
    table = createFakeCoherenceTable();
    provider.prompts.length = 0;
    provider.text = "Based on your current plan and recovery, follow today's scheduled session.";
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
  });

  it("A. knee persist does not lock a new plan/recovery question", async () => {
    await post(KNEE);
    const next = await post(TRAIN_TODAY);
    expect(next.model).not.toBe("dante-core-safety-lifecycle");
    expect(next.text).toMatch(/plan|recovery|scheduled session/i);
    expect(next.text).toMatch(/knee|conservative|reproduce the pain/i);
    expect(next.text).not.toMatch(LOCK);
    const row = table.rows.get(USER_ID);
    if (!row) throw new Error("missing coherence row");
    const restored = restoreVersionedState(row.state);
    if (!restored) throw new Error("invalid coherence state");
    expect(["ENTER", "PERSIST"]).toContain(restored.safety.phase);
  }, 15_000);

  it("D. chest-pain persist still dominates a workout ask", async () => {
    provider.text = "PROVIDER-COACHING: try a full workout.";
    await post(CHEST);
    const next = await post(WORKOUT);
    expect(next.providerCalls).toBe(0);
    expect(next.text).not.toMatch(/PROVIDER-COACHING/);
    expect(next.text).toMatch(/stop|medical|unresolved/i);
  }, 15_000);
});
