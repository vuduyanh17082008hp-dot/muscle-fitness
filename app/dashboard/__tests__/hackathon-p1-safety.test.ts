import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hackathon demo repairs of the final-QA defects:
 * QA-01 the training hold is enforced at the server boundary (Start action + Dante schedule_workout), fail-closed.
 * QA-03 Nutrition's "today" is the athlete's date, not the device's.  QA-05 food lookups need a user and a bounded rate.
 * QA-06 "Plan is on track" never appears when today's status is unknown.  QA-07/08 see source assertions below.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/dante-core/server/load-daily-decision", () => ({ loadDailyDecision: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { loadDailyDecision } from "@/lib/dante-core/server/load-daily-decision";
import { startWorkoutAction } from "@/app/dashboard/workouts/actions";
import { scheduleWorkoutTool } from "@/lib/dante-core/tools/write/schedule-workout";
import { currentTrainingHold } from "@/lib/dante-core/server/training-hold-guard";
import { guardFoodLookup, takeLookupSlot } from "@/lib/nutrition/food-data/lookup-guard";
import { formatDateLabel } from "@/lib/nutrition/date-utils";
import { NutritionTracker } from "@/components/nutrition/nutrition-tracker";
import { WhatMattersNow } from "@/components/dashboard/what-matters-now";
import { todayWorkoutItem } from "@/lib/dashboard/today-workout-item";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const DAY = "11111111-1111-4111-8111-111111111111";

function fakeSupabase() {
  const rpc = vi.fn(async (name: string) => {
    if (name === "can_manage_workout_client") return { data: true, error: null };
    if (name === "start_workout") return { data: "session-9", error: null };
    return { data: null, error: null };
  });
  const from = vi.fn(() => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({ data: { workout_plan_id: "plan-1", client_id: "user-1" }, error: null }),
      maybeSingle: async () => ({ data: { client_id: "user-1" }, error: null }),
    };
    return q;
  });
  return { rpc, from, auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) } };
}

const decision = (hold: "recovery" | "unverified" | null) => ({ hold }) as unknown as Awaited<ReturnType<typeof loadDailyDecision>>;

