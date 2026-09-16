import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OpenAI migration (Dante's only LLM provider — no Groq/Gemini
 * fallback). Each test re-imports the module after `vi.resetModules()`
 * so the module-level cached client never leaks between tests that
 * intentionally vary OPENAI_API_KEY.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("openai", () => {
  class MockAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "APIError";
      this.status = status;
    }
  }

  class MockOpenAI {
    static APIError = MockAPIError;
    chat = { completions: { create: createMock } };
  }

  return { default: MockOpenAI };
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  createMock.mockReset();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_REASONING_EFFORT;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("supportsReasoningEffort", () => {
  it("recognizes reasoning-capable models (gpt-5 family, o-series, gpt-oss)", async () => {
    const { supportsReasoningEffort } = await import("@/lib/dante-core/llm-client");
    expect(supportsReasoningEffort("gpt-5.4-mini")).toBe(true);
    expect(supportsReasoningEffort("gpt-5")).toBe(true);
    expect(supportsReasoningEffort("GPT-5.4-Mini")).toBe(true);
    expect(supportsReasoningEffort("o3-mini")).toBe(true);
    expect(supportsReasoningEffort("o1-preview")).toBe(true);
    expect(supportsReasoningEffort("gpt-oss-120b")).toBe(true);
  });

  it("rejects models with no reasoning_effort support", async () => {
    const { supportsReasoningEffort } = await import("@/lib/dante-core/llm-client");
    expect(supportsReasoningEffort("gpt-4o")).toBe(false);
    expect(supportsReasoningEffort("gpt-4.1")).toBe(false);
    expect(supportsReasoningEffort("gpt-3.5-turbo")).toBe(false);
  });
});

describe("reasoning_effort request gating", () => {
  it("includes reasoning_effort in the request for a reasoning-capable model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-5.4-mini";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "ok" } }] });

    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    await callDanteLlm("hello");

    const [body] = createMock.mock.calls[0] as [Record<string, unknown>];
    expect(body).toHaveProperty("reasoning_effort", "low");
  });

  it("omits reasoning_effort cleanly for a model that doesn't support it", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-4o";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "ok" } }] });

    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    await callDanteLlm("hello");

    const [body] = createMock.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("respects OPENAI_REASONING_EFFORT for a reasoning-capable model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "o3-mini";
    process.env.OPENAI_REASONING_EFFORT = "high";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "ok" } }] });

    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    await callDanteLlm("hello");

    const [body] = createMock.mock.calls[0] as [Record<string, unknown>];
    expect(body).toHaveProperty("reasoning_effort", "high");
  });

  it("also omits reasoning_effort in the tool-calling path for a non-reasoning model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-4o";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "final answer" } }] });

    const { callDanteAgentTurn } = await import("@/lib/dante-core/llm-client");
    await callDanteAgentTurn([{ role: "user", content: "hi" }], []);

    const [body] = createMock.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});

describe("PROVIDER_FAILURE handling", () => {
  it("wraps a generic thrown error in OpenAiProviderError (callDanteAgentTurn)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockRejectedValueOnce(new Error("connection reset"));

    const { callDanteAgentTurn, OpenAiProviderError } = await import("@/lib/dante-core/llm-client");
    await expect(callDanteAgentTurn([{ role: "user", content: "hi" }], [])).rejects.toBeInstanceOf(
      OpenAiProviderError,
    );
  });

  it("preserves the HTTP status from an OpenAI APIError for downstream categorization", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { default: MockOpenAI } = (await import("openai")) as unknown as {
      default: { APIError: new (message: string, status: number) => Error };
    };
    createMock.mockRejectedValueOnce(new MockOpenAI.APIError("rate limited", 429));

    const { callDanteAgentTurn } = await import("@/lib/dante-core/llm-client");

    await expect(callDanteAgentTurn([{ role: "user", content: "hi" }], [])).rejects.toMatchObject({
      status: 429,
    });
  });

  it("streamDanteLlmReply throws OpenAiProviderError when the stream request itself fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockRejectedValueOnce(new Error("stream setup failed"));

    const { streamDanteLlmReply, OpenAiProviderError } = await import("@/lib/dante-core/llm-client");
    const controller = new AbortController();

    async function drain() {
      // The request itself should throw before yielding anything — draining
      // confirms that, it never expects to see a delta.
      for await (const delta of streamDanteLlmReply("hello", controller.signal)) {
        void delta;
      }
    }

    await expect(drain()).rejects.toBeInstanceOf(OpenAiProviderError);
  });
});

