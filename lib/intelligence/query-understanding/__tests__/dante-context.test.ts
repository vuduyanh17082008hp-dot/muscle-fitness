import { describe, expect, it, vi } from "vitest";

import { resolveFoodEntity, type ResolverDeps } from "../../food-resolution";
import { searchLocalCanonical } from "../../food-resolution/server";
import { evaluateSocialBoundary } from "@/lib/dante-core/social-boundary-router";
import { buildDanteQueryContext } from "../dante-context";
import { getQueryMetrics, resetQueryMetrics } from "../telemetry";

const deps = (configured = false, calls = vi.fn()): ResolverDeps => ({
  searchLocal: searchLocalCanonical,
  searchUsda: async (q) => { calls(q); return { configured, foods: [] }; },
});
const resolveFood = (configured = false) => (req: Parameters<typeof resolveFoodEntity>[0]) => resolveFoodEntity(req, deps(configured));

describe("Dante query context (shared layer, Dante side)", () => {
  it("live flow: 800 kcal + heavy deadlift tonight → training primary, nutrition MATERIAL, no meal plan", async () => {
    const q = await buildDanteQueryContext("I only ate 800 calories today and I'm supposed to deadlift heavy tonight. Should I still push the session?", [], { resolveFood: resolveFood() });
    expect(q.frame.primaryDomain).toBe("TRAINING");
    expect(q.frame.crossCoachRelevance).toBe("MATERIAL");
    expect(q.retrieval.thinking).toBe("DEEP");
    expect(q.block).toContain("user_stated_intake: 800 kcal");
    expect(q.block).toContain("self-reported, not verified");
    expect(q.block).toMatch(/do NOT write a meal plan/);
    expect(q.block).toMatch(/Gemma/);
    expect(q.block).not.toMatch(/\b(breakfast|dinner)\b.*\bgrams?\b/i);
  });

  it("is 200g cod enough after training → verified cod facts + deterministic 200 g, from local when USDA is down", async () => {
    const q = await buildDanteQueryContext("is 200g cod enough protein after training?", [], { resolveFood: resolveFood(false) });
    expect(q.block).toContain("food_fact (app curated table)");
    expect(q.block).toContain("per 100 g = 105 kcal, 23 g protein");
    expect(q.block).toContain("For 200 g (deterministic arithmetic, do not recompute) = 210 kcal, 46 g protein");
    expect(q.frame.deferToGemma).toBe(false);
  });

  it("Vietnamese: 200g cá tuyết đủ protein sau tập chưa", async () => {
    const q = await buildDanteQueryContext("200g cá tuyết đủ protein sau tập chưa", [], { resolveFood: resolveFood() });
    expect(q.block).toContain("210 kcal, 46 g protein");
  });

  it("simple nutrition fact does not trigger DEEP", async () => {
    const q = await buildDanteQueryContext("protein in 100g cod", [], { resolveFood: resolveFood() });
    expect(q.retrieval.thinking).not.toBe("DEEP");
  });

  it("'build my dinner' on Dante → boundary says Gemma, and no food lookup is made", async () => {
    const calls = vi.fn();
    const q = await buildDanteQueryContext("build my dinner with chicken breast", [], { resolveFood: (r) => { calls(r); return resolveFoodEntity(r, deps()); } });
    expect(q.frame.deferToGemma).toBe(true);
    expect(q.block).toMatch(/Gemma/);
    expect(calls).not.toHaveBeenCalled();
  });

  it("follow-up resolves the exercise from the conversation", async () => {
    const q = await buildDanteQueryContext("why?", [{ role: "user", text: "My squat feels weak." }, { role: "assistant", text: "Likely fatigue." }]);
    expect(q.frame.intent).toBe("PERFORMANCE_EXPLANATION");
    expect(q.block).toContain("EXERCISE:squat");
    expect(q.block).toContain('follow_up_of: "My squat feels weak."');
    expect(q.frame.followUpOf).toBe("My squat feels weak.");
    expect(q.block).toContain("reasoning_effort=DEEP");
  });

  it("safety, casual and bare turns add no block", async () => {
    for (const m of ["My chest hurts during bench.", "im dead lol", "cod"]) {
      expect((await buildDanteQueryContext(m, [])).block).toBeNull();
    }
  });

  it("resolver crash is fail-open and states 'do not invent numbers'", async () => {
    const q = await buildDanteQueryContext("is 200g cod enough protein after training?", [], { resolveFood: async () => { throw new Error("x"); } });
    expect(q.block).toContain("lookup failed; do not invent numbers");
  });

  it("telemetry is enums/counts only (no message text)", async () => {
    resetQueryMetrics();
    await buildDanteQueryContext("I only ate 800 calories, should I deadlift heavy?", []);
    const metrics = JSON.stringify(getQueryMetrics());
    expect(metrics).toContain("DANTE.turns");
    expect(metrics).not.toMatch(/800|deadlift heavy/);
  });
});

describe("social router keeps Vietnamese sleep vs insult distinct (regression)", () => {
  it("'tôi ngủ tệ' / 'hôm qua ngủ tệ, nay có nên squat nặng ko' are not social events", () => {
    for (const m of ["tôi ngủ tệ", "hôm qua ngủ tệ, nay có nên squat nặng ko", "ngủ không đủ giấc"]) {
      expect(evaluateSocialBoundary(m).mode).toBe("NORMAL");
    }
  });
  it("'ngu thật' is a real self/other insult and is routed", () => {
    expect(evaluateSocialBoundary("tao ngu thật").mode).not.toBe("NORMAL");
  });
});
