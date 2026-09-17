import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";

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
        throw new Error(`Unexpected table access before safety short-circuit: ${table}`);
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

async function postMessage(
  message: string,
  priorMessages: string[] = [],
): Promise<{ response: Response; events: ChatStreamEvent[] }> {
  const response = await POST(new Request("http://localhost/api/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      messages: [...priorMessages, message].map((content) => ({ role: "user", content })),
    }),
  }));
  const raw = await response.text();
  const parsed = parseChatStreamChunk("", raw);
  return { response, events: parsed.events };
}

describe("POST /api/chatbot deterministic safety paths", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(authenticatedClient() as never);
  });

  it("returns a complete no-1RM stream for symptomatic shoulder plus good recovery", async () => {
    const previousMessage = "I slept 4 hours, recovery is 42, my shoulder feels irritated, but I want to PR bench today.";
    const { response, events } = await postMessage(
      "My shoulder feels slightly irritated, I slept 8 hours, recovery is good, but I want to test a 1RM today.",
      [previousMessage],
    );

    expect(response.status).toBe(200);
    expect(events).toEqual([
      expect.objectContaining({
        type: "delta",
        text: expect.stringMatching(/do not attempt|not a good day to force a max attempt/i),
      }),
      expect.objectContaining({
        type: "done",
        safetyTriggered: true,
        safetyCategory: "composed_training_risk",
      }),
    ]);
    expect(events[0]).toEqual(expect.objectContaining({
      type: "delta",
      text: expect.not.stringMatching(/major sleep loss|low recovery|sleep deprivation|recovery (?:is )?(?:42|low)/i),
    }));
  });
});
