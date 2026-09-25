/**
 * P-16 — decision-first coach realization. Does not re-open P-13/P-14/P-15.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const provider = vi.hoisted(() => ({
  text: "Keep it simple today.",
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
  applyDecisionFirst,
  finishCoherenceDraft,
  prepareCoherenceTurn,
  type DecisionState,
} from "@/lib/dante-core/coherence";
import { baselinePlan } from "@/lib/dante-core/coherence/expression";
import {
  createFakeCoherenceTable,
  fakeCoherenceFrom,
  type FakeCoherenceTable,
} from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-09-21T12:00:00.000Z";
const RAIN =
  "yo bro, feeling great today, dont mention anything else, only considering that it is raining heavy as hell out there, should i get myself to the gym =))";
const GENERIC = [
  "If it's raining heavily, consider the safety of traveling to the gym.",
  "If conditions are unsafe (like flooding or lightning), it might be better to stay home.",
  "If you feel confident about getting there safely, then go for it!",
].join(" ");
const HEDGE = /\b(?:consider the safety|it might be better|if you feel confident|you might consider|ultimately)\b/i;
const PROFILE_LEAK = /recovery score|lean bulk|calorie|training load|home workout|check-in|180g protein|effective sets/i;
const casualPlan = baselinePlan("NORMAL");

function realize(message: string, draft: string, decisionState?: DecisionState, allowedFactors?: readonly string[]) {
  return finishCoherenceDraft({
    prepared: prepareCoherenceTurn({ message, now: NOW, sessionId: "p16" }),
    message,
    phase1Draft: draft,
    decisionState,
    allowedFactors,
  }).response;
}

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
  return {
    status: response.status,
    text: delta && delta.type === "delta" ? delta.text : "",
    providerCalls: provider.prompts.length - before,
    prompt: provider.prompts.at(-1) ?? "",
  };
}

describe("P-16 decision-first realization", () => {
  let table: FakeCoherenceTable;

  beforeEach(() => {
    table = createFakeCoherenceTable();
    provider.text = GENERIC;
    provider.prompts.length = 0;
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
  });

  describe("TEST A — exact rain repro", () => {
    it("states the call first and drops generic hedges", async () => {
      const text = realize(RAIN, GENERIC);
      expect(text.toLowerCase().indexOf("rain")).toBeLessThan(text.toLowerCase().indexOf("flood"));
      expect(text).toMatch(/rain alone isn't enough reason to skip/i);
      expect(text).toMatch(/flooding|lightning/i);
      expect(text).not.toMatch(HEDGE);
      expect(text).not.toMatch(PROFILE_LEAK);
      expect(text).not.toMatch(/home workout|reschedule|mobility/i);
      provider.text = GENERIC;
      const turn = await post(RAIN);
      expect(turn.status).toBe(200);
      expect(turn.providerCalls).toBe(1);
      expect(turn.text).toMatch(/rain alone isn't enough reason to skip/i);
      expect(turn.text).toMatch(/flooding|lightning/i);
      expect(turn.text).not.toMatch(HEDGE);
      expect(turn.text).not.toMatch(PROFILE_LEAK);
      expect(turn.prompt).toMatch(/Decision: on a resolved yes\/no coaching call/i);
    });
  });

  describe("TEST B — resolved yes", () => {
    it("leads with train, not might-consider", () => {
      const text = realize(
        "I'm recovered, my session is scheduled, no pain, should I train?",
        "You might consider training today if you feel up to it.",
        "RESOLVED_POSITIVE",
      );
      expect(text).toMatch(/^Train\./);
      expect(text).not.toMatch(/you might consider/i);
    });
  });

  describe("TEST C — resolved no", () => {
    it("keeps a rest day instead of it-depends", () => {
      const text = realize(
        "I have a scheduled rest day and no reason to change it. Should I train anyway?",
        "It depends. You might still train if you feel like it.",
        "RESOLVED_NEGATIVE",
      );
      expect(text).toMatch(/skip today/i);
      expect(text).not.toMatch(/^it depends/i);
    });
  });

  describe("TEST D — genuine uncertainty", () => {
    it("does not force a go/skip call", () => {
      const draft = "That's too vague to call. What feels weird — pain, dizziness, or just low motivation?";
      const text = realize("I feel weird but can't describe it. Should I train?", draft);
      expect(text).toMatch(/weird|descri|dizziness|motivation/i);
      expect(text).not.toMatch(/^Train\.|^No\. Keep the rest day/i);
    });
  });

  describe("TEST E — safety conditional", () => {
    it("keeps flooding/lightning as the compact boundary", () => {
      const text = applyDecisionFirst({
        draft: GENERIC,
        decisionState: "CONDITIONAL_RESOLVED",
        allowedFactors: ["rain", "weather"],
        message: RAIN,
        language: "en",
        plan: casualPlan,
      });
      expect(text).toMatch(/flooding or lightning/i);
      expect(text).not.toMatch(/weather alerts|road conditions|transportation availability/i);
    });
  });

  describe("TEST F — casual register", () => {
    it("may keep a light challenge when the user is casual", () => {
      const text = realize(RAIN, GENERIC);
      expect(text).toMatch(/looking for a reason to skip/i);
    });
  });

  describe("TEST G — neutral register", () => {
    it("does not invent bro or mày-tao", () => {
      const text = realize(
        "Should I attend the gym despite the rain?",
        "Rain alone isn't enough reason to skip. If travel is unsafe because of flooding or lightning, stay home.",
      );
      expect(text).not.toMatch(/\bbro\b|mày|tao/i);
    });
  });

  describe("TEST H — hesitation signal", () => {
    it("answers first, then may challenge", () => {
      const text = realize("bro be honest... rain's bad... should I just skip =))", GENERIC, "CONDITIONAL_RESOLVED", ["rain"]);
      expect(text.toLowerCase().indexOf("rain")).toBeLessThan(text.toLowerCase().indexOf("looking for"));
      expect(text).toMatch(/looking for a reason to skip/i);
    });
  });

  describe("TEST I — no hesitation", () => {
    it("does not force an excuse joke", () => {
      const text = realize(
        "Is rainfall alone sufficient reason to cancel today's gym session?",
        "Rain alone isn't enough reason to skip. If flooding or lightning makes travel unsafe, stay home.",
      );
      expect(text).not.toMatch(/excuse|looking for a reason to skip/i);
    });
  });

  describe("TEST J — P-15 regression", () => {
    it("does not reintroduce recovery/nutrition", () => {
      const text = realize(RAIN, `${GENERIC} Your recovery score is 41 so maybe stay home.`);
      expect(text).not.toMatch(PROFILE_LEAK);
    });
  });

  describe("TEST K — safety regression", () => {
    it("anti-hedge does not drop lightning/flooding", () => {
      const text = applyDecisionFirst({
        draft: "If conditions are unsafe (like flooding or lightning), it might be better to stay home.",
        decisionState: "CONDITIONAL_RESOLVED",
        allowedFactors: ["rain"],
        message: "only considering rain, should I skip the gym?",
        language: "en",
        plan: casualPlan,
      });
      expect(text).toMatch(/flooding|lightning/i);
    });
  });

  describe("mutation checks", () => {
    it("fails if the direct decision is removed", () => {
      const text = realize(RAIN, GENERIC);
      expect(text).toMatch(/isn't enough reason to skip|get to the gym|stay home/i);
    });

    it("fails if a resolved call becomes might/consider", () => {
      expect(realize(
        "I'm recovered, my session is scheduled, no pain, should I train?",
        "You might consider training.",
        "RESOLVED_POSITIVE",
      )).not.toMatch(/might consider/i);
    });

    it("fails if the safety boundary disappears", () => {
      expect(realize(RAIN, GENERIC)).toMatch(/flooding|lightning/i);
    });

    it("fails if casual slang is globally forced", () => {
      expect(realize("Should I attend the gym despite the rain?", "Go if travel is safe.")).not.toMatch(/\bbro\b/i);
    });

    it("fails if a behavioral challenge appears on every answer", () => {
      expect(realize(
        "Is rainfall alone sufficient reason to cancel today's gym session?",
        "Rain alone isn't enough reason to skip.",
      )).not.toMatch(/looking for a reason to skip/i);
    });

    it("fails if P-15 leakage returns", () => {
      expect(realize(RAIN, GENERIC)).not.toMatch(PROFILE_LEAK);
    });

    it("fails if alternatives are automatically appended", () => {
      expect(realize(RAIN, `${GENERIC} Do a home workout instead.`)).not.toMatch(/home workout/i);
    });
  });
});