describe("getOpenAiModel", () => {
  it("defaults to gpt-5.4-mini when OPENAI_MODEL is unset", async () => {
    const { getOpenAiModel } = await import("@/lib/dante-core/llm-client");
    expect(getOpenAiModel()).toBe("gpt-5.4-mini");
  });

  it("respects OPENAI_MODEL when set", async () => {
    process.env.OPENAI_MODEL = "gpt-5.4-turbo";
    const { getOpenAiModel } = await import("@/lib/dante-core/llm-client");
    expect(getOpenAiModel()).toBe("gpt-5.4-turbo");
  });
});

describe("callDanteLlm", () => {
  it("returns null without calling OpenAI when OPENAI_API_KEY is missing (no Groq fallback)", async () => {
    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    const result = await callDanteLlm("hello");

    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the reply with provider metadata on a normal completion", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "  Proceed with today's session.  " } }] });

    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    const result = await callDanteLlm("hello");

    expect(result).toEqual({ reply: "Proceed with today's session.", model: "gpt-5.4-mini", provider: "openai" });
  });

  it("never throws — returns null when the OpenAI request fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockRejectedValueOnce(new Error("network unavailable"));

    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    await expect(callDanteLlm("hello")).resolves.toBeNull();
  });

  it("returns null on an empty reply instead of an empty string", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });

    const { callDanteLlm } = await import("@/lib/dante-core/llm-client");
    await expect(callDanteLlm("hello")).resolves.toBeNull();
  });
});

describe("callDanteAgentTurn", () => {
  it("throws when OPENAI_API_KEY is missing", async () => {
    const { callDanteAgentTurn } = await import("@/lib/dante-core/llm-client");
    await expect(callDanteAgentTurn([{ role: "user", content: "hi" }], [])).rejects.toThrow(
      "OPENAI_API_KEY is missing",
    );
  });

  it("returns a final reply when the model responds with plain content", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "Here is your answer." } }] });

    const { callDanteAgentTurn } = await import("@/lib/dante-core/llm-client");
    const result = await callDanteAgentTurn([{ role: "user", content: "what is my state" }], []);

    expect(result).toEqual({ type: "final", reply: "Here is your answer." });
  });

  it("parses a tool call's JSON arguments", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "get_recovery_state", arguments: '{"foo":1}' } },
            ],
          },
        },
      ],
    });

    const { callDanteAgentTurn } = await import("@/lib/dante-core/llm-client");
    const result = await callDanteAgentTurn([{ role: "user", content: "check recovery" }], []);

    expect(result).toEqual({
      type: "tool_calls",
      toolCalls: [{ id: "call_1", name: "get_recovery_state", arguments: { foo: 1 } }],
    });
  });

  it("treats malformed tool-call JSON arguments as an empty object rather than throwing", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [{ id: "call_1", type: "function", function: { name: "get_recovery_state", arguments: "not json" } }],
          },
        },
      ],
    });

    const { callDanteAgentTurn } = await import("@/lib/dante-core/llm-client");
    const result = await callDanteAgentTurn([{ role: "user", content: "check recovery" }], []);

    expect(result).toEqual({
      type: "tool_calls",
      toolCalls: [{ id: "call_1", name: "get_recovery_state", arguments: {} }],
    });
  });

  it("throws OpenAiProviderError when the model returns neither content nor a tool call", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    createMock.mockResolvedValueOnce({ choices: [{ message: {} }] });

    const { callDanteAgentTurn, OpenAiProviderError } = await import("@/lib/dante-core/llm-client");
    await expect(callDanteAgentTurn([{ role: "user", content: "hi" }], [])).rejects.toBeInstanceOf(
      OpenAiProviderError,
    );
  });
});
