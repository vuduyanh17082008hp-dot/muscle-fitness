import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";

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

async function postMessage(message: string): Promise<{ response: Response; events: ChatStreamEvent[] }> {
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        messages: [{ role: "user", content: message }],
      }),
    }),
  );
  const raw = await response.text();
  const parsed = parseChatStreamChunk("", raw);
  return { response, events: parsed.events };
}

describe("confidence — route integration", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(authenticatedClient() as never);
  });

  it("LIVE caffeine performance path refuses false certainty", async () => {
    const { response, events } = await postMessage(
      "I've had 300mg caffeine today. Will that make me stronger for bench?",
    );
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";
    expect(response.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "done", model: "dante-confidence-engine" }),
    );
    expect(text).toMatch(/consumption|tiêu thụ|reported caffeine/i);
    expect(text).not.toMatch(/will (?:definitely )?improve|sẽ chắc chắn|improve your bench today/i);
    expect(text).not.toMatch(/\d{2,3}%/);
  });

  it("LIVE Vietnamese shoulder ask keeps claim-specific structure on current-state path", async () => {
    const { response, events } = await postMessage(
      "Hôm nay recovery tốt, ngủ 8h, vai hơi cấn overhead, không tê yếu hay sưng, hôm kia chest nặng, không PR. Cái nào ông chắc và cái nào chưa?",
    );
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";
    expect(response.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "done", model: "dante-current-state-coach" }),
    );
    expect(text).toMatch(/ĐIỀU ĐƯỢC ỦNG HỘ MẠNH|không max/i);
    expect(text).toMatch(/ĐIỀU KIỆN|warm-up/i);
    expect(text).toMatch(/CHƯA BIẾT/i);
    expect(text).not.toMatch(/\d{2,3}%/);
  });

  it("LIVE confounded causal path stays humble", async () => {
    const { response, events } = await postMessage(
      "Volume giảm tuần này, nhưng tôi cũng ngủ nhiều hơn, ăn nhiều hơn và stress thấp hơn. Performance tốt lên. Có phải giảm volume là nguyên nhân không?",
    );
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";
    expect(response.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "done", model: "dante-confidence-engine" }),
    );
    expect(text).toMatch(/nhiều biến|không gán|volume alone|together/i);
  });

  it("TEST H: normal day keeps confidence mostly invisible at assess layer", () => {
    const message = "Ngủ đủ, recovery tốt, không đau gì, hôm nay tập submax bình thường.";
    const assessment = assessTurnConfidence({
      message,
      currentState: extractCurrentTurnState(message),
    });
    expect(assessment.keepMostlyInvisible).toBe(true);
  });

  it("TEST G: conditional pressing strategy is MODERATE", () => {
    const message =
      "Recovery good, slept 8h, right shoulder irritated overhead, no PR, want strength work.";
    const assessment = assessTurnConfidence({
      message,
      currentState: extractCurrentTurnState(message),
    });
    expect(
      assessment.claims.find((claim) => claim.claimId === "conditional_horizontal_press_submax")?.level,
    ).toBe("MODERATE");
  });
});
