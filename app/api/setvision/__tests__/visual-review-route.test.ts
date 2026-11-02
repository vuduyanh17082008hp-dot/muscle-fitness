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
  exercise_match_confidence: "high", match_frames: [1, 2], match_evidence: "Feet on a sled platform.",
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
    const gate = new Promise((r) => (release = () => r(modelReply)));
    vi.mocked(visionJson).mockImplementation(() => gate);
    const first = POST(req(validBody));
    await vi.waitFor(() => expect(visionJson).toHaveBeenCalledTimes(2)); // two independent passes, in parallel
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
    expect(vi.mocked(visionJson).mock.calls[1][6]).toEqual({ temperature: 0, seed: 11 }); // second, independent pass
    expect(checkDanteRateLimit).toHaveBeenCalledTimes(1); // one quota unit per review
    expect(JSON.stringify(json)).not.toMatch(/careful strength coach|OPENAI|sk-/);
  });

  it("resolves the exercise on the server: unknown keys and invalid custom names fail before quota or model", async () => {
    expect((await POST(req({ ...validBody, exerciseKey: "catalogue:not-a-thing" }))).status).toBe(400);
    expect((await POST(req({ ...validBody, exerciseKey: null, exerciseLabel: "\u0007" }))).status).toBe(400);
    expect((await POST(req({ ...validBody, scope: "everything" }))).status).toBe(400);
    expect(checkDanteRateLimit).not.toHaveBeenCalled();
    expect(visionJson).not.toHaveBeenCalled();
  });

  it("a catalogue pick sends the catalogue's own reference (not the client's label), plus confirmation and scope", async () => {
    const res = await POST(req({ ...validBody, exerciseKey: "catalogue:seated-leg-curl", exerciseLabel: "anything the client says", userConfirmedExercise: true, scope: "camera_moved" }));
    expect(res.status).toBe(200);
    const text = (vi.mocked(visionJson).mock.calls[0][3][0] as { text: string }).text;
    expect(text).toMatch(/Exercise the user named: "Seated Leg Curl" — the user has CONFIRMED/);
    expect(text).toMatch(/Secure the thigh pad/);
    expect(text).toMatch(/camera moves/);
    expect(text).not.toMatch(/anything the client says/);
  });

  it("look-alike exercises get a contrast pass naming the look-alike (same quota unit); skipped after a user confirmation", async () => {
    await POST(req({ ...validBody, exerciseKey: "catalogue:leg-extension", exerciseLabel: "Leg Extension" }));
    expect(visionJson).toHaveBeenCalledTimes(3);
    expect(checkDanteRateLimit).toHaveBeenCalledTimes(1);
    const contrast = vi.mocked(visionJson).mock.calls[2];
    const text = (contrast[3][0] as { text: string }).text;
    expect(text).toMatch(/Exercise the user named: "Seated Leg Curl" \(a user-provided label, not proof\)/);
    expect(contrast[3].filter((c) => c.type === "image_url")).toHaveLength(validBody.frames.length);
    vi.mocked(visionJson).mockClear();
    await POST(req({ ...validBody, exerciseKey: "catalogue:leg-extension", exerciseLabel: "Leg Extension", userConfirmedExercise: true }));
    expect(visionJson).toHaveBeenCalledTimes(2);
    vi.mocked(visionJson).mockClear();
    await POST(req(validBody)); // no catalogue look-alikes -> two passes only
    expect(visionJson).toHaveBeenCalledTimes(2);
  });

  it("502 with a safe message when the model fails", async () => {
    vi.mocked(visionJson).mockResolvedValueOnce(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/temporarily unavailable/);
  });
});
