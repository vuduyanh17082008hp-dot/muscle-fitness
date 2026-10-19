import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

// Runs scripts/h0-manifest.mjs --fingerprint inside a throwaway git repo, never the candidate.
const script = resolve("scripts/h0-manifest.mjs")
const dir = mkdtempSync(join(tmpdir(), "h0-fp-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir })
const write = (file: string, text: string) => {
  mkdirSync(join(dir, file, ".."), { recursive: true })
  writeFileSync(join(dir, file), text)
}
const fp = () => execFileSync(process.execPath, [script, "--fingerprint"], { cwd: dir }).toString().split(" ")[0]

describe("H0 candidate fingerprint", () => {
  write(".gitignore", "ignored.log\n")
  write("a.ts", "export const a = 1\n")
  write("lib/b.ts", "export const b = 2\n")
  git("init", "-q")
  git("add", ".")
  git("commit", "-qm", "init")
  write("untracked.ts", "export const u = 3\n")
  const base = fp()

  it("is reproducible and ignores mtimes, ignored files and evaluation output", () => {
    expect(fp()).toBe(base)
    utimesSync(join(dir, "a.ts"), new Date(0), new Date(0))
    write("ignored.log", "noise")
    write("docs/evaluation/codex-run.json", "{}")
    expect(fp()).toBe(base)
  })

  it("changes on a material tracked, untracked or deleted-file change", () => {
    write("a.ts", "export const a = 9\n")
    const tracked = fp()
    expect(tracked).not.toBe(base)
    write("a.ts", "export const a = 1\n")
    expect(fp()).toBe(base)

    write("untracked.ts", "export const u = 4\n")
    expect(fp()).not.toBe(base)
    write("untracked.ts", "export const u = 3\n")

    rmSync(join(dir, "lib/b.ts"))
    expect(fp()).not.toBe(base)
    write("lib/b.ts", "export const b = 2\n")
    expect(fp()).toBe(base)

    write("lib/new-candidate.ts", "export const n = 5\n")
    expect(fp()).not.toBe(base)
    rmSync(join(dir, "lib/new-candidate.ts"))
    expect(fp()).toBe(base)
  })

  it("ignores harness state and does not depend on machine-local ignore rules", () => {
    // The 1616 -> 1617 drift: a user-global excludesFile hid .claude/settings.local.json under one HOME only.
    write(".claude/settings.local.json", "{}")
    write(".claude/scheduled_tasks.lock", "1")
    write("supabase/.temp/cli-latest", "v2.121.0")
    expect(fp()).toBe(base)
    // The CLI's sibling pin file is runtime config and stays hashed.
    write("supabase/.temp/rest-version", "v14.18")
    expect(fp()).not.toBe(base)
    rmSync(join(dir, "supabase/.temp/rest-version"))
    expect(fp()).toBe(base)

    write("local-only.txt", "x")
    const noRules = fp()
    expect(noRules).not.toBe(base)
    const globalIgnore = `${dir}-global-ignore`
    writeFileSync(globalIgnore, "local-only.txt\n")
    const withGlobal = execFileSync(process.execPath, [script, "--fingerprint"], {
      cwd: dir,
      env: { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.excludesFile", GIT_CONFIG_VALUE_0: globalIgnore },
    }).toString().split(" ")[0]
    expect(withGlobal).toBe(noRules)
    write(".git/info/exclude", "local-only.txt\n")
    expect(fp()).toBe(noRules)
    rmSync(globalIgnore)
    rmSync(join(dir, "local-only.txt"))
    write(".git/info/exclude", "")
    expect(fp()).toBe(base)
  })

  it("names the exact changed paths between two snapshots", () => {
    const run = (...args: string[]) => {
      try {
        return execFileSync(process.execPath, [script, ...args], { cwd: dir }).toString()
      } catch (error) {
        return String((error as { stdout: Buffer }).stdout)
      }
    }
    run("--snapshot", join(dir, "docs/evaluation/a.json"))
    write("a.ts", "export const a = 2\n")
    write("added.ts", "x\n")
    rmSync(join(dir, "lib/b.ts"))
    run("--snapshot", join(dir, "docs/evaluation/b.json"))
    expect(run("--diff", join(dir, "docs/evaluation/a.json"), join(dir, "docs/evaluation/b.json")).trim().split(/\r?\n/).sort()).toEqual(
      ["ADDED added.ts", "MODIFIED a.ts", "MODIFIED lib/b.ts"],
    )
  })
})
