import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { POST } from "../route";

const from = vi.fn();
beforeEach(() => {
  from.mockReset();
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from } as unknown as Awaited<ReturnType<typeof createClient>>);
});

it.each([null, [], { goal: { unexpected: true } }])("rejects malformed JSON shapes before querying profiles", async (body) => {
  const response = await POST(new Request("http://localhost/api/plan", { method: "POST", body: JSON.stringify(body) }));
  expect(response.status).toBe(400);
  expect(from).not.toHaveBeenCalled();
});
