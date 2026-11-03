import { spawnSync } from "node:child_process"

/**
 * Vitest globalSetup. The *.db.test.ts suites pick their stack from four
 * MF_TEST_* vars and otherwise default to the shared local stack. Two ways that
 * goes wrong silently: a selected container that isn't running makes every DB
 * suite skip (a green run that tested nothing), and a partial selection pairs
 * one stack's DB with another stack's API (coach-signal-store also falls back
 * to :54331 when its URL is unreachable). So: no MF_TEST_* set → no-op, the
 * defaults apply as before; any set → all four set and reachable, or the run fails.
 */
const VARS = ["MF_TEST_DB_CONTAINER", "MF_TEST_AUTH_CONTAINER", "MF_TEST_API_URL", "MF_TEST_SUPABASE_URL"] as const

export default async function setup() {
  const set = VARS.filter((name) => process.env[name])
  if (set.length === 0) return

  const fail = (why: string) => {
    throw new Error(`DB test target: ${why}. Run \`node scripts/test-db-stack.mjs\` and use the env line it prints.`)
  }
  if (set.length !== VARS.length) fail(`set all of ${VARS.join(", ")} or none (missing: ${VARS.filter((n) => !set.includes(n)).join(", ")})`)

  for (const name of ["MF_TEST_DB_CONTAINER", "MF_TEST_AUTH_CONTAINER"] as const) {
    const container = process.env[name]!
    const r = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" })
    if (r.stdout.trim() !== "true") fail(`${name}=${container} is not running`)
  }
  for (const name of ["MF_TEST_API_URL", "MF_TEST_SUPABASE_URL"] as const) {
    const url = process.env[name]!
    const status = await fetch(`${url}/rest/v1/`, { signal: AbortSignal.timeout(3000) }).then((res) => res.status, () => 0)
    if (status === 0 || status >= 500) fail(`${name}=${url} is unreachable (status ${status})`)
  }
}
