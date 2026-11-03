/**
 * General-assistance continuity: a non-fitness task (LeetCode) and its terse follow-ups must reach the model
 * as a programming task, not be rerouted to recovery/nutrition or refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const provider = vi.hoisted(() => ({
  text: "",
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
import { protectCodeBlocks } from "@/lib/dante-core/runtime-convergence/finalize";
import { buildContextWorkingSet } from "@/lib/intelligence/performance-core/context-working-set";
import { createFakeCoherenceTable, fakeCoherenceFrom, type FakeCoherenceTable } from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SOLUTION =
  "Sort nums, then collect every index i where nums[i] === target.\n\n```ts\nfunction targetIndices(nums: number[], target: number): number[] {\n  const sorted = [...nums].sort((a, b) => a - b);\n  const out: number[] = [];\n  sorted.forEach((n, i) => { if (n === target) out.push(i); });\n  return out;\n}\n```";
const T1 = "Can you solve LeetCode 2089? Find target indices after sorting an array.";
const T2 = "Okay, give me the solution.";
const T3 = "Solution for the LeetCode above.";

function clientFor(table: FakeCoherenceTable) {
  const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
  };
}

type Msg = { role: "user" | "assistant"; content: string };

async function post(message: string, history: Msg[]) {
  const before = provider.prompts.length;
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [...history, { role: "user", content: message }] }),
    }),
  );
  const events = parseChatStreamChunk("", await response.text()).events;
  const text = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
  return {
    status: response.status,
    text,
    providerCalls: provider.prompts.length - before,
    prompt: provider.prompts.at(-1) ?? "",
  };
}

describe("general assistance continuity (LeetCode 2089)", () => {
  let table: FakeCoherenceTable;

  beforeEach(() => {
    table = createFakeCoherenceTable();
    provider.text = SOLUTION;
    provider.prompts.length = 0;
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
  });

  it("keeps the programming task across three turns", async () => {
    const history: Msg[] = [];
    for (const message of [T1, T2, T3]) {
      const turn = await post(message, history);
      expect(turn.status).toBe(200);
      expect(turn.providerCalls).toBe(1);
      // the code block reaches the user verbatim: newlines, indentation and the spread `...` intact
      expect(turn.text).toContain(SOLUTION.slice(SOLUTION.indexOf("```")));
      // ...and on its own line, or markdown renders the fence as inline text
      expect(turn.text).toMatch(/(^|\n)```ts\n/);
      // every follow-up carries the task that set the topic, even a follow-up to a follow-up
      if (message !== T1) expect(turn.prompt).toContain("LeetCode 2089");
      // ...and what Dante actually answered, so the model continues the same problem instead of re-guessing it
      if (message !== T1) expect(turn.prompt).toContain("YOUR PREVIOUS REPLY (for continuity of the task only");
      // the provider is told general/programming questions are in scope (a live gpt-4o-mini refused T1 without it)
      expect(turn.prompt).toContain("Do not refuse them as off-topic");
      history.push({ role: "user", content: message }, { role: "assistant", content: turn.text });
    }
  });

  it("a fenced block carrying context material is still dropped", () => {
    const dump = "Here you go.\n\n```json\n{\"recovery\": {\"todayScore\": 41}}\n```";
    const code = protectCodeBlocks(dump);
    expect(code.restore(code.prose)).toBe("Here you go.");
    const prompt = "```\nPERFORMANCE INTELLIGENCE BRIEF\n```";
    expect(protectCodeBlocks(prompt).restore(protectCodeBlocks(prompt).prose)).toBe("");
  });

  it("working set: a follow-up to a follow-up anchors on the message that set the topic", () => {
    expect(buildContextWorkingSet({ priorUserMessages: [T1], message: T2 }).followUpOf).toBe(T1);
    expect(buildContextWorkingSet({ priorUserMessages: [T1, T2], message: T3 }).followUpOf).toBe(`${T1}" → then: "${T2}`);
    expect(buildContextWorkingSet({ priorUserMessages: [T1], message: "What is the best rep range for hypertrophy in trained lifters?" }).followUpOf).toBeNull();
  });
});
