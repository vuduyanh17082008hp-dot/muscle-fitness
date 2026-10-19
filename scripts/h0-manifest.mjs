// H0 evaluation manifest + canonical candidate fingerprint. Never records secret values.
//
//   node scripts/h0-manifest.mjs                write docs/evaluation/h0-manifest.json
//   node scripts/h0-manifest.mjs --fingerprint  print the candidate fingerprint only
//   node scripts/h0-manifest.mjs --check        recompute; PASS/FAIL against the manifest, listing
//                                               ADDED / REMOVED / MODIFIED paths on a mismatch
//   node scripts/h0-manifest.mjs --snapshot F   write the membership [{path, sha256, status}] to F
//   node scripts/h0-manifest.mjs --diff A B     compare two snapshots (or manifests)
//
// Fingerprint = sha256 over sorted lines `path \0 sha256(file bytes)` for every file git
// would carry (tracked + untracked; a deleted tracked file hashes as <deleted>), minus EXCLUDED.
// Only the repo's own .gitignore files decide "ignored": --exclude-standard also reads the
// user-global core.excludesFile (HOME-dependent) and the shared .git/info/exclude, so the same
// tree enumerated 1616 files under one HOME and 1617 under another (.claude/settings.local.json).
// Content-only: independent of git config, HOME, enumeration order and mtimes.
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const MANIFEST = "docs/evaluation/h0-manifest.json"
const RUBRIC = "docs/evaluation/h0-release-rubric.md"
// docs/evaluation/: the manifest, the separately hashed rubric and evaluation output.
// .claude/: per-user Claude Code harness state (permission allowlist, scheduled-task locks). Nothing
// in it is tracked or read by the app, its build or its tests, and the harness rewrites it at will.
// supabase/.temp/cli-latest: the Supabase CLI's "newest release seen" cache, rewritten by any
// `npx supabase ...` update check (v2.120.0 -> v2.121.0 mid-evaluation). Nothing reads it; the
// sibling rest-version IS read (supabase start, db:check-rest) and stays hashed.
const EXCLUDED = ["docs/evaluation/", ".claude/", "supabase/.temp/cli-latest"]
const DB = "supabase_db_muscle-fitness-claude"

const sh = (cmd, args) => execFileSync(cmd, args, { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).toString()
const sha = (data) => createHash("sha256").update(data).digest("hex")
const fileSha = (file) => (existsSync(join(root, file)) ? sha(readFileSync(join(root, file))) : "<deleted>")
const hashFiles = (files) => {
  const list = [...new Set(files)].sort()
  return { sha256: sha(list.map((file) => `${file}\0${fileSha(file)}`).join("\n")), files: list.length }
}

function members() {
  const list = (args) =>
    new Set(sh("git", ["ls-files", "-z", ...args]).split("\0").filter((file) => file && !EXCLUDED.some((prefix) => file.startsWith(prefix))))
  const tracked = list(["--cached"])
  const untracked = list(["--others", "--exclude-per-directory=.gitignore"])
  return [...new Set([...tracked, ...untracked])].sort().map((path) => {
    const sha256 = fileSha(path)
    return { path, sha256, status: sha256 === "<deleted>" ? "deleted" : tracked.has(path) ? "tracked" : "untracked" }
  })
}

const fingerprint = (snapshot = members()) => hashFiles(snapshot.map((m) => m.path))

// Prints one `ADDED|REMOVED|MODIFIED path` line per difference; returns the count.
function diff(before, after) {
  const a = new Map(before.map((m) => [m.path, m.sha256]))
  const b = new Map(after.map((m) => [m.path, m.sha256]))
  const out = {
    ADDED: [...b.keys()].filter((p) => !a.has(p)),
    REMOVED: [...a.keys()].filter((p) => !b.has(p)),
    MODIFIED: [...b.keys()].filter((p) => a.has(p) && a.get(p) !== b.get(p)),
  }
  for (const [kind, paths] of Object.entries(out)) for (const path of paths) console.log(`${kind} ${path}`)
  return out.ADDED.length + out.REMOVED.length + out.MODIFIED.length
}
const loadSnapshot = (file) => {
  const json = JSON.parse(readFileSync(file, "utf8"))
  return Array.isArray(json) ? json : json.candidate.fingerprint.members
}

const mode = process.argv[2]
if (mode === "--fingerprint") {
  const { sha256, files } = fingerprint()
  console.log(`${sha256} (${files} files)`)
} else if (mode === "--snapshot") {
  writeFileSync(process.argv[3], `${JSON.stringify(members(), null, 1)}\n`)
} else if (mode === "--diff") {
  process.exitCode = diff(loadSnapshot(process.argv[3]), loadSnapshot(process.argv[4])) ? 1 : 0
} else if (mode === "--check") {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), "utf8"))
  const now = members()
  const checks = {
    FINGERPRINT: [manifest.candidate.fingerprint.sha256, fingerprint(now).sha256],
    RUBRIC_SHA256: [manifest.grader.rubric.sha256, fileSha(RUBRIC)],
  }
  let ok = true
  for (const [name, [recorded, actual]] of Object.entries(checks)) {
    ok &&= recorded === actual
    console.log(`${recorded === actual ? "PASS" : "FAIL"} — ${name} manifest=${recorded} actual=${actual}`)
  }
  if (checks.FINGERPRINT[0] !== checks.FINGERPRINT[1]) {
    if (manifest.candidate.fingerprint.members) diff(manifest.candidate.fingerprint.members, now)
    else console.log("(manifest has no per-file members; regenerate it to get ADDED/REMOVED/MODIFIED paths)")
  }
  process.exitCode = ok ? 0 : 1
} else {
  await writeManifest()
}

