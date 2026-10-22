// @vitest-environment node
/**
 * Role authority + private Dante conversations, against the LOCAL Docker Supabase only (never hosted).
 * SQL-level as the `authenticated` role with JWT claims, exactly what PostgREST runs. Every statement runs in its own
 * transaction and rolls back; fixture users are removed afterwards. Skipped when the container / migrations are absent.
 */
import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

// App-level checks: lib/auth/permissions.ts runs against the real local PostgREST as the signed-in user (RLS applies).
const app = vi.hoisted(() => ({ uid: "" }))
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`) } }))
vi.mock("@/lib/audit/log", () => ({ writeAuditLog: async () => {} }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient(app.uid) }))

const API_URL = process.env.MF_TEST_API_URL ?? "http://127.0.0.1:54331"
const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long" // well-known local demo secret
function localJwt(claims: Record<string, unknown>) {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url")
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iss: "supabase-demo", exp: 1983812996, ...claims })}`
  return `${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(body).digest("base64url")}`
}
function userClient(uid: string) {
  const token = localJwt({ sub: uid, role: "authenticated", aud: "authenticated" })
  const client = createSupabaseClient(API_URL, localJwt({ role: "anon" }), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  // GoTrue isn't part of what's under test; the data reads below go through PostgREST + RLS as this user.
  client.auth.getUser = (async () => ({ data: { user: { id: uid } }, error: null })) as unknown as typeof client.auth.getUser
  return client
}

const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"

function run(sql: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", process.env.MF_TEST_DB_NAME ?? "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    encoding: "utf8",
  })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" }
}

const dbReady = (() => {
  const r = run("select count(*) from pg_trigger where tgname = 'profiles_guard_role';")
  return r.ok && r.out === "1"
})()

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const tag = randomUUID().slice(0, 8)
const normal = randomUUID() // has the signup user_roles row
const noRole = randomUUID() // user_roles row missing (failed trigger / imported account)
const admin = randomUUID() // user_roles = admin
const victim = randomUUID()
const forged = randomUUID() // legacy data: profiles.role = admin, no user_roles row
const victimThread = randomUUID()
const all = [normal, noRole, admin, victim, forged]

/** One rolled-back transaction as `uid`; returns the last value line. */
function asUser(uid: string, body: string) {
  const claims = JSON.stringify({ sub: uid, role: "authenticated" })
  const r = run(`begin; set local role authenticated; select set_config('request.jwt.claims', ${q(claims)}, true); ${body} rollback;`)
  const values = r.out.split("\n").filter((l) => l && !/^(BEGIN|SET|ROLLBACK|UPDATE \d+|INSERT \d+ \d+|DELETE \d+)$/.test(l) && !l.startsWith("{"))
  return { ...r, value: values.at(-1) }
}

beforeAll(() => {
  if (!dbReady) return
  const users = all.map((id, i) => `(${q(id)}, ${q(`authz${i}.${tag}@example.com`)}, 'authenticated', 'authenticated')`)
  const r = run(`
    insert into auth.users (id, email, aud, role) values ${users.join(", ")};
    delete from public.user_roles where user_id in (${q(noRole)}, ${q(forged)});
    update public.profiles set role = 'admin' where user_id = ${q(forged)};
    update public.user_roles set role = 'admin' where user_id = ${q(admin)};
    insert into public.ai_threads (id, user_id, title) values (${q(victimThread)}, ${q(victim)}, 'private');
    insert into public.ai_messages (thread_id, user_id, role, content) values (${q(victimThread)}, ${q(victim)}, 'user', 'private text');
  `)
  expect(r.err).toBe("")
})
afterAll(() => {
  if (dbReady) run(`delete from auth.users where id in (${all.map(q).join(", ")});`)
})

