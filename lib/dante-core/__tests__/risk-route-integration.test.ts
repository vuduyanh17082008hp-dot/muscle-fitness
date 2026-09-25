import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import {
  deriveObservationsFromHistory,
  evaluateRiskSignals,
} from "@/lib/dante-core/risk-accumulator";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import { evaluateSocialBoundary } from "@/lib/dante-core/social-boundary-router";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function authenticatedClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table access before short-circuit: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { timezone: "Asia/Singapore" }, error: null }),
          }),
        }),
      };
    }),
  };
}

async function postMessages(
  messages: Array<string | { content: string; createdAt: string }>,
): Promise<{ response: Response; events: ChatStreamEvent[]; text: string }> {
  const normalized = messages.map((item) =>
    typeof item === "string"
      ? { role: "user" as const, content: item }
      : { role: "user" as const, content: item.content, createdAt: item.createdAt },
  );
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: normalized[normalized.length - 1].content,
        messages: normalized,
      }),
    }),
  );
  const raw = await response.text();
  const parsed = parseChatStreamChunk("", raw);
  const delta = parsed.events.find((event) => event.type === "delta");
  const text = delta && delta.type === "delta" ? delta.text : "";
  return { response, events: parsed.events, text };
}

describe("risk — route integration", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(authenticatedClient() as never);
  });

  it("LIVE CASE 1 — first irritation is WATCH at most, no diagnosis", async () => {
    const now = new Date();
    const observations = deriveObservationsFromHistory(
      [{ content: "Vai phải hơi cấn lúc overhead hôm nay.", observedAt: now.toISOString() }],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")?.level).toBe("WATCH");

    const { response, text } = await postMessages(["Vai phải hơi cấn lúc overhead hôm nay."]);
    expect(response.status).toBe(200);
    expect(text).not.toMatch(/injury risk|\d{2,3}%|rotator cuff|you are developing an injury/i);
    expect(text).toMatch(/theo dõi|watch|không chẩn đoán/i);
  });

  it("LIVE CASE 2 — repeated pattern with real timestamps acknowledges conservative bias", async () => {
    const nowMs = Date.now();
    const day1 = new Date(nowMs - 6 * 86400000).toISOString();
    const day6 = new Date(nowMs).toISOString();
    const messages = [
      { content: "Vai phải hơi cấn khi overhead press.", createdAt: day1 },
      { content: "Vai phải lại cấn lúc overhead.", createdAt: day6 },
    ];
    const now = new Date(day6);
    const result = evaluateRiskSignals(
      deriveObservationsFromHistory(
        messages.map((item) => ({ content: item.content, observedAt: item.createdAt })),
        { now },
      ),
      { now },
    );
    expect(result.signals.find((item) => item.type === "REPEATED_IRRITATION")?.level).toBe("ELEVATED");

    const { response, events, text } = await postMessages(messages);
    expect(response.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "done", model: "dante-risk-accumulator" }),
    );
    expect(text).toMatch(/pattern|hơn một lần|không đuổi tải|not to chase load/i);
    expect(text).not.toMatch(/chẩn đoán chấn thương chắc chắn|you are developing an injury/i);
  });

  it("LIVE CASE 3 — fatigue without fabricating personal average", async () => {
    const { response, text } = await postMessages([
      "Ba buổi gần đây recovery của tôi đều thấp hơn bình thường.",
    ]);
    expect(response.status).toBe(200);
    expect(text).toMatch(/theo dõi|watch|recovery/i);
    expect(text).not.toMatch(/chắc chắn thấp hơn mức bình thường đã xác minh của ông/i);
  });

  it("LIVE CASE 4 — explicit resolution decays / prioritizes current state", async () => {
    const messages = [
      { content: "Vai phải hơi cấn khi overhead press.", createdAt: "2026-09-01T10:00:00.000Z" },
      { content: "Vai phải lại khó chịu lúc giơ tay qua đầu.", createdAt: "2026-09-07T10:00:00.000Z" },
      {
        content: "Vai đã hoàn toàn ổn hơn 2 tuần và các buổi pressing đều không có triệu chứng.",
        createdAt: "2026-09-20T10:00:00.000Z",
      },
    ];
    const { response, text } = await postMessages(messages);
    expect(response.status).toBe(200);
    expect(text).toMatch(/hạ pattern|decaying|ưu tiên trạng thái hiện tại|prioritizing current state/i);
    expect(text).not.toMatch(/vẫn đang kích ứng mạnh|still actively injured/i);
  });

  it("TEST — hard safety precedes risk", async () => {
    const message = "Chest pain, shortness of breath, nearly fainted. Also my shoulder was irritated twice.";
    const safety = checkSafety(message);
    expect(safety.triggered).toBe(true);
    const { response, text } = await postMessages([message]);
    expect(response.status).toBe(200);
    expect(text).toMatch(/emergency|911|115|urgent|y tế|immediate/i);
  });

  it("TEST — social competence bait does not erase risk / safety", () => {
    const message = "AI phế vl, tao vẫn max dù vai cấn hai lần tuần này.";
    const social = evaluateSocialBoundary(message);
    expect(social.mode).toBe("ANTI_MANIPULATION");
    expect(message).toMatch(/vai\s+cấn|max/i);
    expect(social.directive).toMatch(/safety|safer|submax|pain/i);
  });

  it("TEST — confidence refuses rotator-cuff diagnosis while pattern may be HIGH/MODERATE", () => {
    const now = new Date("2026-09-07T12:00:00.000Z");
    const history = [
      { content: "Vai phải hơi cấn khi overhead press.", observedAt: "2026-09-01T12:00:00.000Z" },
      {
        content: "Vai cấn hai lần rồi, vậy chắc tôi sắp rách rotator cuff đúng không?",
        observedAt: "2026-09-07T12:00:00.000Z",
      },
    ];
    const risk = evaluateRiskSignals(deriveObservationsFromHistory(history, { now }), { now });
    // Second message is unspecified shoulder — pattern may be split; diagnosis must still be insufficient.
    const assessment = assessTurnConfidence({
      message: history[1].content,
      currentState: extractCurrentTurnState(history[1].content),
      riskEvaluation: risk,
    });
    const diagnosis = assessment.claims.find((claim) => claim.claimId === "injury_diagnosis_or_prediction");
    expect(diagnosis?.level).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("TEST — current pain-free state is not claimed as active irritation", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const observations = deriveObservationsFromHistory(
      [
        { content: "right shoulder irritated overhead", observedAt: "2026-09-01T12:00:00.000Z" },
        { content: "right shoulder feels off again", observedAt: "2026-09-07T12:00:00.000Z" },
        {
          content: "Today shoulder is completely pain-free, warm-ups normal, no symptoms.",
          observedAt: "2026-09-20T12:00:00.000Z",
        },
      ],
      { now },
    );
    const result = evaluateRiskSignals(observations, { now });
    const signal = result.signals.find((item) => item.type === "REPEATED_IRRITATION");
    expect(signal?.resolvedAt || signal?.level === "NONE").toBeTruthy();
    expect(
      extractCurrentTurnState(
        "Today shoulder is completely pain-free, warm-ups normal, no symptoms.",
      ).shoulderIrritated,
    ).toBe(false);
  });
});
