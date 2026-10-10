import { it } from "vitest"

import { R3_CONFIG, R3F_CONFIG } from "../../score"
import { multiLine, semantic, skips, store, v4Block } from "./semantic-lab"

/**
 * N1.6.3-R3-G experiments (DEV only). R3G=<stage> vitest run <this file>:
 *   repr  : query x corpus representation (G1 section-only)      budget : candidate budget k (G1)
 *   tie   : G2 epsilon grid       blend : G3 alpha/beta grid      doc : G4
 */
const stage = process.env.R3G ?? ""
const out = (lines: string[]) => console.log(["", ...lines, `store: ${store.size} vectors, load ${store.loadMs.toFixed(0)}ms; skipped reranks: ${skips}`].join(String.fromCharCode(10)))

it.skipIf(stage !== "baseline")("R3-G baselines", { timeout: 900000 }, () => {
  out([v4Block("R3 (active)", R3_CONFIG), v4Block("R3-F F5", R3F_CONFIG)])
})
it.skipIf(stage !== "repr")("R3-G G1 representation", { timeout: 900000 }, () => {
  const rows: string[] = []
  for (const query of ["raw", "intent"] as const) for (const corpus of ["body", "titled"] as const) rows.push(v4Block(`G1 q=${query} c=${corpus}`, semantic({ mode: "section", query, corpus })))
  out(rows)
})
it.skipIf(stage !== "budget")("R3-G G1 budget", { timeout: 900000 }, () => {
  const q = (process.env.R3G_Q ?? "raw") as "raw" | "intent", c = (process.env.R3G_C ?? "body") as "body" | "titled"
  out([6, 8, 12, 16, 24, 40].map((k) => v4Block(`G1 k=${k}`, semantic({ mode: "section", query: q, corpus: c, k }))))
})
it.skipIf(stage !== "tie")("R3-G G2 tie-break", { timeout: 900000 }, () => {
  const q = (process.env.R3G_Q ?? "raw") as "raw" | "intent", c = (process.env.R3G_C ?? "body") as "body" | "titled", k = Number(process.env.R3G_K ?? 12)
  out([0.012, 0.03, 0.06, 0.1].map((epsilon) => v4Block(`G2 eps=${epsilon}`, semantic({ mode: "tie", query: q, corpus: c, k, epsilon }))))
})
it.skipIf(stage !== "blend")("R3-G G3 blend", { timeout: 900000 }, () => {
  const q = (process.env.R3G_Q ?? "raw") as "raw" | "intent", c = (process.env.R3G_C ?? "body") as "body" | "titled", k = Number(process.env.R3G_K ?? 12)
  out([[0.8, 0.2], [0.7, 0.3], [0.6, 0.4]].map(([alpha, beta]) => v4Block(`G3 ${alpha * 100}/${beta * 100}`, semantic({ mode: "blend", query: q, corpus: c, k, alpha, beta }))))
})
it.skipIf(stage !== "doc")("R3-G G4 doc tie-break + section", { timeout: 900000 }, () => {
  const q = (process.env.R3G_Q ?? "raw") as "raw" | "intent", c = (process.env.R3G_C ?? "body") as "body" | "titled", k = Number(process.env.R3G_K ?? 12)
  out([0.012, 0.03, 0.06, 0.1].map((docEpsilon) => v4Block(`G4 docEps=${docEpsilon}`, semantic({ mode: "doc+section", query: q, corpus: c, k, docEpsilon }))))
})
it.skipIf(stage !== "four")("R3-G four-suite", { timeout: 900000 }, () => {
  const base = { query: "raw", corpus: "titled" } as const
  out([
    multiLine("R3 (active)", R3_CONFIG),
    multiLine("R3-F F5", R3F_CONFIG),
    multiLine("G1 section-only", semantic({ ...base, mode: "section" })),
    multiLine("G2 tie eps=0.06", semantic({ ...base, mode: "tie", epsilon: 0.06 })),
    multiLine("G3 blend 50/50", semantic({ ...base, mode: "blend", alpha: 0.5, beta: 0.5 })),
    multiLine("G3 blend 40/60", semantic({ ...base, mode: "blend", alpha: 0.4, beta: 0.6 })),
    multiLine("G4 doc eps=0.06", semantic({ ...base, mode: "doc+section", docEpsilon: 0.06 })),
  ])
})
it.skipIf(stage !== "blend2")("R3-G G3 extension (beyond the suggested grid; the trend was still rising at 60/40)", { timeout: 900000 }, () => {
  const rows: string[] = []
  for (const [alpha, beta] of [[0.5, 0.5], [0.4, 0.6]]) rows.push(v4Block(`G3 ${alpha * 100}/${beta * 100} raw/titled k12`, semantic({ mode: "blend", query: "raw", corpus: "titled", alpha, beta })))
  rows.push(v4Block("G3 60/40 raw/titled k8", semantic({ mode: "blend", query: "raw", corpus: "titled", alpha: 0.6, beta: 0.4, k: 8 })))
  rows.push(v4Block("G3 60/40 raw/titled k20", semantic({ mode: "blend", query: "raw", corpus: "titled", alpha: 0.6, beta: 0.4, k: 20 })))
  rows.push(v4Block("G3 60/40 raw/body k12", semantic({ mode: "blend", query: "raw", corpus: "body", alpha: 0.6, beta: 0.4 })))
  rows.push(v4Block("G3 60/40 intent/titled k12", semantic({ mode: "blend", query: "intent", corpus: "titled", alpha: 0.6, beta: 0.4 })))
  rows.push(v4Block("G3 60/40 intent/body k12", semantic({ mode: "blend", query: "intent", corpus: "body", alpha: 0.6, beta: 0.4 })))
  out(rows)
})
it.skipIf(stage !== "best")("R3-G best candidate vs R3 (full block, latency, context)", { timeout: 900000 }, () => {
  out([v4Block("R3 (active)", R3_CONFIG), v4Block("R3-G G3 50/50 raw/titled k12", semantic({ mode: "blend", query: "raw", corpus: "titled", alpha: 0.5, beta: 0.5 })), v4Block("R3-G G3 50/50 (2nd run, latency)", semantic({ mode: "blend", query: "raw", corpus: "titled", alpha: 0.5, beta: 0.5 }))])
})
