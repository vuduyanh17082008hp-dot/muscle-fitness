/**
 * H0 cluster C — TOOL / MUTATION TRUTH.
 *
 *   TOOL_REQUESTED != TOOL_EXECUTED != TOOL_CONFIRMED · MODEL_SAYS_SUCCESS != MUTATION_SUCCESS
 *
 * A. The provider configuration that broke every tool round (reasoning_effort + function tools on gpt-5.x).
 * B. guardMutationClaims: model text can never establish a mutation; only a receipt can.
 * C. Through the real route: a failed tool path is a truthful status, and prose claims never reach the client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const provider = vi.hoisted(() => ({ text: "", prompts: [] as string[], agentError: null as Error | null }));

vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: provider.text };
    yield { kind: "model", model: "stub-provider" };
  },
}));

vi.mock("@/lib/dante-core/llm-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dante-core/llm-client")>();
  return {
    ...actual,
    callDanteLlm: vi.fn(async () => null),
    callDanteAgentTurn: vi.fn(async () => {
      if (provider.agentError) throw provider.agentError;
      return { type: "final", reply: "ok" };
    }),
  };
});

import { POST } from "@/app/api/chatbot/route";
import { chatCompletionTuning } from "@/lib/dante-core/llm-client";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { guardMutationClaims } from "@/lib/dante-core/tools/action-response-guard";
import { finalizeDanteResponse } from "@/lib/dante-core/runtime-convergence/finalize";
import { defaultPersonaContract } from "@/lib/dante-core/runtime-convergence/emit";
import { createClient } from "@/lib/supabase/server";
import { createFakeCoherenceTable, fakeCoherenceFrom } from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-0000000000c1";

describe("A. provider configuration for function tools", () => {
  it("gpt-5.x tool calls send reasoning_effort 'none' (the only value /v1/chat/completions accepts with tools)", () => {
    expect(chatCompletionTuning("gpt-5.4-mini", 0.2, { functionTools: true })).toEqual({ reasoning_effort: "none" });
  });
  it("plain gpt-5.x calls keep the configured effort", () => {
    expect(chatCompletionTuning("gpt-5.4-mini", 0.3)).toHaveProperty("reasoning_effort");
    expect(chatCompletionTuning("gpt-5.4-mini", 0.3)).not.toEqual({ reasoning_effort: "none" });
  });
  it("a non-reasoning model gets temperature either way", () => {
    expect(chatCompletionTuning("gpt-4o-mini", 0.2, { functionTools: true })).toEqual({ temperature: 0.2 });
  });
});

const guard = (reply: string, receipt = false, pending = false, language: "en" | "vi" = "en") => guardMutationClaims(reply, { receipt, pending, language });

describe("B. MODEL_SAYS_SUCCESS != MUTATION_SUCCESS", () => {
  it.each([
    "Two eggs have been logged successfully.",
    "Confirmed.",
    "Logging 2 eggs now.",
    "Searching for the nutritional information now.",
    "Your current body weight is now recorded as 60 kg.",
    "I've added the banana to your snack.",
    "I have scheduled leg day for tomorrow.",
    "Your weight has been updated to 60 kg.",
    "I'm logging that for you.",
    "Done!",
  ])("removes the unbacked claim: %s", (claim) => {
    const out = guard(`${claim} Anything else for today?`);
    expect(out).not.toContain(claim.replace(/\.$/, ""));
    expect(out).toMatch(/^Nothing has been logged or saved to your records/);
    expect(out).toMatch(/Anything else for today\?/);
  });

  it("Vietnamese claims are removed too", () => {
    const out = guard("Mình đã ghi 2 quả trứng vào bữa sáng.", false, false, "vi");
    expect(out).not.toMatch(/đã ghi 2 quả trứng/);
    expect(out).toMatch(/^Chưa có gì được ghi hay lưu/);
  });

  it.each([
    "Nothing has been saved yet.",
    "Once you confirm, it will be logged.",
    "Side effects have been recorded in trials.",
    "Your log shows 3 eggs this morning.",
    "I haven't logged anything.",
    "You can log it from the food page.",
  ])("leaves a truthful sentence untouched: %s", (sentence) => {
    expect(guard(sentence)).toBe(sentence);
  });

  it("a pending action gets the waiting line, not the nothing-changed line", () => {
    expect(guard("Logged 3 eggs.", false, true)).toMatch(/^This is waiting for your confirmation/);
  });

  it("a real receipt lets the claim through unchanged", () => {
    expect(guard("Two eggs have been logged successfully.", true)).toBe("Two eggs have been logged successfully.");
  });

  it("the Phase 1 finalizer applies it on every path, even with no toolState at all", () => {
    const out = finalizeDanteResponse({
      draft: "Two eggs have been logged successfully. Your recovery looks fine.",
      decisionObject: null,
      semanticState: null,
      contextCapsule: null,
      personaContract: defaultPersonaContract("en"),
      routeMetadata: { sourceBranch: "NORMAL_PROVIDER", timestamp: "2026-10-16T10:00:00.000Z" },
      discourseState: null,
      toolState: null,
    } as Parameters<typeof finalizeDanteResponse>[0]);
    expect(out.response).not.toMatch(/logged successfully/);
    expect(out.response).toMatch(/Nothing has been logged or saved/);
  });
});

function clientFor() {
  const from = fakeCoherenceFrom(createFakeCoherenceTable(), { timezone: "Asia/Singapore" });
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
    rpc: vi.fn(async () => ({ data: [{ allowed: true, remaining: 10, retry_after_seconds: 0 }], error: null })),
  };
}

async function post(message: string): Promise<{ text: string; done?: ChatStreamEvent; providerCalls: number }> {
  const before = provider.prompts.length;
  const response = await POST(new Request("http://localhost/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }) }));
  const raw = await response.text();
  const events: ChatStreamEvent[] = response.status === 200 ? parseChatStreamChunk("", raw).events : [];
  const delta = events.filter((e) => e.type === "delta").map((e) => (e.type === "delta" ? e.text : "")).join("");
  return { text: delta, done: events.find((e) => e.type === "done"), providerCalls: provider.prompts.length - before };
}

describe("C. through the real route", () => {
  beforeEach(() => {
    provider.prompts = [];
    provider.agentError = null;
    provider.text = "";
    vi.mocked(createClient).mockResolvedValue(clientFor() as never);
  });

  it("a failed tool path returns a truthful status that restates the request — never the prose path", async () => {
    provider.agentError = Object.assign(new Error("400 Function tools with reasoning_effort are not supported"), { status: 400 });
    provider.text = "Logging 150g greek yogurt now. Confirmed.";
    const turn = await post("add 150g greek yogurt to my snack");
    expect(turn.text).toMatch(/nothing was logged or changed/);
    expect(turn.text).toMatch(/add 150g greek yogurt to my snack/);
    expect(turn.text).not.toMatch(/Confirmed|Logging .* now/);
    expect(turn.providerCalls).toBe(0);
    expect(turn.done && turn.done.type === "done" ? turn.done.pendingConfirmation : "x").toBeNull();
    expect(turn.done && turn.done.type === "done" ? turn.done.model : "").toBe("dante-tool-failure");
  });

  it("prose that claims a write never reaches the client on the normal provider path", async () => {
    provider.text = "Two eggs have been logged successfully. Your recovery looks fine for training.";
    const turn = await post("what should I know about protein timing after training");
    expect(turn.text).not.toMatch(/logged successfully/);
  });
});

describe("D. live-run fixes (cluster C)", () => {
  it.each([
    "Leg day will be scheduled for tomorrow.",
    "Let's look up the macros for boiled eggs. Please hold on for a moment.",
    "Logged 3 eggs.",
  ])("fake future / in-progress mutation is a claim: %s", (text) => {
    expect(guard(text)).toMatch(/^Nothing has been logged or saved/);
  });
  it("'once you confirm, it will be logged' is a condition, not a claim", () => {
    expect(guard("Once you confirm, it will be logged.")).toBe("Once you confirm, it will be logged.");
  });
  it("the claim validator never turns 'nothing has been saved yet' into a double negative", async () => {
    const { validateOutputClaims } = await import("@/lib/dante-core/adaptive-coach-v2/output-claim-validator");
    expect(validateOutputClaims).toBeTypeOf("function");
    const out = finalizeDanteResponse({
      draft: "I'd like to: **Add 150 g Greek Yogurt to snack**. Confirm to proceed, or cancel — nothing has been saved yet.",
      decisionObject: null, semanticState: null, contextCapsule: null, personaContract: defaultPersonaContract("en"),
      routeMetadata: { sourceBranch: "TOOL", timestamp: "2026-10-16T10:00:00.000Z" }, discourseState: null,
      toolState: { permission: "CONFIRMATION_REQUIRED", persisted: false },
    } as Parameters<typeof finalizeDanteResponse>[0]);
    expect(out.response).not.toMatch(/has not saved/);
    expect(out.response).toMatch(/nothing has been saved yet/);
  });
  it.each(["log 3 boiled eggs", "log 2 eggs and tell me if my recovery is ok", "log 2 slices of toast for breakfast", "schedule leg day for tomorrow", "thêm 2 quả trứng vào bữa sáng"])("%s is action-shaped", async (message) => {
    const { isAgentToolIntent } = await import("@/lib/dante-core/tools/detect-intent");
    expect(isAgentToolIntent(message)).toBe(true);
  });
  it.each(["what should I log for breakfast?", "how do I log food?", "is a log of my sleep useful?"])("%s is not", async (message) => {
    const { isAgentToolIntent } = await import("@/lib/dante-core/tools/detect-intent");
    expect(isAgentToolIntent(message)).toBe(false);
  });
});

describe("E. through the route: chat confirmation and profile updates are truthful", () => {
  beforeEach(() => {
    provider.prompts = [];
    provider.text = "Confirmed. Your weight has been updated.";
    vi.mocked(createClient).mockResolvedValue(clientFor() as never);
  });
  it("'yes confirm' with nothing pending says so — never 'Confirmed.'", async () => {
    const turn = await post("yes confirm");
    expect(turn.text).not.toMatch(/^Confirmed/);
    expect(turn.text).toMatch(/nothing has been saved|Nothing has been logged|nothing waiting/i);
    expect(turn.providerCalls).toBe(0);
  });
  it("'update my profile' is a capability statement, never a narrated update", async () => {
    const turn = await post("I weigh 60 kg now, update my profile");
    expect(turn.text).toMatch(/can't change your profile from chat, so nothing has been saved/);
    expect(turn.text).toMatch(/I'll use 60 kg/);
    expect(turn.providerCalls).toBe(0);
  });
  it("an advice question about changing a goal is not hijacked", async () => {
    provider.text = "It depends on your current progress.";
    const turn = await post("should I change my goal to cutting?");
    expect(turn.text).not.toMatch(/can't change your profile/);
  });
});

describe("F. no false positives on past reads", () => {
  it.each(["Your latest check-in was recorded as 11 on October 11.", "That session was logged as 45 minutes."])("%s is a read, not a claim", (sentence) => {
    expect(guard(sentence)).toBe(sentence);
  });
  it("'is now recorded as 60 kg' is still a claim", () => {
    expect(guard("Your weight is now recorded as 60 kg.")).toMatch(/^Nothing has been logged/);
  });
});

describe("G. claims are about the user's records, not any 'has been' sentence", () => {
  it.each([
    "Magnesium has been added to many sleep blends.",
    "The benefit has been confirmed in some athletes but not others.",
    "This topic is now set in the wider literature as uncertain.",
  ])("%s is not a mutation claim", (sentence) => {
    expect(guard(sentence)).toBe(sentence);
  });
  it.each(["Your weight has been updated to 60 kg.", "I've added the banana to your snack.", "Leg day will be scheduled for tomorrow."])("%s still is", (sentence) => {
    expect(guard(sentence)).toMatch(/^Nothing has been logged/);
  });
});