async function writeManifest() {
  const env = Object.fromEntries(
    readFileSync(join(root, ".env.local"), "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  )
  const SECRET = /KEY|SECRET|TOKEN|PASSWORD|URL|DSN|PRIVATE/
  const flags = Object.fromEntries(
    Object.entries(env).filter(([k]) => /MODEL|CONFIG|MODE|ENABLE|FLAG|LIVE|RETRIEVAL/.test(k) && !SECRET.test(k)),
  )

  let database
  try {
    const applied = sh("docker", ["exec", DB, "psql", "-U", "postgres", "-tAc", "select version from supabase_migrations.schema_migrations order by version"])
      .split("\n").map((s) => s.trim()).filter(Boolean)
    const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]).sort()
    const notApplied = files.filter((v) => !applied.includes(v))
    const appliedNotInRepo = applied.filter((v) => !files.includes(v))
    // pg_dump >= 17.6 writes a random \restrict token per dump; drop it so the hash is stable.
    const schema = sh("docker", ["exec", DB, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--schema=public"])
      .split("\n").filter((l) => !/^\\(un)?restrict /.test(l)).join("\n")
    database = {
      localStack: "supabase_*_muscle-fitness-claude (Docker)",
      migrations: { parity: notApplied.length === 0 && appliedNotInRepo.length === 0, appliedCount: applied.length, filesCount: files.length, latestApplied: applied.at(-1), notApplied, appliedNotInRepo, sha256: sha(applied.join("\n")) },
      publicSchemaSha256: sha(schema),
      hosted: "NOT_VERIFIED (off-limits)",
    }
  } catch (error) {
    database = { state: "NOT_VERIFIED", reason: String(error.message).slice(0, 120) }
  }

  let postgrest = "NOT_VERIFIED"
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, { method: "HEAD", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(5000) })
    postgrest = res.headers.get("server") ?? "UNKNOWN"
  } catch {}

  const snapshot = members()
  const untracked = snapshot.filter((m) => m.status === "untracked")
  const pc = "lib/intelligence/performance-core"
  const manifest = {
    manifestVersion: 2,
    generatedAt: new Date().toISOString(),
    candidate: {
      repo: "muscle-fitness-claude",
      branch: sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
      head: sh("git", ["rev-parse", "HEAD"]).trim(),
      worktreeState: "UNCOMMITTED",
      modifiedTracked: sh("git", ["diff", "HEAD", "--name-only"]).split("\n").filter(Boolean).length,
      untracked: untracked.length,
      untrackedNote: "untracked fingerprint members (repo .gitignore rules only, EXCLUDED prefixes dropped)",
      fingerprint: {
        ...fingerprint(snapshot),
        procedure: "node scripts/h0-manifest.mjs --fingerprint (verify: --check; ad hoc: --snapshot F / --diff A B)",
        includes: "every tracked + untracked file not ignored by the repo's own .gitignore files, by content",
        excludes: [...EXCLUDED, "paths ignored by the repo's .gitignore files (node_modules, .next, next-env.d.ts, *.tsbuildinfo, .env*, untracked supabase/.temp)"],
        notConsulted: "user-global core.excludesFile and .git/info/exclude (machine/HOME-specific)",
        members: snapshot,
      },
    },
    hashFormat: "sha256 over sorted lines `path \\0 sha256(bytes)` joined by \\n, except grader.rubric.sha256 = plain sha256 of the file",
    prompts: hashFiles(["app/api/chatbot/route.ts", `${pc}/brief.ts`, "lib/nutrition/coach/chat.ts", "lib/nutrition/coach/orchestration/respond.ts", "lib/nutrition/coach/orchestration/understand.ts", "lib/nutrition/knowledge/semantic-gate.ts"]),
    policy: hashFiles([`${pc}/policy.ts`, `${pc}/output-integrity.ts`, `${pc}/answerability.ts`, `${pc}/claim-scope.ts`, `${pc}/claim-revision.ts`, `${pc}/candidates.ts`, `${pc}/registry.ts`, `${pc}/conversation-control.ts`, "lib/dante-core/safety-layer.ts", "lib/dante-core/turn-budget.ts", "lib/nutrition/coach/orchestration/safety.ts"]),
    knowledge: {
      canonicalCore: hashFiles([...walk(`${pc}/knowledge`), `${pc}/sources.ts`]),
      nutritionCorpus: hashFiles(walk("knowledge/nutrition")),
      note: "Runtime nutrition retrieval R3_H uses precomputed corpus vectors inside the hashed corpus files.",
    },
    model: {
      configured: { DANTE_OPENAI_MODEL: env.DANTE_OPENAI_MODEL ?? "(default gpt-4o-mini)", DANTE_OPENAI_FALLBACK_MODEL: env.DANTE_OPENAI_FALLBACK_MODEL ?? "(default gpt-4o-mini)", OPENAI_MODEL: env.OPENAI_MODEL ?? null },
      observedInLiveSmoke: "gpt-4o-mini (model field of Dante done events, 2026-10-16)",
      temperature: "0.35 (Gemma/legacy); stream path per lib/dante-core/openai/client.ts",
    },
    featureFlags: { fromEnvLocal: flags, defaults: { NUTRITION_RETRIEVAL_CONFIG: "R3_H unless set to R3" } },
    runtimeBudget: { turnDeadlineMs: 60000, danteProviderCap: 4, danteSemanticCap: 3, gemmaProviderCap: 6, retrievalPhaseMs: 10000, earlyReadMs: 3000, gemmaContextLoadMs: 6000 },
    database,
    postgrest: { local: postgrest, pinFile: readFileSync(join(root, "supabase/.temp/rest-version"), "utf8").trim(), check: "npm run db:check-rest", hosted: "NOT_VERIFIED" },
    evalDataset: { version: "TO_BE_CREATED_BY_CODEX", note: "Owned by the independent Codex broad evaluation; not created or pre-generated by the candidate side." },
    grader: {
      rubric: { path: RUBRIC, sha256: fileSha(RUBRIC) },
      liveSmokes: hashFiles(["lib/dante-core/__tests__/h0-closure.live.test.ts", "app/api/chatbot/__tests__/gemma-runtime-budget.live.test.ts"]),
    },
    unpinned: [
      "OpenAI model alias gpt-4o-mini (provider-side snapshot not pinnable)",
      "live PubMed / Europe PMC / MedlinePlus / USDA / Open Food Facts results (external, time-varying)",
      "hosted Supabase schema and PostgREST version (NOT_VERIFIED, off-limits)",
      "Docker image contents beyond the recorded PostgREST version",
    ],
  }
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify({ head: manifest.candidate.head, fingerprint: manifest.candidate.fingerprint.sha256, rubric: manifest.grader.rubric.sha256, postgrest, parity: database.migrations?.parity }))
}

function walk(dir) {
  return statSync(join(root, dir)).isDirectory() ? readdirSync(join(root, dir)).flatMap((name) => walk(`${dir}/${name}`)) : [dir]
}
