/**
 * Nutrition Coach — LOCAL Supabase end-to-end.
 *
 * Skipped unless NUTRITION_COACH_LOCAL_E2E=1. Talks ONLY to a loopback
 * Supabase API (default http://127.0.0.1:54331, `supabase start` for this repo)
 * and refuses anything else — it must never be pointed at the hosted project.
 *
 *   NUTRITION_COACH_LOCAL_E2E=1 npx vitest run app/api/nutrition/coach/__tests__/local-e2e.test.ts
 *
 * Real: Postgres, RLS, auth, dante_tool_actions, food_logs unique idempotency,
 * the real route handlers, real pending-action confirmation. Mocked: the
 * cookie-based server client (swapped for a signed-in supabase-js client) and
 * the OpenAI provider (no live provider calls).
 */
import { execFileSync } from "node:child_process"
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/dante-core/openai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dante-core/openai/client")>()),
  callOpenAiWithFallback: vi.fn(async () => null),
}))

import { POST as chatbot } from "@/app/api/chatbot/route"
import { POST as confirmRoute } from "@/app/api/dante/tools/confirm/route"
import { POST as logRoute } from "@/app/api/nutrition/coach/log/route"
import { POST as coachRoute } from "@/app/api/nutrition/coach/route"
import { confirmPendingAction, createPendingAction } from "@/lib/dante-core/tools/pending-actions"
import { loadCoachContext } from "@/lib/nutrition/coach/context"
import { createClient } from "@/lib/supabase/server"

const URL_LOCAL = process.env.NUTRITION_COACH_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54331"
// Well-known local demo anon key (`supabase start` default) — not a secret.
const ANON =
  process.env.NUTRITION_COACH_LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

// Local `supabase status` service_role key, supplied by the operator (never the hosted key).
const LOCAL_SERVICE_KEY = process.env.NUTRITION_COACH_LOCAL_SUPABASE_SERVICE_KEY ?? ""

const enabled = process.env.NUTRITION_COACH_LOCAL_E2E === "1" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_LOCAL) && LOCAL_SERVICE_KEY !== ""

const DB_CONTAINER = process.env.NUTRITION_COACH_LOCAL_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"
/** Local-only superuser SQL (fault injection) through the MF stack's own Postgres container. */
const sql = (statement: string) => execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: statement }).toString()

const PASSWORD = "local-coach-e2e-password"
type Session = { client: SupabaseClient; userId: string }

