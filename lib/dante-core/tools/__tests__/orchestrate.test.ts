import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the tool-call loop itself (Part 10, Test Matrix E/K/L/M/O/P/R):
 *  E. write tool call -> pending confirmation created, no DB mutation yet
 *  R. same as E — a write never executes from this loop
 *  K. invalid tool arguments -> schema rejected before domain call
 *  L. unknown tool -> rejected
 *  M. domain/tool failure -> graceful response, no false success
 *  O. repeated identical tool call in one turn -> loop protection
 *  P. MAX_TOOL_ROUNDS is respected
 *
 * The real registry is mocked with two small fake tools so this test
 * never touches a real domain service or Supabase — only the loop's
 * own control flow.
 */

const { fakeReadTool, fakeWriteTool, createPendingActionMock } = vi.hoisted(() => {
  // Hand-built fake zod-shaped schemas (not the real zod) — vi.hoisted
  // runs before module imports are initialized, so the real `zod`
  // import can't be referenced safely inside this factory.
  const fakeReadTool = {
    name: "fake_read",
    description: "fake read",
    inputSchema: {
      safeParse(input: unknown) {
        if (typeof input !== "object" || input === null) return { success: false as const };
        const round = (input as Record<string, unknown>).round;
        if (round !== undefined && typeof round !== "number") return { success: false as const };
        return { success: true as const, data: { round } as { round?: number } };
      },
    },
    mode: "read" as const,
    risk: "low" as const,
    requiresConfirmation: false,
    execute: vi.fn(async (): Promise<{ ok: true; data: { value: number } } | { ok: false; error: string }> => ({ ok: true, data: { value: 42 } })),
  };

  const fakeWriteTool = {
    name: "fake_write",
    description: "fake write",
    inputSchema: {
      safeParse(input: unknown) {
        if (typeof input !== "object" || input === null) return { success: false as const };
        const amount = (input as Record<string, unknown>).amount;
        if (typeof amount !== "number") return { success: false as const };
        return { success: true as const, data: { amount } };
      },
    },
    mode: "write" as const,
    risk: "medium" as const,
    requiresConfirmation: true,
    summarize: (input: { amount: number }) => `Do the fake write of ${input.amount}`,
    execute: vi.fn(async () => ({ ok: true as const, data: { done: true } })),
  };

  const createPendingActionMock = vi.fn(async (_supabase: unknown, _userId: string, toolName: string, _args: unknown, summary: string) => ({
    actionId: "action-1",
    toolName,
    summary,
    expiresAt: "2026-09-13T10:10:00.000Z",
  }));

  return { fakeReadTool, fakeWriteTool, createPendingActionMock };
});

vi.mock("@/lib/dante-core/tools/registry", () => {
  const tools = [fakeReadTool, fakeWriteTool];
  return {
    DANTE_TOOLS: tools,
    getDanteTool: (name: string) => tools.find((tool) => tool.name === name),
  };
});

vi.mock("@/lib/dante-core/tools/pending-actions", () => ({
  createPendingAction: createPendingActionMock,
}));

import { runDanteAgentTurn } from "@/lib/dante-core/tools/orchestrate";
import type { DanteAgentTurnResult, DanteChatMessage, DanteToolSpec } from "@/lib/dante-core/llm-client";

const context = { supabase: {} as never, userId: "user-1", now: new Date("2026-09-13T10:00:00.000Z") };

function toolCallTurn(id: string, name: string, args: unknown): DanteAgentTurnResult {
  return { type: "tool_calls", toolCalls: [{ id, name, arguments: args }] };
}

function finalTurn(reply: string): DanteAgentTurnResult {
  return { type: "final", reply };
}

