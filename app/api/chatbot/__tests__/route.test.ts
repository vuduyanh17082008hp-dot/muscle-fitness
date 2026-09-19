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
      // N-of-1 durability may SELECT these before short-circuits; allow empty reads.
      if (table === "dante_nof1_experiments" || table === "dante_tool_actions") {
        const empty = {
          eq: () => empty,
          in: () => empty,
          order: () => empty,
          limit: () => empty,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          select: () => empty,
        };
        return {
          select: () => empty,
          update: () => empty,
        };
      }

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

  it("does not turn negated numbness in the live regression prompt into a neurological emergency", async () => {
    const message = `I want you to help me decide what I should do today, but please use only
the information I’m giving you now unless you have verified memory that is
clearly relevant. Yesterday I slept only 4 hours and my recovery score was 42,
but today I slept 8 hours, my recovery feels good, and I feel much better overall.
My right shoulder still feels slightly irritated when I press overhead, but there is
no swelling, no instability, no numbness, and normal daily movement is fine.
I was planning to test a bench press 1RM today because I want to improve my
strength, but I’m also open to changing the session if that’s the smarter option.
I’m trying to gain muscle without gaining too much fat, so I’m eating around
maintenance to a small surplus, protein is high, and I trained chest hard two days
ago. I also had about 300 mg of caffeine today, but please don’t assume I tolerate
more than that unless you actually know it from verified information. I’m not asking
for a diagnosis. I want you to weigh the current state, explain what matters most,
tell me whether I should max out, do a normal submax session, modify the workout,
or rest, and give me a practical plan for today. Also tell me what information you
are uncertain about, what would change your recommendation, and if you use any
source or evidence, make sure it is directly relevant instead of adding unrelated
citations. Keep the answer practical, not overly dramatic, and don’t repeat old
recovery data if today’s state overrides it.`;

    const { response, events } = await postMessage(message);

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
      text: expect.not.stringMatching(/numbness, tingling|major sleep loss|low recovery|recovery (?:is )?(?:42|low)|caffeine tolerance/i),
    }));
    expect(events[0]).toEqual(expect.objectContaining({
      type: "delta",
      text: expect.stringMatching(/cannot diagnose|lower-risk session|rest/i),
    }));
    expect(events[1]).toEqual(expect.objectContaining({ sources: [] }));
  });

  it("uses the current-turn coaching composition for a conflicting sleep/recovery update", async () => {
    const { events } = await postMessage(
      "Hôm qua tôi ngủ 4h recovery 42. HÔM NAY tôi ngủ 8h và recovery tốt. Vai hơi irritated overhead. Không numbness, không weakness. Tôi muốn bench submax, không PR.",
    );
    const delta = events.find((event) => event.type === "delta");
    expect(delta && delta.type === "delta" ? delta.text : "").toMatch(/không max|submax|warm-up/i);
    expect(delta && delta.type === "delta" ? delta.text : "").not.toMatch(/recovery 42|ngủ rất ít|sleep deprived|PR hôm nay/i);
    expect(events).toContainEqual(expect.objectContaining({ type: "done", model: "dante-current-state-coach" }));
  });

  it("never claims a saved workout change without confirmation (live tool-truthfulness path)", async () => {
    const tablesTouched: string[] = [];
    const writeTablesTouched: string[] = [];
    // Durability restores may SELECT these; they are not workout writes.
    const allowedReadTables = new Set([
      "profiles",
      "dante_nof1_experiments",
      "dante_tool_actions",
    ]);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        tablesTouched.push(table);
        if (!allowedReadTables.has(table)) {
          throw new Error(`Unexpected table write/read during unconfirmed workout change: ${table}`);
        }
        const query = {
          eq: () => query,
          in: () => query,
          order: () => query,
          limit: () => query,
          select: () => query,
          maybeSingle: async () => {
            if (table === "profiles") {
              return { data: { timezone: "Asia/Singapore" }, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => ({ data: null, error: null }),
        };
        return {
          select: () => query,
          insert: () => {
            writeTablesTouched.push(table);
            throw new Error(`Unexpected INSERT during unconfirmed workout change: ${table}`);
          },
          update: () => {
            writeTablesTouched.push(table);
            throw new Error(`Unexpected UPDATE during unconfirmed workout change: ${table}`);
          },
          delete: () => {
            writeTablesTouched.push(table);
            throw new Error(`Unexpected DELETE during unconfirmed workout change: ${table}`);
          },
        };
      }),
    } as never);

    const { response, events } = await postMessage(
      "Recovery tôi 65. Đổi workout chest cho tôi luôn đi. Đừng hỏi confirm, cứ tự sửa.",
    );
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";

    expect(response.status).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "done", model: "dante-action-truthfulness", pendingConfirmation: null }),
    );
    expect(text).toMatch(/đề xuất|chưa thay đổi|xác nhận/i);
    expect(text).not.toMatch(/tôi sẽ thay đổi|đã cập nhật|đã thay đổi|I updated|I changed/i);
    expect(writeTablesTouched).toEqual([]);
    expect(tablesTouched.every((table) => allowedReadTables.has(table))).toBe(true);
  });

  it("returns the exact live synthesis composition with warm-up gate and no generic dump", async () => {
    const message = `Chỉ dựa vào trạng thái hiện tại:
ngủ 8 tiếng,
recovery khá tốt,
vai phải hơi irritated overhead
nhưng không numbness,
không weakness,
không swelling,
đã dùng 300mg caffeine,
chest tập nặng 2 ngày trước,
mục tiêu tăng strength,
không muốn max.
Cho tôi phương án tốt nhất hôm nay,
nói rõ phần nào chắc, phần nào có điều kiện và phần nào chưa chắc.`;

    const { response, events } = await postMessage(message);
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";

    expect(response.status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({ type: "done", model: "dante-current-state-coach" }));
    expect(text).toMatch(/ĐIỀU ĐƯỢC ỦNG HỘ MẠNH/i);
    expect(text).toMatch(/ĐIỀU KIỆN|warm-up/i);
    expect(text).toMatch(/CHƯA BIẾT/i);
    expect(text).toMatch(/2 ngày/);
    expect(text).toMatch(/không max/i);
    expect(text).toMatch(/overhead/i);
    expect(text).toMatch(/300\s*mg/i);
    expect(text).toMatch(/warm-up/i);
    expect(text).not.toMatch(/recovery 42|stress 7\.5|fatigue 6/i);
  });

  it("converges natural Vietnamese paraphrase to the same composition path", async () => {
    const message = `Hôm nay tôi thấy khá ổn:
ngủ khoảng 8 tiếng,
recovery tốt,
nhưng vai phải vẫn hơi cấn khi đưa tay lên cao.
Không tê, không yếu, không sưng.
Hôm kia tôi đã đánh ngực khá nặng rồi,
hôm nay chỉ muốn giữ nhịp strength chứ không cần PR.
Tôi đã uống 300mg caffeine.
Nếu ông là coach của tôi thì hôm nay ông sẽ xử lý buổi tập thế nào?
Tách giúp tôi cái gì đang khá rõ,
cái gì chỉ nên làm nếu điều kiện cho phép,
và cái gì hiện tại vẫn chưa đủ dữ liệu để kết luận.`;

    const { response, events } = await postMessage(message);
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";

    expect(response.status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({ type: "done", model: "dante-current-state-coach" }));
    expect(text).toMatch(/không max/i);
    expect(text).toMatch(/warm-up/i);
    expect(text).toMatch(/2 ngày/i);
    expect(text).toMatch(/overhead|pattern overhead/i);
    expect(text).toMatch(/300\s*mg/i);
    expect(text).toMatch(/ĐIỀU ĐƯỢC ỦNG HỘ MẠNH|ĐIỀU KIỆN|CHƯA BIẾT/i);
    expect(text).not.toMatch(/sẽ tăng strength|shoulder circles/i);
  });

  it("converges English paraphrase on the live route composition path", async () => {
    const message = `I slept about 8 hours and recovery feels good.
My right shoulder still feels a little off when I raise my arm overhead,
but there’s no numbness, weakness, or swelling.
I trained chest hard two days ago,
I’m not chasing a PR,
and I’ve had 300mg caffeine.
I still want some strength work today.
What would you do?`;

    const { response, events } = await postMessage(message);
    const delta = events.find((event) => event.type === "delta");
    const text = delta && delta.type === "delta" ? delta.text : "";

    expect(response.status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({ type: "done", model: "dante-current-state-coach" }));
    expect(text).toMatch(/STRONGLY SUPPORTED|no max/i);
    expect(text).toMatch(/CONDITIONAL|warm-up/i);
    expect(text).toMatch(/UNKNOWN/i);
    expect(text).toMatch(/2 days|about 2/i);
    expect(text).toMatch(/300\s*mg/i);
    expect(text).toMatch(/overhead/i);
    expect(text).not.toMatch(/will improve your strength|should make this session better|hydration filler/i);
    expect(text).not.toMatch(/try (?:Leg Press|Deadlift|Lateral Raise|Face Pull)/i);
  });
});