describe.skipIf(!dbReady)("user_roles is the only role authority (SQL)", () => {
  it("a forged profiles.role = admin without a user_roles row grants nothing", () => {
    expect(run(`select role from public.profiles where user_id = ${q(forged)};`).out).toBe("admin")
    expect(asUser(forged, "select public.current_app_role() || '|' || public.is_admin() || '|' || public.is_staff();").value).toBe("client|false|false")
    expect(asUser(forged, `select count(*) from public.user_roles where user_id <> ${q(forged)};`).value).toBe("0")
    expect(asUser(forged, `select count(*) from public.profiles where user_id <> ${q(forged)};`).value).toBe("0")
    expect(asUser(forged, `select count(*) from public.ai_threads where user_id = ${q(victim)};`).value).toBe("0")
    expect(asUser(forged, `select public.get_user_foundation(${q(victim)});`).err).toMatch(/do not have access/)
  })

  it("a missing user_roles row resolves to client; the signup row (user) to client; admin to admin", () => {
    expect(asUser(noRole, "select public.current_app_role() || '|' || public.is_admin();").value).toBe("client|false")
    expect(asUser(normal, "select public.current_app_role() || '|' || public.is_admin();").value).toBe("client|false")
    expect(asUser(admin, "select public.current_app_role() || '|' || public.is_admin();").value).toBe("admin|true")
  })

  it("clients cannot write user_roles directly or self-promote through admin_set_user_role", () => {
    const ins = asUser(noRole, `insert into public.user_roles (user_id, role) values (${q(noRole)}, 'admin');`)
    expect(ins.ok).toBe(false)
    expect(ins.err).toMatch(/permission denied/)
    const upd = asUser(normal, `update public.user_roles set role = 'admin' where user_id = ${q(normal)};`)
    expect(upd.ok).toBe(false)
    expect(upd.err).toMatch(/permission denied/)
    const rpc = asUser(forged, `select public.admin_set_user_role(${q(forged)}, 'admin');`)
    expect(rpc.ok).toBe(false)
    expect(rpc.err).toMatch(/Admin access required/)
  })
})

describe.skipIf(!dbReady)("user_roles is the only role authority (app: lib/auth/permissions.ts over real PostgREST)", () => {
  const actorAs = async (uid: string) => {
    app.uid = uid
    const p = await import("@/lib/auth/permissions")
    return { actor: await p.getAuthenticatedActor(), isAdmin: await p.assertIsAdmin(), require: p.requireAdmin().then(() => "ok", (e: Error) => e.message) }
  }

  it("forged profiles.role = admin → client, requireAdmin redirects", async () => {
    const r = await actorAs(forged)
    expect(r.actor?.role).toBe("client")
    expect(r.isAdmin).toBe(false)
    expect(await r.require).toBe("REDIRECT:/unauthorized")
  })

  it("no user_roles row → client, requireAdmin redirects", async () => {
    const r = await actorAs(noRole)
    expect(r.actor?.effectiveRole).toBe("client")
    expect(await r.require).toBe("REDIRECT:/unauthorized")
  })

  it("signup user_roles = user → client, requireAdmin redirects", async () => {
    const r = await actorAs(normal)
    expect(r.actor?.effectiveRole).toBe("client")
    expect(await r.require).toBe("REDIRECT:/unauthorized")
  })

  it("user_roles = admin → admin, requireAdmin passes", async () => {
    const r = await actorAs(admin)
    expect(r.actor?.role).toBe("admin")
    expect(r.isAdmin).toBe(true)
    expect(await r.require).toBe("ok")
  })

  it("setUserRoleWithAudit cannot be used to self-promote", async () => {
    app.uid = forged
    const { setUserRoleWithAudit } = await import("@/lib/auth/permissions")
    expect(await setUserRoleWithAudit({ targetUserId: forged, role: "admin" })).toEqual({ success: false, message: "Administrator access required." })
    expect(run(`select count(*) from public.user_roles where user_id = ${q(forged)};`).out).toBe("0")
  })
})

