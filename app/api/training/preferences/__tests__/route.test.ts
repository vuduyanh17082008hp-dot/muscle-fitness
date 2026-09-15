import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { POST } from "../route";
import { DEFAULT_TRAINING_PREFERENCES } from "@/lib/training/types";

const from = vi.fn();
beforeEach(() => {
  from.mockReset();
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from } as unknown as Awaited<ReturnType<typeof createClient>>);
});

it("rejects malformed generated programs before persistence", async () => {
  const response = await POST(new Request("http://localhost/api/training/preferences", { method: "POST", body: JSON.stringify({ preferences: DEFAULT_TRAINING_PREFERENCES, generatedProgram: { days: "invalid" } }) }));
  expect(response.status).toBe(400);
  expect(from).not.toHaveBeenCalled();
});
