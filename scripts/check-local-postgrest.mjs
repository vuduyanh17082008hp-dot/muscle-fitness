// Fails loudly when the LOCAL Supabase stack runs a PostgREST with the
// stale-clock-after-idle bug (PostgREST #5196: a fresh token is rejected with
// PGRST303 "JWT issued at future" on the first parallel burst after >30s idle;
// fixed in v14.18).
//
// Why a check and not a pin: the Supabase CLI has no config key for the
// PostgREST image. `supabase start` reads supabase/.temp/rest-version (falling
// back to its bundled default), and `supabase link` overwrites that file with
// the linked hosted project's version. So the pin can silently revert; this
// script detects it. The hosted project is never contacted.
//
// Usage: npm run db:check-rest
import { readFileSync, writeSync } from "node:fs";

const MIN = [14, 18];

const env = { ...readEnvFile(".env.local"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL / key not set");
if (/\.supabase\.(co|in)$/i.test(new URL(url).hostname)) {
  writeSync(1, "HOSTED_POSTGREST_VERSION = NOT_VERIFIED (hosted project is not checked)\n");
  process.exit(0);
}

let res;
try {
  res = await fetch(`${url}/rest/v1/`, { method: "HEAD", headers: { apikey: key }, signal: AbortSignal.timeout(5000) });
} catch (error) {
  fail(`local stack unreachable at ${url}: ${error.message}`);
}
const server = res.headers.get("server") ?? "";
const match = /postgrest\/(\d+)\.(\d+)/i.exec(server);
if (!match) fail(`could not read PostgREST version (Server: "${server}", HTTP ${res.status})`);

const running = [Number(match[1]), Number(match[2])];
const pinned = readOptional("supabase/.temp/rest-version");
const label = `v${running.join(".")}`;
if (pinned && pinned !== label) {
  writeSync(2, `WARN supabase/.temp/rest-version says ${pinned} but the stack runs ${label}; restart the stack or fix the pin\n`);
}
if (running[0] < MIN[0] || (running[0] === MIN[0] && running[1] < MIN[1])) {
  fail(
    `local PostgREST ${label} has the idle stale-clock JWT bug (PGRST303 bursts). ` +
      `Set supabase/.temp/rest-version to v${MIN.join(".")} and run: npx supabase stop && npx supabase start`,
  );
}
// Synchronous writes: console.* to a Windows pipe is async, and process.exit()
// can drop the line before a captured run sees it.
writeSync(1, `PASS — local PostgREST ${label} satisfies >= v${MIN.join(".")}\n`);

function fail(message) {
  writeSync(2, `FAIL — ${message}\n`);
  process.exit(1);
}

function readOptional(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function readEnvFile(path) {
  return Object.fromEntries(
    readOptional(path)
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
}
