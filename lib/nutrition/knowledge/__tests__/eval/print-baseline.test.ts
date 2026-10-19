import { it } from "vitest"
import { ACTIVE_CONFIG, BASELINE_CONFIG } from "../../score"
import { evaluate } from "./run-eval"

it.skipIf(!process.env.NUTRITION_EVAL_PRINT)("prints baseline vs frozen", () => {
  for (const [name, config] of [["BASELINE", BASELINE_CONFIG], ["FROZEN", ACTIVE_CONFIG]] as const) {
    for (const split of ["dev", "heldout", "all"] as const) {
      const { report } = evaluate(config, split)
      console.log(`REPORT ${name} ${split}`, JSON.stringify({ ...report, failures: undefined }))
      if (name === "FROZEN" && split !== "dev") for (const x of report.failures) console.log("  FAIL", split, x.id, x.why.slice(0, 150))
    }
  }
})