describe("runDanteAgentTurn", () => {
  beforeEach(() => {
    fakeReadTool.execute.mockClear();
    fakeWriteTool.execute.mockClear();
    createPendingActionMock.mockClear();
  });

  it("executes a read tool and returns the model's final reply", async () => {
    const callModel = vi
      .fn<(messages: DanteChatMessage[], tools: DanteToolSpec[]) => Promise<DanteAgentTurnResult>>()
      .mockResolvedValueOnce(toolCallTurn("1", "fake_read", {}))
      .mockResolvedValueOnce(finalTurn("Here is your answer."));

    const envelope = await runDanteAgentTurn(context, "what is my state", { callModel });

    expect(envelope.reply).toBe("Here is your answer.");
    expect(fakeReadTool.execute).toHaveBeenCalledTimes(1);
    expect(envelope.toolTraceSummary).toEqual(["Checked fake_read"]);
  });

  it("a write tool call creates a pending confirmation and never executes (Test E / Test R)", async () => {
    const callModel = vi.fn().mockResolvedValueOnce(toolCallTurn("1", "fake_write", { amount: 5 }));

    const envelope = await runDanteAgentTurn(context, "add 5 to my thing", { callModel });

    expect(fakeWriteTool.execute).not.toHaveBeenCalled();
    expect(createPendingActionMock).toHaveBeenCalledWith(context.supabase, context.userId, "fake_write", { amount: 5 }, "Do the fake write of 5", context.now);
    expect(envelope.pendingConfirmation).toEqual({ actionId: "action-1", toolName: "fake_write", summary: "Do the fake write of 5" });
  });

  it("rejects invalid tool arguments before any domain call, then continues the loop (Test K)", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(toolCallTurn("1", "fake_write", { amount: "not-a-number" }))
      .mockResolvedValueOnce(finalTurn("I could not do that."));

    const envelope = await runDanteAgentTurn(context, "add banana to my thing", { callModel });

    expect(fakeWriteTool.execute).not.toHaveBeenCalled();
    expect(createPendingActionMock).not.toHaveBeenCalled();
    expect(envelope.reply).toBe("I could not do that.");
  });

  it("rejects an unknown tool name and continues the loop (Test L)", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(toolCallTurn("1", "delete_everything", {}))
      .mockResolvedValueOnce(finalTurn("That is not something I can do."));

    const envelope = await runDanteAgentTurn(context, "delete everything", { callModel });

    expect(envelope.reply).toBe("That is not something I can do.");
  });

  it("a tool failure is reported back to the model, never a false success (Test M)", async () => {
    fakeReadTool.execute.mockResolvedValueOnce({ ok: false as const, error: "database unavailable" });

    const callModel = vi
      .fn()
      .mockResolvedValueOnce(toolCallTurn("1", "fake_read", {}))
      .mockResolvedValueOnce(finalTurn("I could not check that right now."));

    const envelope = await runDanteAgentTurn(context, "what is my state", { callModel });

    expect(envelope.reply).toBe("I could not check that right now.");
    expect(envelope.toolTraceSummary).toEqual([]); // no success label recorded for a failed call
  });

  it("refuses to repeat the exact same tool call twice in one turn (Test O)", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(toolCallTurn("1", "fake_read", { round: 1 }))
      .mockResolvedValueOnce(toolCallTurn("2", "fake_read", { round: 1 })) // identical call repeated
      .mockResolvedValueOnce(finalTurn("Done."));

    const envelope = await runDanteAgentTurn(context, "check twice", { callModel });

    expect(fakeReadTool.execute).toHaveBeenCalledTimes(1);
    expect(envelope.reply).toBe("Done.");
  });

  it("includes the caller-supplied temporal context verbatim in its system prompt, never recomputing it (Test H)", async () => {
    const temporalContext = {
      timezone: "Asia/Singapore",
      localDate: "2026-09-14",
      localTime: "00:37",
      localDateTime: "2026-09-14 00:37",
      utcDateTime: "2026-09-13T16:37:00.000Z",
    };

    const callModel = vi.fn().mockResolvedValueOnce(finalTurn("It's 00:37."));

    await runDanteAgentTurn(
      { ...context, timezone: "Asia/Singapore", temporalContext },
      "what time is it?",
      { callModel },
    );

    const [messages] = callModel.mock.calls[0] as [DanteChatMessage[], DanteToolSpec[]];
    const systemMessage = messages.find((message) => message.role === "system");

    expect(systemMessage?.content).toContain("Timezone: Asia/Singapore");
    expect(systemMessage?.content).toContain("Local date: 2026-09-14");
    expect(systemMessage?.content).toContain("Local time: 00:37");
  });

  it("tells the model the local time zone is unavailable rather than fabricating one (Test E)", async () => {
    const callModel = vi.fn().mockResolvedValueOnce(finalTurn("I'm not sure of your local time."));

    await runDanteAgentTurn(context, "what time is it?", { callModel });

    const [messages] = callModel.mock.calls[0] as [DanteChatMessage[], DanteToolSpec[]];
    const systemMessage = messages.find((message) => message.role === "system");

    expect(systemMessage?.content).toContain("not available");
    expect(systemMessage?.content).not.toContain("Timezone:");
  });

  it("stops after MAX_TOOL_ROUNDS and never loops forever (Test P)", async () => {
    const callModel = vi.fn((_messages: DanteChatMessage[], _tools: DanteToolSpec[]) => {
      const round = callModel.mock.calls.length; // 1-indexed after this call is recorded
      return Promise.resolve(toolCallTurn(String(round), "fake_read", { round }));
    });

    const envelope = await runDanteAgentTurn(context, "keep checking", { callModel });

    expect(callModel).toHaveBeenCalledTimes(4); // MAX_TOOL_ROUNDS
    expect(fakeReadTool.execute).toHaveBeenCalledTimes(4);
    expect(envelope.reply.length).toBeGreaterThan(0);
    expect(envelope.pendingConfirmation).toBeUndefined();
  });
});