describe.skipIf(!dbReady)("profiles.role is server-owned", () => {
  it("a user without a user_roles row cannot self-assign admin (update or upsert) and is_admin() stays false", () => {
    expect(asUser(noRole, "select public.is_admin();").value).toBe("f")
    const upd = asUser(noRole, `update public.profiles set role = 'admin' where user_id = ${q(noRole)};`)
    expect(upd.ok).toBe(false)
    expect(upd.err).toMatch(/profiles.role is managed by the server/)
    const ups = asUser(noRole, `insert into public.profiles (user_id, role) values (${q(noRole)}, 'admin') on conflict (user_id) do update set role = excluded.role;`)
    expect(ups.ok).toBe(false)
    expect(ups.err).toMatch(/managed by the server/)
  })

  it("a fresh profile insert cannot carry an elevated role", () => {
    const r = asUser(noRole, `delete from public.profiles where user_id = ${q(noRole)}; insert into public.profiles (user_id, role) values (${q(noRole)}, 'admin');`)
    expect(r.ok).toBe(false)
    expect(r.err).toMatch(/managed by the server|permission denied/)
  })

  it("a normal user's own profile edits (incl. the onboarding upsert shape) still work", () => {
    const before = run(`select role from public.profiles where user_id = ${q(normal)};`).out
    const r = asUser(normal, `
      update public.profiles set full_name = 'X', timezone = 'Asia/Ho_Chi_Minh' where user_id = ${q(normal)};
      insert into public.profiles (user_id, full_name, onboarding_completed) values (${q(normal)}, 'Y', true)
        on conflict (user_id) do update set full_name = excluded.full_name, onboarding_completed = excluded.onboarding_completed;
      select full_name || '|' || role from public.profiles where user_id = ${q(normal)};`)
    expect(r.err).toBe("")
    expect(r.value).toBe(`Y|${before}`)
  })

  it("server-side writers (service_role) can still change the role", () => {
    const r = run(`begin; set local role service_role; update public.profiles set role = 'coach' where user_id = ${q(normal)}; select role from public.profiles where user_id = ${q(normal)}; rollback;`)
    expect(r.err).toBe("")
    expect(r.out).toMatch(/coach/)
  })
})

describe.skipIf(!dbReady)("Dante conversations are owner-only, admins included", () => {
  it("the owner reads their own thread", () => {
    expect(asUser(victim, `select count(*) from public.ai_messages where thread_id = ${q(victimThread)};`).value).toBe("1")
  })

  it("a real admin (user_roles) is is_admin() but sees and changes nothing of another user's conversation", () => {
    expect(asUser(admin, "select public.is_admin();").value).toBe("t")
    expect(asUser(admin, `select count(*) from public.ai_threads where user_id = ${q(victim)};`).value).toBe("0")
    expect(asUser(admin, `select count(*) from public.ai_messages where user_id = ${q(victim)};`).value).toBe("0")
    expect(asUser(admin, `with u as (update public.ai_messages set content = 'x' where thread_id = ${q(victimThread)} returning 1) select count(*) from u;`).value).toBe("0")
    expect(asUser(admin, `with d as (delete from public.ai_threads where id = ${q(victimThread)} returning 1) select count(*) from d;`).value).toBe("0")
    const ins = asUser(admin, `insert into public.ai_messages (thread_id, user_id, role, content) values (${q(victimThread)}, ${q(victim)}, 'user', 'x');`)
    expect(ins.ok).toBe(false)
    expect(ins.err).toMatch(/row-level security/)
  })

  it("an ordinary user cannot read, change, delete or post into another user's thread", () => {
    expect(asUser(normal, `select count(*) from public.ai_messages where thread_id = ${q(victimThread)};`).value).toBe("0")
    expect(asUser(normal, `with u as (update public.ai_threads set title = 'x' where id = ${q(victimThread)} returning 1) select count(*) from u;`).value).toBe("0")
    expect(asUser(normal, `with d as (delete from public.ai_messages where thread_id = ${q(victimThread)} returning 1) select count(*) from d;`).value).toBe("0")
    expect(asUser(normal, `with u as (update public.ai_threads set user_id = ${q(normal)} where id = ${q(victimThread)} returning 1) select count(*) from u;`).value).toBe("0")
    expect(run(`select count(*) from public.ai_messages where thread_id = ${q(victimThread)} and content = 'private text';`).out).toBe("1")
    const ins = asUser(normal, `insert into public.ai_messages (thread_id, user_id, role, content) values (${q(victimThread)}, ${q(normal)}, 'user', 'x');`)
    expect(ins.ok).toBe(false)
    expect(ins.err).toMatch(/row-level security/)
  })

  it("TRUNCATE (which ignores RLS) is not granted to clients", () => {
    for (const t of ["ai_messages", "ai_threads"]) {
      const r = asUser(normal, `truncate public.${t} cascade;`)
      expect(r.ok, t).toBe(false)
      expect(r.err, t).toMatch(/permission denied/)
    }
  })
})
