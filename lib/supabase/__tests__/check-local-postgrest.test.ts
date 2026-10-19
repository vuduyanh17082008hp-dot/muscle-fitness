import { execFile } from "node:child_process"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

// Runs the real scripts/check-local-postgrest.mjs against a fake local PostgREST
// that reports a chosen version in its Server header.
let server: Server | undefined
afterEach(() => server?.close())

async function runGuard(version: string) {
  server = createServer((_req, res) => res.writeHead(200, { server: `postgrest/${version}` }).end())
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ["scripts/check-local-postgrest.mjs"],
      { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test" } },
      (error, stdout, stderr) => resolve({ code: error ? Number(error.code) : 0, stdout, stderr }),
    )
  })
}

describe("check-local-postgrest guard", () => {
  it("fails with a visible FAIL line below v14.18", async () => {
    const result = await runGuard("14.15")
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/^FAIL — local PostgREST v14\.15/m)
  })

  it("passes with a visible PASS line at v14.18", async () => {
    const result = await runGuard("14.18")
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/^PASS — local PostgREST v14\.18 satisfies >= v14\.18/m)
  })
})
