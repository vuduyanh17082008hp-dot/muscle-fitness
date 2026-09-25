import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/dante-core/tools/pending-actions", () => ({
  createPendingAction: vi.fn(async () => ({
    actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    toolName: "accept_nof1_experiment",
    summary: "Confirm starting 7-day N-of-1 test: sleep duration",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  })),
  confirmPendingAction: vi.fn(),
  cancelPendingAction: vi.fn(),
}));

const durableActive = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  hypothesis: "Sleep improves performance when volume is stable.",
  rationale: "Competing causes",
  controlledVariables: ["training volume"],
  variableUnderTest: "sleep duration",
  primaryOutcome: "RPE / performance at comparable training sessions",
  secondaryOutcomes: [],
  experimentWindow: {
    start: "2026-09-10T00:00:00.000Z",
    end: "2026-09-17T00:00:00.000Z",
    durationDays: 7,
  },
  confounders: [] as string[],
  status: "ACTIVE" as const,
  userConfirmed: true,
  createdAt: "2026-09-10T00:00:00.000Z",
};

vi.mock("@/lib/dante-core/nof1-engine/persistence", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dante-core/nof1-engine/persistence")>(
    "@/lib/dante-core/nof1-engine/persistence",
  );
  return {
    ...actual,
    loadActiveNof1Experiment: vi.fn(async () => null),
    loadLatestFailedNof1Proposal: vi.fn(async () => null),
    updateNof1Experiment: vi.fn(async (_sb, _userId, id, patch) => ({
      success: true as const,
      data: {
        ...durableActive,
        id,
        status: patch.status ?? "ACTIVE",
        confounders: patch.confounders ?? [],
        conclusion: patch.conclusion,
        completedAt: patch.completedAt ?? undefined,
        protocolAdherence: patch.protocolAdherence,
      },
    })),
  };
});

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk, type ChatStreamEvent } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import { evaluateSocialBoundary } from "@/lib/dante-core/social-boundary-router";
import { createPendingAction } from "@/lib/dante-core/tools/pending-actions";
import {
  loadActiveNof1Experiment,
  loadLatestFailedNof1Proposal,
  updateNof1Experiment,
} from "@/lib/dante-core/nof1-engine/persistence";

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
  messages: string[],
): Promise<{ response: Response; events: ChatStreamEvent[]; text: string }> {
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messages[messages.length - 1],
        messages: messages.map((content) => ({ role: "user", content })),
      }),
    }),
  );
  const raw = await response.text();
  const parsed = parseChatStreamChunk("", raw);
  const delta = parsed.events.find((event) => event.type === "delta");
  const text = delta && delta.type === "delta" ? delta.text : "";
  return { response, events: parsed.events, text };
}

