#!/usr/bin/env node
/**
 * Disposable Supabase stack for the *.db.test.ts suites.
 *
 *   node scripts/test-db-stack.mjs          # (re)build from this checkout's migrations, print env
 *   node scripts/test-db-stack.mjs stop     # remove it (data volumes included)
 *
 * Why: the default test container (supabase_db_muscle-fitness-claude) is the
 * one local stack every worktree on the machine shares, so it drifts behind
 * whichever branch you're on and must not be migrated from a feature branch.
 * This builds a separate stack ("mf-test-db", ports 566xx) from scratch on every
 * start — `supabase start` applies supabase/migrations in order — so the DB
 * always matches the working tree. Local Docker only; never touches hosted.
 * Run the CLI from a temp workdir so it can't rewrite tracked supabase/.temp files.
 */
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const PROJECT = "mf-test-db"
const API = "http://127.0.0.1:56631"
const work = join(tmpdir(), PROJECT)
const repo = join(import.meta.dirname, "..")

function cli(...args) {
  // One command string: npx is a .cmd shim on Windows, which needs a shell; the only path is quoted.
  const r = spawnSync(`npx --yes supabase ${args.join(" ")} --workdir "${work}"`, { cwd: work, stdio: "inherit", shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

mkdirSync(work, { recursive: true })
const running = spawnSync("docker", ["ps", "-q", "--filter", `name=^supabase_db_${PROJECT}$`], { encoding: "utf8" }).stdout.trim()
if (running && existsSync(join(work, "supabase", "config.toml"))) cli("stop", "--no-backup")
if (process.argv[2] === "stop") process.exit(0)

rmSync(join(work, "supabase"), { recursive: true, force: true })
cpSync(join(repo, "supabase"), join(work, "supabase"), {
  recursive: true,
  filter: (src) => !/[\\/]supabase[\\/]\.(temp|branches)([\\/]|$)/.test(src),
})
const configPath = join(work, "supabase", "config.toml")
const config = readFileSync(configPath, "utf8")
  .replace(/^project_id = ".*"$/m, `project_id = "${PROJECT}"`)
  .replace(/^((?:shadow_)?port) = 543(\d\d)$/gm, "$1 = 566$2")
  .replace(/^inspector_port = \d+$/m, "inspector_port = 56683")
if (!config.includes(`project_id = "${PROJECT}"`) || /^(?:shadow_)?port = 543\d\d$/m.test(config)) {
  console.error("config.toml rewrite failed — refusing to start a stack that could collide with the shared one")
  process.exit(1)
}
writeFileSync(configPath, config)

// Only db, auth (JWT secret), rest + kong (PostgREST tests) and storage (migrations reference storage.*) are needed.
cli("start", "-x", "realtime,studio,postgres-meta,imgproxy,mailpit,logflare,vector,supavisor,edge-runtime")

console.log(`
Test stack ready. Run the DB suites against it with:
  MF_TEST_DB_CONTAINER=supabase_db_${PROJECT} MF_TEST_AUTH_CONTAINER=supabase_auth_${PROJECT} MF_TEST_API_URL=${API} MF_TEST_SUPABASE_URL=${API} npm test`)
