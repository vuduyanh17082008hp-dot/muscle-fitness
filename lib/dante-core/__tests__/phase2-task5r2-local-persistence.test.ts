/**
 * Task 5R2 §10 — OPT-IN persistence / restart / user-isolation check against the LOCAL Docker Supabase stack
 * (project `muscle-fitness-nof1-local`, 127.0.0.1:54321) with the REAL `createSupabaseCoherenceStore`, RLS and CAS.
 * Skipped unless LOCAL_SUPABASE=1, and it refuses any URL that is not loopback — the hosted project is never touched.
 *
 *   LOCAL_SUPABASE=1 npx vitest run lib/dante-core/__tests__/phase2-task5r2-local-persistence.test.ts
 *
 * What it proves about 5R2: authority metadata (ResponseBlock source/authority/renderStatus/degradeReason) is
 * response-ephemeral and never reaches the durable row; durable expression state, supersession, TURN-scope and
 * safety-context behaviour are unchanged by the authority guard; users are isolated; CAS still rejects a stale writer.
 */
import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { finalizeProviderReply } from "@/lib/dante-core/runtime-convergence/emit";
import { commitPostTurn, encodeState, prepareTurnWithPersistence } from "@/lib/dante-core/coherence/persistence";
import { createSupabaseCoherenceStore } from "@/lib/dante-core/coherence/supabase-store";
import type { CoherenceTurnResult } from "@/lib/dante-core/coherence/types";

const enabled = process.env.LOCAL_SUPABASE === "1";
const URL_LOCAL = "http://127.0.0.1:54321";
// the well-known local-dev JWT secret of `supabase start`; an anon token minted from it is only valid for this local stack
const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

function localAnonKey(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "supabase-demo", role: "anon", exp: 1983812996 });
  return `${head}.${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

async function signedInClient(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(URL_LOCAL, localAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const password = "Local-only-Passw0rd!";
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error && !/already/i.test(signUp.error.message)) throw signUp.error;
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) throw signIn.error ?? new Error("sign-in failed");
  return { client, userId: signIn.data.user.id };
}

let clock = 0;
const tick = (): string => new Date(Date.parse("2026-09-20T12:00:00.000Z") + ++clock * 60_000).toISOString();

describe.skipIf(!enabled)("5R2 local persistence (real Supabase store, RLS, CAS)", () => {
  it("loopback only — never the hosted project", () => {
    expect(URL_LOCAL).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });

  it("durable profile survives a restart, supersession does not resurrect, users are isolated, authority metadata is never persisted", async () => {
    const stamp = Date.now();
    const a = await signedInClient(`r2a-${stamp}@example.test`);
    const b = await signedInClient(`r2b-${stamp}@example.test`);
    const storeA = () => createSupabaseCoherenceStore(a.client); // a fresh store object per "request"/"restart"

    async function providerTurn(message: string, provider: string, verification: "PASSED" | "UNAVAILABLE" = "PASSED") {
      const session = await prepareTurnWithPersistence({ store: storeA(), key: a.userId, message, now: tick() });
      let finished: CoherenceTurnResult | null = null;
      const out = finalizeProviderReply({
        draft: provider,
        requestTimestamp: tick(),
        language: "vi",
        semanticState: interpretUserTurn(message),
        coherence: { prepared: session.prepared, message, providerVerification: verification, onFinished: (f) => { finished = f; } },
      });
      const done = finished as CoherenceTurnResult | null;
      if (done) await commitPostTurn(session, done);
      return { out, session, done };
    }

    const rowOf = async (client: SupabaseClient, userId: string) => {
      const { data, error } = await client.from("dante_coherence_state").select("state, state_version").eq("user_id", userId).maybeSingle();
      expect(error).toBeNull();
      return data as { state: Record<string, unknown>; state_version: number } | null;
    };

    // T1: durable BRIEF + a provider answer whose RIGHT-shoulder claim contradicts the user's own LEFT report
    const t1 = await providerTurn("Từ giờ nói ngắn thôi. Vai trái của mình đang đau.", "Bro, vai phải mới là bên đau. Giảm volume 20%.");
    expect(t1.out.text).not.toMatch(/vai phải/i);
    expect(t1.done?.responseBlocks.some((blk) => blk.renderStatus === "DEGRADED")).toBe(true);

    // RESTART: brand-new client/store objects — state comes only from Postgres
    const restarted = await createSupabaseCoherenceStore(a.client).load(a.userId);
    expect(restarted.status).toBe("found");
    if (restarted.status !== "found") return;
    expect(restarted.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", scope: "DURABLE", status: "ACTIVE" });

    // authority metadata is response-ephemeral: nothing of it (or of the withheld claim) is in the durable row
    const row1 = await rowOf(a.client, a.userId);
    const raw = JSON.stringify(row1?.state ?? {});
    for (const key of ["responseBlocks", "renderStatus", "degradeReason", "VERIFIED_DERIVED", "PROVIDER_OUTPUT", "semanticRefs"]) {
      expect(raw, key).not.toContain(key);
    }
    expect(JSON.parse(JSON.stringify(encodeState(restarted.state)))).toEqual(row1?.state); // jsonb reorders keys: compare structurally

    // T2: a TURN override never persists; a durable change supersedes BRIEF and BRIEF does not come back
    await providerTurn("Câu này giải thích kỹ giúp mình.", "Giữ RPE 7, thêm một set kéo.");
    let now = await createSupabaseCoherenceStore(a.client).load(a.userId);
    expect(now.status === "found" && now.state.expression.profile.verbosity).toMatchObject({ value: "BRIEF", scope: "DURABLE" });

    await providerTurn("Từ giờ giải thích kỹ nhé.", "Giữ RPE 7, thêm một set kéo.");
    now = await createSupabaseCoherenceStore(a.client).load(a.userId);
    expect(now.status === "found" && now.state.expression.profile.verbosity).toMatchObject({ value: "DETAILED", scope: "DURABLE" });
    await providerTurn("Tuần này nên chỉnh gì?", "Giữ RPE 7.");
    now = await createSupabaseCoherenceStore(a.client).load(a.userId);
    expect(now.status === "found" && now.state.expression.profile.verbosity?.value).toBe("DETAILED");

    // T3: a safety turn changes the lifecycle phase but the safety context overlay never writes the expression profile
    const before = now.status === "found" ? JSON.stringify(now.state.expression.profile) : "";
    const safety = await providerTurn("Mình đang đau ngực và chóng mặt khi tập.", "Cứ tập tiếp nhẹ là được.");
    expect(safety.out.text).not.toMatch(/cứ tập tiếp|tập nhẹ là được/i);
    now = await createSupabaseCoherenceStore(a.client).load(a.userId);
    expect(now.status === "found" && JSON.stringify(now.state.expression.profile)).toBe(before);
    expect(now.status === "found" && now.state.safety.phase).not.toBe("NONE");

    // user isolation: B has no row and cannot read A's (RLS)
    expect((await createSupabaseCoherenceStore(b.client).load(b.userId)).status).toBe("empty");
    expect(await rowOf(b.client, a.userId)).toBeNull();

    // CAS still rejects a stale writer
    const current = await createSupabaseCoherenceStore(a.client).load(a.userId);
    if (current.status !== "found") throw new Error("expected found");
    const stale = await createSupabaseCoherenceStore(a.client).commit(a.userId, current.state, current.rowVersion - 1);
    expect(stale).toMatchObject({ ok: false, reason: "conflict" });
  }, 60_000);
});
