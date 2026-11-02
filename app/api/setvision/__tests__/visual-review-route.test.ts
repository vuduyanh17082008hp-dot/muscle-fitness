import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/chatbot-rate-limit", () => ({ checkDanteRateLimit: vi.fn() }));
vi.mock("@/lib/ai/vision-client", () => ({ isVisionConfigured: vi.fn(() => true), visionJson: vi.fn() }));

import { POST } from "@/app/api/setvision/visual-review/route";
import { createClient } from "@/lib/supabase/server";
import { checkDanteRateLimit } from "@/lib/chatbot-rate-limit";
import { isVisionConfigured, visionJson } from "@/lib/ai/vision-client";

const still = "data:image/jpeg;base64," + "A".repeat(400);
const validBody = { exerciseLabel: "Leg Press", frames: [0, 1000, 2000, 3000].map((tMs) => ({ tMs, image: still })) };
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/setvision/visual-review", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

function signedIn(userId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { experience: "beginner", goal: null, physical_limitations: null } }) }) }) }),
  } as never);
}

const modelReply = {
  people_in_view: "one", multi_person_frames: [], edited_or_composite: false, exercise_match: "matches",
  seen_movement: "a leg press", view: "side", assessable: "yes", missing: "", filming_tip: "", observations: [],
};

describe("POST /api/setvision/visual-review — rejections happen before the model call", () => {
  beforeEach(() => {
    vi.mocked(visionJson).mockReset().mockResolvedValue(modelReply);
    vi.mocked(checkDanteRateLimit).mockReset().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 60 });
    vi.mocked(isVisionConfigured).mockReturnValue(true);
    signedIn("u1");
  });

  it("401 when signed out", async () => {
    signedIn(null);
    expect((await POST(req(validBody))).status).toBe(401);
    expect(visionJson).not.toHaveBeenCalled();
  });

  it("413 on an oversized body (declared or actual)", async () => {
    expect((await POST(req(validBody, { "content-length": "5000000" }))).status).toBe(413);
    expect((await POST(req({ ...validBody, pad: "x".repeat(4_100_000) }))).status).toBe(413);
    expect(visionJson).not.toHaveBeenCalled();
  });

  it("400 on bad JSON, non-JPEG, too few/many frames, unordered timestamps", async () => {
    const bad = [
      "{nope",
      { ...validBody, frames: validBody.frames.map((f) => ({ ...f, image: "data:image/png;base64,AAAA" })) },
      { ...validBody, frames: validBody.frames.slice(0, 3) },
      { ...validBody, frames: Array.from({ length: 13 }, (_, i) => ({ tMs: i * 100, image: still })) },
      { ...validBody, frames: [...validBody.frames].reverse() },
      { ...validBody, exerciseLabel: "" },
    ];
    for (const body of bad) expect((await POST(req(body))).status).toBe(400);
    expect(visionJson).not.toHaveBeenCalled();
    expect(checkDanteRateLimit).not.toHaveBeenCalled(); // invalid requests don't burn quota
  });

  it("429 with Retry-After when the durable per-user quota is spent; 503 when the limiter is down", async () => {
    vi.mocked(checkDanteRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
    const limited = await POST(req(validBody));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("42");
    vi.mocked(checkDanteRateLimit).mockRejectedValueOnce(new Error("down"));
    expect((await POST(req(validBody))).status).toBe(503);
    expect(visionJson).not.toHaveBeenCalled();
  });

  it("409 for a second concurrent review by the same user", async () => {
    let release!: () => void;
    vi.mocked(visionJson).mockImplementationOnce(() => new Promise((r) => (release = () => r(modelReply))));
    const first = POST(req(validBody));
    await vi.waitFor(() => expect(visionJson).toHaveBeenCalledTimes(1));
    expect((await POST(req(validBody))).status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect((await POST(req(validBody))).status).toBe(200); // slot freed afterwards
  });

  it("200 sends our frame times, deterministic sampling, and no secrets or prompt in the response", async () => {
    const res = await POST(req(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.review.status).toBe("NO_SUPPORTED_ISSUE_OBSERVED");
    expect(json.personalized).toBe(true);
    const args = vi.mocked(visionJson).mock.calls[0];
    expect(args[6]).toEqual({ temperature: 0, seed: 7 });
    expect(JSON.stringify(json)).not.toMatch(/careful strength coach|OPENAI|sk-/);
  });

  it("502 with a safe message when the model fails", async () => {
    vi.mocked(visionJson).mockResolvedValueOnce(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/temporarily unavailable/);
  });
});