describe("QA-01 server-side training hold", () => {
  let supabase: ReturnType<typeof fakeSupabase>;
  beforeEach(() => {
    supabase = fakeSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
  });
  const form = () => {
    const fd = new FormData();
    fd.set("workout_day_id", DAY);
    return fd;
  };

  it.each(["recovery", "unverified"] as const)("Start during hold=%s redirects to Recovery and never calls start_workout", async (hold) => {
    vi.mocked(loadDailyDecision).mockResolvedValue(decision(hold));
    await expect(startWorkoutAction(form())).rejects.toThrow("REDIRECT:/dashboard/recovery");
    expect(supabase.rpc.mock.calls.map((c) => c[0])).not.toContain("start_workout");
  });

  it("without a hold, Start still creates the session (normal starts preserved)", async () => {
    vi.mocked(loadDailyDecision).mockResolvedValue(decision(null));
    await expect(startWorkoutAction(form())).rejects.toThrow("REDIRECT:/dashboard/workouts/session/session-9");
    expect(supabase.rpc.mock.calls.map((c) => c[0])).toContain("start_workout");
  });

  it("a hold the DB trigger catches after the app check (race) still redirects to Recovery", async () => {
    vi.mocked(loadDailyDecision).mockResolvedValue(decision(null));
    supabase.rpc.mockImplementation(async (name: string) =>
      name === "start_workout"
        ? ({ data: null, error: { message: "Training is on hold today", hint: "training_hold" } } as never)
        : { data: true, error: null },
    );
    await expect(startWorkoutAction(form())).rejects.toThrow("REDIRECT:/dashboard/recovery");
  });

  it("an unreadable decision fails closed as 'unverified'", async () => {
    vi.mocked(loadDailyDecision).mockRejectedValue(new Error("db down"));
    expect(await currentTrainingHold(supabase as never, "user-1")).toBe("unverified");
  });

  it("Dante's schedule_workout refuses during a hold and starts normally otherwise", async () => {
    const context = { supabase: supabase as never, userId: "user-1", now: new Date() };
    vi.mocked(loadDailyDecision).mockResolvedValue(decision("recovery"));
    const held = await scheduleWorkoutTool.execute(context, { workoutDayId: DAY });
    expect(held.ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
    vi.mocked(loadDailyDecision).mockResolvedValue(decision(null));
    expect((await scheduleWorkoutTool.execute(context, { workoutDayId: DAY })).ok).toBe(true);
  });
});

describe("QA-03 Nutrition uses the athlete's date", () => {
  it("labels and Add food follow the server's date, whatever the device clock says", () => {
    expect(formatDateLabel("2026-10-27", "2026-10-27")).toBe("Today");
    expect(formatDateLabel("2026-10-26", "2026-10-27")).toBe("Yesterday");
    // initialDate far from the test machine's own date: still "Today" and still offers Add food.
    const html = renderToStaticMarkup(
      createElement(NutritionTracker, { userId: "u1", initialEntries: [], initialDate: "2001-01-01", target: { calories: 2000, protein: 120, carbs: 200, fat: 60 } }),
    );
    expect(html).toContain(">Today<");
    expect(html).toMatch(/Add food/);
    expect(html).toContain('max="2001-01-01"');
    expect(read("components/nutrition/nutrition-tracker.tsx")).not.toContain("todayIso()");
  });
});

describe("QA-05 food lookups", () => {
  it("refuses signed-out callers with 401", async () => {
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never);
    expect((await guardFoodLookup())?.status).toBe(401);
  });

  it("allows 60 lookups per user per minute, then 429 with a retry time; other users are unaffected", () => {
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) expect(takeLookupSlot("rate-a", t + i).allowed).toBe(true);
    const blocked = takeLookupSlot("rate-a", t + 100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(takeLookupSlot("rate-b", t + 100).allowed).toBe(true);
    expect(takeLookupSlot("rate-a", t + 61_000).allowed).toBe(true);
  });

  it("both proxy routes call the guard first", () => {
    for (const route of ["app/api/nutrition/foods/search/route.ts", "app/api/nutrition/foods/barcode/route.ts"]) {
      expect(read(route)).toMatch(/export async function GET\(request: Request\) \{\n\s+\/\/ QA-05[^\n]*\n\s+const stop = await guardFoodLookup\(\)/);
    }
  });
});

describe("QA-06 What matters now", () => {
  it("never says 'on track' when today's status is unknown", () => {
    const unknown = renderToStaticMarkup(createElement(WhatMattersNow, { items: [], statusUnknown: true }));
    expect(unknown).not.toContain("Plan is on track");
    expect(unknown).toContain("couldn&#x27;t be loaded");
    expect(renderToStaticMarkup(createElement(WhatMattersNow, { items: [] }))).toContain("Plan is on track");
  });

  it("a REST-plan conflict is surfaced for review, never 'on track' (and a hold still wins)", () => {
    const item = todayWorkoutItem(null, "conflict", null);
    expect(item?.title).toBe("Workout schedule needs review");
    expect(renderToStaticMarkup(createElement(WhatMattersNow, { items: [item!] }))).not.toContain("Plan is on track");
    expect(todayWorkoutItem(null, "conflict", "recovery")?.id).toBe("training-hold");
    expect(todayWorkoutItem(null, "none", null)).toBeNull();
  });
});

describe("QA-04/07/08 source guarantees", () => {
  it("QA-04 the Add Food panel stays mounted while saving", () => {
    const modal = read("components/nutrition/track-food-modal.tsx");
    expect(modal).not.toContain(") : saving ? (");
    expect(modal).toContain("{saving ? (\n            <div role=\"status\"");
  });

  it("QA-07 onboarding step 1 enforces the schema's height/weight ranges", () => {
    const wizard = read("features/onboarding/short-onboarding-wizard.tsx");
    expect(wizard).toMatch(/form\.heightCm >= 80 &&\s+form\.heightCm <= 250/);
    expect(wizard).toMatch(/form\.weightKg >= 20 &&\s+form\.weightKg <= 400/);
  });

  it("QA-08 an empty finished Dante reply becomes the unavailable message with Retry", () => {
    const chat = read("components/dante-chat.tsx");
    expect(chat).toContain("const empty = message.content.trim().length === 0 && !finalEvent.pendingConfirmation;");
    expect(chat).toContain('...(empty ? { historyStatus: "error" as const } : {}),');
  });
});
