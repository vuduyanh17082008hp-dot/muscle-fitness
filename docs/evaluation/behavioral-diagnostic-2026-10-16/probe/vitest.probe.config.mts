import path from "node:path";
const repo = path.resolve(import.meta.dirname, "../../../..");
export default {
  root: repo,
  resolve: { alias: { "@": repo, "server-only": path.resolve(repo, "test/server-only-stub.ts") } },
  test: { include: ["docs/evaluation/behavioral-diagnostic-2026-10-16/probe/*.probe.test.ts"], setupFiles: [path.resolve(repo, "test/setup.ts")], environment: "node" },
};