async function signedIn(email: string, allergies: string[] = []): Promise<Session> {
  const client = createSupabaseClient(URL_LOCAL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  let signed = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (!signed.data.user) {
    const created = await client.auth.signUp({ email, password: PASSWORD })
    if (created.error) throw created.error
    signed = await client.auth.signInWithPassword({ email, password: PASSWORD })
  }
  if (signed.error || !signed.data.user) throw signed.error ?? new Error("sign-in failed")
  const userId = signed.data.user.id

  await client.from("profiles").update({ timezone: "Asia/Singapore", gender: "male", date_of_birth: "1995-05-05" }).eq("user_id", userId)
  const fitness = await client.from("fitness_profiles").upsert({ user_id: userId, height_cm: 178, weight_kg: 80, goal: "lose_fat", training_days: 4, activity_level: "moderately_active" })
  if (fitness.error) throw fitness.error
  const prefs = await client.from("user_preferences").upsert({ user_id: userId, allergies, excluded_foods: [], food_preferences: ["chicken"] })
  if (prefs.error) throw prefs.error
  await client.from("food_logs").delete().eq("user_id", userId)
  return { client, userId }
}

let alice: Session
let bob: Session
const actAs = (session: Session) => vi.mocked(createClient).mockImplementation((async () => session.client) as never)
const json = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const chat = async (message: string, extra: Record<string, unknown> = {}) => (await chatbot(json("/api/chatbot", { message, coachMode: "nutrition", ...extra }))).json()
const logsFor = async (key: string) => (await alice.client.from("food_logs").select("id").eq("idempotency_key", key)).data ?? []
const logCount = async (session: Session) => (await session.client.from("food_logs").select("id", { count: "exact", head: true }).eq("user_id", session.userId)).count

describe.skipIf(!enabled)("Nutrition Coach — local Supabase E2E", () => {
  beforeAll(async () => {
    // Server code (pending-actions / finalize RPC) uses the service-role client: point it at the LOCAL stack only.
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY
    alice = await signedIn("coach-e2e-alice@local.test")
    bob = await signedIn("coach-e2e-bob@local.test", ["dairy"])
  }, 60_000)

  it("A→E: build, customize, confirm-before-log, idempotent retry, new action allowed", async () => {
    actAs(alice)

    // SCENARIO A — user has chicken + rice
    const a = await chat("I have chicken and rice. Build dinner under 500 calories and high protein.")
    expect(a.intent).toBe("NEW_MEAL_REQUEST")
    expect(a.draft.nutrition.calories).toBeLessThanOrEqual(500)
    const used = a.draft.ingredients.map((i: { ingredientId: string }) => i.ingredientId)
    for (const id of used) expect(["chicken_breast", "rice"]).toContain(id)
    expect(a.draft.suggestions.length).toBeLessThanOrEqual(3)
    expect(a.draft.sessionContextSnapshot.timezone).toBe("Asia/Singapore")

    // SCENARIO C — AUTO scaling
    const c = await chat("Make this 450 calories", { activeDraft: a.draft })
    expect(Math.abs(c.draft.nutrition.calories - 450)).toBeLessThanOrEqual(25)

    // SCENARIO D — swap with recalculation
    const d = await chat("Swap chicken for fish", { activeDraft: c.draft })
    const swapped = d.proposal ?? d.draft
    expect(swapped.ingredients.map((i: { ingredientId: string }) => i.ingredientId)).toContain("white_fish")

    // SCENARIO E — confirmation first, then exactly one log
    const proposed = await (await logRoute(json("/api/nutrition/coach/log", { draft: c.draft, mealType: "dinner" }))).json()
    expect(proposed.ok).toBe(true)
    expect(await logCount(alice)).toBe(0)

    const actionId = proposed.pendingConfirmation.actionId as string
    const first = await (await confirmRoute(json("/api/dante/tools/confirm", { actionId, intent: "confirm" }))).json()
    expect(first.ok).toBe(true)
    expect(await logCount(alice)).toBe(1)

    const retry = await confirmRoute(json("/api/dante/tools/confirm", { actionId, intent: "confirm" }))
    expect(retry.status).toBe(422)
    expect(await logCount(alice)).toBe(1)

    const stored = await alice.client.from("food_logs").select("calories, protein_g, source_id, idempotency_key, food_name").eq("user_id", alice.userId).single()
    expect(stored.data?.idempotency_key).toBe(actionId)
    expect(stored.data?.source_id).toMatch(/^mfmeal:/)
    expect(Math.abs(Number(stored.data?.calories) - c.draft.nutrition.calories)).toBeLessThan(0.6)

    // the first log changed today's remaining macros: the same draft is now stale until the user keeps it
    const staleProposal = await (await logRoute(json("/api/nutrition/coach/log", { draft: c.draft, mealType: "dinner" }))).json()
    expect(staleProposal.code).toBe("STALE_CONTEXT")
    const kept = (await (await coachRoute(json("/api/nutrition/coach", { action: "edit", draft: c.draft, op: { type: "keep" } }))).json()).draft

    // same meal again: warned first, then a NEW confirmed action is allowed
    const warned = await (await logRoute(json("/api/nutrition/coach/log", { draft: kept, mealType: "dinner" }))).json()
    expect(warned.code).toBe("SIMILAR_MEAL_LOGGED_TODAY")
    const again = await (await logRoute(json("/api/nutrition/coach/log", { draft: kept, mealType: "dinner", acknowledgeSimilar: true }))).json()
    expect(again.pendingConfirmation.actionId).not.toBe(actionId)
    expect((await (await confirmRoute(json("/api/dante/tools/confirm", { actionId: again.pendingConfirmation.actionId, intent: "confirm" }))).json()).ok).toBe(true)
    expect(await logCount(alice)).toBe(2)

    // the food log changed the remaining macros, so a draft made earlier is now stale
    const staleCheck = await (await coachRoute(json("/api/nutrition/coach", { action: "edit", draft: a.draft, op: { type: "undo" } }))).json()
    expect(staleCheck.draft.status).toBe("STALE_CONTEXT")
  }, 60_000)

  it("B: Craving Makeover with persisted allergy blocking the dairy-based version", async () => {
    actAs(alice)
    const cerealAsk = await chat("I'm craving chocolate cereal")
    expect(cerealAsk.draft).toBeNull()
    const cereal = await chat("Build the full high-protein makeover", { conversation: cerealAsk.conversation })
    expect(cereal.draft.craving.key).toBe("chocolate_cereal")
    expect(cereal.draft.craving.original.source).toBe("ESTIMATED")

    actAs(bob)
    const iceCreamAsk = await chat("I'm craving protein ice cream")
    expect(iceCreamAsk.draft).toBeNull()
    const blocked = await chat("Yes", { conversation: iceCreamAsk.conversation })
    expect(blocked.reply).toMatch(/allergies/i)
  })

  it("cross-user isolation: another user cannot confirm a pending log", async () => {
    actAs(alice)
    const aliceBefore = await logCount(alice)
    const built = await (await coachRoute(json("/api/nutrition/coach", { action: "build" }))).json()
    const proposed = await (await logRoute(json("/api/nutrition/coach/log", { draft: built.draft, mealType: "snack", acknowledgeSimilar: true }))).json()
    const before = await logCount(bob)

    actAs(bob)
    const stolen = await confirmRoute(json("/api/dante/tools/confirm", { actionId: proposed.pendingConfirmation.actionId, intent: "confirm" }))
    expect(stolen.status).toBe(422)
    expect(await logCount(bob)).toBe(before)
    expect(await logCount(alice)).toBe(aliceBefore)
  })

  describe("hardening: stale context, atomic confirmation (real Postgres)", () => {
    const MEAL = [
      { ingredientId: "chicken_breast", grams: 150 },
      { ingredientId: "rice", grams: 150 },
    ]
    const confirmAs = (session: Session, actionId: string) =>
      confirmPendingAction(session.client, { supabase: session.client, userId: session.userId, now: new Date(), timezone: "Asia/Singapore", cache: new Map() }, actionId)
    /** A pending log_meal_draft exactly as the proposal route builds it (server-captured current snapshot). */
    const propose = async (name: string, summary = `Log ${name}`) => {
      const loaded = await loadCoachContext(alice.client, alice.userId)
      if (!loaded.ok) throw new Error("no context")
      return createPendingAction(alice.client, alice.userId, "log_meal_draft", { mealType: "dinner", name, ingredients: MEAL, context: loaded.ctx.snapshot }, summary)
    }
    const actionStatus = async (id: string) => (await alice.client.from("dante_tool_actions").select("status").eq("id", id).single()).data?.status
    const withTrigger = async (setup: string, teardown: string, body: () => Promise<void>) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
      sql(setup)
      try {
        await body()
      } finally {
        sql(teardown)
        spy.mockRestore()
      }
    }

    it("stale: target change before proposal is detected; change after proposal blocks confirmation", async () => {
      actAs(alice)
      const built = await (await coachRoute(json("/api/nutrition/coach", { action: "build" }))).json()
      const ok = await (await logRoute(json("/api/nutrition/coach/log", { draft: built.draft, mealType: "snack", acknowledgeSimilar: true }))).json()
      expect(ok.ok).toBe(true)

      await alice.client.from("fitness_profiles").update({ weight_kg: 95 }).eq("user_id", alice.userId)
      try {
        const stale = await (await logRoute(json("/api/nutrition/coach/log", { draft: built.draft, mealType: "snack", acknowledgeSimilar: true }))).json()
        expect(stale).toMatchObject({ ok: false, code: "STALE_CONTEXT", actions: ["Refresh meal", "Keep current draft"] })

        const before = await logCount(alice)
        const blocked = await (await confirmRoute(json("/api/dante/tools/confirm", { actionId: ok.pendingConfirmation.actionId, intent: "confirm" }))).json()
        expect(blocked).toMatchObject({ ok: false, code: "ACTION_STALE" })
        expect(await logCount(alice)).toBe(before)
      } finally {
        await alice.client.from("fitness_profiles").update({ weight_kg: 80 }).eq("user_id", alice.userId)
      }
    }, 60_000)

    it("normal confirmation, same-action retry, and a new action for the same meal", async () => {
      const first = await propose("Atomic A")
      expect((await confirmAs(alice, first.actionId)).ok).toBe(true)
      expect(await actionStatus(first.actionId)).toBe("executed")
      expect(await logsFor(first.actionId)).toHaveLength(1)

      expect(await confirmAs(alice, first.actionId)).toMatchObject({ ok: false, code: "ACTION_ALREADY_PROCESSED" })
      expect(await logsFor(first.actionId)).toHaveLength(1)

      const second = await propose("Atomic A")
      expect((await confirmAs(alice, second.actionId)).ok).toBe(true)
      expect(await logsFor(second.actionId)).toHaveLength(1)
    }, 60_000)

    it("simultaneous confirmations create exactly one food log", async () => {
      const action = await propose("Atomic race")
      const outcomes = await Promise.all([1, 2, 3].map(() => confirmAs(alice, action.actionId)))
      expect(outcomes.filter((o) => o.ok)).toHaveLength(1)
      expect(await logsFor(action.actionId)).toHaveLength(1)
      expect(await actionStatus(action.actionId)).toBe("executed")
    }, 60_000)

    it("forced food-log failure: action not executed, no food log, no raw error returned", async () => {
      await withTrigger(
        `create or replace function public.t_fail_foodlog() returns trigger language plpgsql as $$ begin if new.food_name = 'FORCE_FOODLOG_FAIL' then raise exception 'forced food log failure'; end if; return new; end $$;
         drop trigger if exists t_fail_foodlog on public.food_logs;
         create trigger t_fail_foodlog before insert on public.food_logs for each row execute function public.t_fail_foodlog();`,
        "drop trigger if exists t_fail_foodlog on public.food_logs; drop function if exists public.t_fail_foodlog();",
        async () => {
          const action = await propose("FORCE_FOODLOG_FAIL")
          const outcome = await confirmAs(alice, action.actionId)
          expect(outcome.ok).toBe(false)
          expect(JSON.stringify(outcome)).not.toContain("forced food log failure")
          expect(await actionStatus(action.actionId)).not.toBe("executed")
          expect(await logsFor(action.actionId)).toHaveLength(0)
        },
      )
    }, 60_000)

    it("forced action-finalization failure: the food log insert is rolled back", async () => {
      await withTrigger(
        `create or replace function public.t_fail_finalize() returns trigger language plpgsql as $$ begin if new.status = 'executed' and new.summary like 'FORCE_FINALIZE_FAIL%' then raise exception 'forced finalize failure'; end if; return new; end $$;
         drop trigger if exists t_fail_finalize on public.dante_tool_actions;
         create trigger t_fail_finalize before update on public.dante_tool_actions for each row execute function public.t_fail_finalize();`,
        "drop trigger if exists t_fail_finalize on public.dante_tool_actions; drop function if exists public.t_fail_finalize();",
        async () => {
          const action = await propose("Finalize fail", "FORCE_FINALIZE_FAIL")
          expect((await confirmAs(alice, action.actionId)).ok).toBe(false)
          expect(await actionStatus(action.actionId)).not.toBe("executed")
          expect(await logsFor(action.actionId)).toHaveLength(0)
        },
      )
    }, 60_000)

    it("allergy added after proposal blocks confirmation", async () => {
      const action = await propose("Allergy race")
      await alice.client.from("user_preferences").update({ allergies: ["poultry"] }).eq("user_id", alice.userId)
      try {
        expect(await confirmAs(alice, action.actionId)).toMatchObject({ ok: false, code: "ACTION_FORBIDDEN" })
        expect(await logsFor(action.actionId)).toHaveLength(0)
      } finally {
        await alice.client.from("user_preferences").update({ allergies: [] }).eq("user_id", alice.userId)
      }
    }, 60_000)
  })

  describe("authorization: browser users cannot forge, promote, or finalize actions", () => {
    const service = () => createSupabaseClient(URL_LOCAL, LOCAL_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const forgedArgs = (name: string) => ({ mealType: "dinner", name, ingredients: [{ ingredientId: "rice", grams: 100 }], context: {} })
    const foodRow = (name: string) => ({ log_date: "2026-10-08", meal_type: "dinner", food_name: name, source: "local", quantity_grams: 100, calories: 9999, protein_g: 999, carbs_g: 0, fat_g: 0 })
    const proposeReal = async (name: string) => {
      const loaded = await loadCoachContext(alice.client, alice.userId)
      if (!loaded.ok) throw new Error("no context")
      return createPendingAction(alice.client, alice.userId, "log_meal_draft", { mealType: "dinner", name, ingredients: [{ ingredientId: "rice", grams: 100 }], context: loaded.ctx.snapshot }, `Log ${name}`)
    }

    it("EXACT CODEX EXPLOIT: forged confirmed row + direct RPC is denied and writes no food log", async () => {
      const before = await logCount(alice)
      const forged = await alice.client.from("dante_tool_actions").insert({ user_id: alice.userId, tool_name: "log_meal_draft", status: "confirmed", args: forgedArgs("Forged"), summary: "forged" }).select("id").maybeSingle()
      expect(forged.error).not.toBeNull()
      expect(forged.data).toBeNull()
      const rpc = await alice.client.rpc("finalize_food_log_action", { p_action_id: crypto.randomUUID(), p_user_id: alice.userId, p_row: foodRow("Forged") })
      expect(rpc.error).not.toBeNull()
      const legacyRpc = await alice.client.rpc("finalize_food_log_action", { p_action_id: crypto.randomUUID(), p_row: foodRow("Forged") })
      expect(legacyRpc.error).not.toBeNull()
      expect(await logCount(alice)).toBe(before)
    })

    it("cannot promote, retarget, or rewrite an owned pending action, nor delete it", async () => {
      const action = await proposeReal("Immutable")
      const attempts = [
        alice.client.from("dante_tool_actions").update({ status: "confirmed" }).eq("id", action.actionId),
        alice.client.from("dante_tool_actions").update({ args: forgedArgs("Swapped") }).eq("id", action.actionId),
        alice.client.from("dante_tool_actions").update({ tool_name: "log_food", user_id: bob.userId, result: { x: 1 }, executed_at: new Date().toISOString() }).eq("id", action.actionId),
        alice.client.from("dante_tool_actions").delete().eq("id", action.actionId),
      ]
      for (const attempt of attempts) expect((await attempt).error).not.toBeNull()
      const stored = await service().from("dante_tool_actions").select("status, tool_name, user_id, args, result, executed_at").eq("id", action.actionId).single()
      expect(stored.data).toMatchObject({ status: "pending", tool_name: "log_meal_draft", user_id: alice.userId, result: null, executed_at: null })
      expect((stored.data?.args as { name: string }).name).toBe("Immutable")
      // owner can still read it
      expect((await alice.client.from("dante_tool_actions").select("id").eq("id", action.actionId)).data).toHaveLength(1)
    })

    it("user B cannot read, finalize, or confirm user A's action; service RPC is bound to the action owner", async () => {
      const action = await proposeReal("Cross user")
      expect((await bob.client.from("dante_tool_actions").select("id").eq("id", action.actionId)).data).toHaveLength(0)
      const direct = await bob.client.rpc("finalize_food_log_action", { p_action_id: action.actionId, p_user_id: alice.userId, p_row: foodRow("Cross user") })
      expect(direct.error).not.toBeNull()
      const asBob = await service().rpc("finalize_food_log_action", { p_action_id: action.actionId, p_user_id: bob.userId, p_row: foodRow("Cross user") })
      expect(asBob.error?.message).toContain("ACTION_NOT_FOUND")
      expect((await logsFor(action.actionId))).toHaveLength(0)
    })

    it("a swapped food-log payload cannot be substituted at finalization (identity fields bound to the stored action)", async () => {
      const action = await proposeReal("Approved meal")
      const svc = service()
      await svc.from("dante_tool_actions").update({ status: "confirmed" }).eq("id", action.actionId)
      const swapped = await svc.rpc("finalize_food_log_action", { p_action_id: action.actionId, p_user_id: alice.userId, p_row: foodRow("Different meal") })
      expect(swapped.error?.message).toContain("ACTION_PAYLOAD_MISMATCH")
      expect(await logsFor(action.actionId)).toHaveLength(0)
    })

    it("an unconfirmed (pending) action cannot be finalized even by the service role", async () => {
      const action = await proposeReal("Not confirmed")
      const r = await service().rpc("finalize_food_log_action", { p_action_id: action.actionId, p_user_id: alice.userId, p_row: foodRow("Not confirmed") })
      expect(r.error?.message).toContain("ACTION_NOT_CONFIRMED")
      expect(await logsFor(action.actionId)).toHaveLength(0)
    })
  })

  it("coach actions require auth", async () => {
    const anon = createSupabaseClient(URL_LOCAL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    vi.mocked(createClient).mockImplementation((async () => anon) as never)
    expect((await coachRoute(json("/api/nutrition/coach", { action: "build" }))).status).toBe(401)
  })
})