describe("nof1 — route integration", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(authenticatedClient() as never);
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue(null);
    vi.mocked(loadLatestFailedNof1Proposal).mockResolvedValue(null);
    vi.mocked(createPendingAction).mockClear();
    vi.mocked(updateNof1Experiment).mockClear();
  });

  it("LIVE CASE 1 — competing causes proposes micro-experiment", async () => {
    const { response, events, text } = await postMessages([
      "Ba tuần gần đây performance lúc tốt lúc tệ. Sleep và volume cũng đổi cùng lúc. Tôi không biết cái nào gây ra.",
    ]);
    expect(response.status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({ type: "done", model: "dante-nof1-engine" }));
    expect(text).toMatch(/micro-experiment|7 ngày|không chắc|không tự kích hoạt|Want me to track/i);
    expect(text).not.toMatch(/statistically significant|\bproves\b/i);
    expect(createPendingAction).not.toHaveBeenCalled();
  });

  it("LIVE CASE 2 — explicit accept creates Confirm pending write, not silent ACTIVE", async () => {
    const { response, events, text } = await postMessages([
      "Ba tuần gần đây performance lúc tốt lúc tệ. Sleep và volume cũng đổi cùng lúc. Tôi không biết cái nào gây ra.",
      "Ok, làm test 7 ngày đi.",
    ]);
    expect(response.status).toBe(200);
    expect(createPendingAction).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      "accept_nof1_experiment",
      expect.objectContaining({ variableUnderTest: "sleep duration" }),
      expect.any(String),
      expect.any(Date),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "done",
        model: "dante-nof1-engine",
        pendingConfirmation: expect.objectContaining({
          toolName: "accept_nof1_experiment",
        }),
      }),
    );
    expect(text).toMatch(/Confirm|chưa ghi|Nothing is persisted|Xác nhận/i);
    expect(text).not.toMatch(/đang ACTIVE|is ACTIVE/i);
  });

  it("LIVE CASE 3 — mid-experiment confounders recorded against durable ACTIVE", async () => {
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue({ ...durableActive });
    const { text } = await postMessages([
      "Hôm qua tôi đi nhậu và hôm nay lại tăng calories khá nhiều.",
    ]);
    expect(text).toMatch(/nhiễu|chưa sạch|not clean|không rút kết luận|will not force a conclusion/i);
    expect(text).not.toMatch(/\bCONFOUNDED\b/);
  });

  it("LIVE CASE 4 — clean outcome supports with MODERATE, not proof", async () => {
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue({ ...durableActive });
    const { text } = await postMessages([
      "Kết thúc test rồi. RPE giảm từ khoảng 8.5 xuống 7, reps tăng nhẹ, volume giữ gần như cũ, sleep tốt hơn.",
    ]);
    expect(text).toMatch(/nghiêng về giả thuyết|leans toward|MODERATE/i);
    expect(text).not.toMatch(/\bSUPPORTS\b/);
    expect(text).not.toMatch(/statistically significant|\bproved\b/i);
    expect(text).toMatch(/không phải kết luận nhân quả|not causal certainty/i);
  });

  it("NEGATIVE CONTROL — single bad session does not dump experiment machinery", async () => {
    const { text, events } = await postMessages([
      "Buổi hôm nay hơi tệ thôi. Mọi thứ khác bình thường.",
    ]);
    expect(events).not.toContainEqual(expect.objectContaining({ model: "dante-nof1-engine" }));
    expect(text).not.toMatch(/micro-experiment|ACTIVE|controlledVariables/i);
  });

  it("social competence bait does not auto-activate an experiment", () => {
    const social = evaluateSocialBoundary(
      "If you're actually smart, prove volume is the problem.",
    );
    expect(social.mode).toBe("ANTI_MANIPULATION");
  });

  it("cross-session restore: durable ACTIVE drives coaching without prior chat", async () => {
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue({ ...durableActive });
    const { text } = await postMessages(["What is my experiment tracking?"]);
    expect(text).toMatch(/underway|đang chạy|tracking|theo dõi/i);
    expect(text).not.toMatch(/\bACTIVE\b/);
    expect(text).toMatch(/sleep duration|training volume|RPE/i);
  });

  it("restores a failed activation instead of restarting eligibility", async () => {
    vi.mocked(loadLatestFailedNof1Proposal).mockResolvedValue({
      ...durableActive,
      id: "nof1:failed:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "ACTIVATION_FAILED",
      activationError: "PGRST205",
    });
    const { text } = await postMessages(["Experiment của tôi đang theo dõi cái gì?"]);
    expect(text).toMatch(/not activated|chưa chạy|save failed|lưu thất bại/i);
    expect(text).toMatch(/sleep duration|training volume|RPE/i);
    expect(createPendingAction).not.toHaveBeenCalled();
  });

  it("retry after failed activation reuses proposal and creates Confirm", async () => {
    vi.mocked(loadLatestFailedNof1Proposal).mockResolvedValue({
      ...durableActive,
      id: "nof1:failed:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "ACTIVATION_FAILED",
      activationError: "PGRST205",
    });
    const { events } = await postMessages(["Retry."]);
    expect(createPendingAction).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      "accept_nof1_experiment",
      expect.objectContaining({ variableUnderTest: "sleep duration" }),
      expect.any(String),
      expect.any(Date),
    );
    expect(events).toContainEqual(expect.objectContaining({
      type: "done",
      pendingConfirmation: expect.objectContaining({ toolName: "accept_nof1_experiment" }),
    }));
  });

  it("failed activation does not record confounders or outcomes", async () => {
    vi.mocked(loadLatestFailedNof1Proposal).mockResolvedValue({
      ...durableActive,
      id: "nof1:failed:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "ACTIVATION_FAILED",
      activationError: "PGRST205",
    });
    const { text } = await postMessages(["I went drinking and calories increased 700."]);
    expect(text).toMatch(/never became active|chưa từng chạy|never became ACTIVE|chưa từng ACTIVE/i);
    expect(updateNof1Experiment).not.toHaveBeenCalled();
  });

  it("active lifecycle routing wins before generic nutrition and persists confounders", async () => {
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue({ ...durableActive });
    const { text, events } = await postMessages([
      "Hôm qua tôi đi nhậu và hôm nay calories tăng thêm khoảng 700.",
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: "done", model: "dante-nof1-engine" }));
    expect(text).toMatch(/nhiễu|not clean|chưa sạch|không rút kết luận/i);
    expect(text).not.toMatch(/\bCONFOUNDED\b/);
    expect(updateNof1Experiment).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      durableActive.id,
      expect.objectContaining({
        status: "CONFOUNDED",
        confounders: expect.arrayContaining(["alcohol", "calorie_change"]),
      }),
    );
  });

  it("confounded completion remains INCONCLUSIVE, never automatic SUPPORTS", async () => {
    vi.mocked(loadActiveNof1Experiment).mockResolvedValue({
      ...durableActive,
      status: "CONFOUNDED",
      confounders: ["alcohol", "calorie_change"],
      protocolAdherence: "POOR",
    });
    const { text } = await postMessages([
      "Kết thúc test rồi. RPE giảm từ 8.5 xuống 7, reps tăng nhẹ, volume gần như giữ nguyên, sleep tốt hơn.",
    ]);
    expect(text).toMatch(/chưa đủ để nghiêng|inconclusive/i);
    expect(text).not.toMatch(/\bSUPPORTS\b|SUPPORTS giả thuyết|result: SUPPORTS/i);
    expect(updateNof1Experiment).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      durableActive.id,
      expect.objectContaining({
        status: "CONFOUNDED",
        conclusion: expect.objectContaining({ result: "INCONCLUSIVE" }),
      }),
    );
  });
});
