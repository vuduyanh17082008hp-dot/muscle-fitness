import type { ToolExecutionPlan, ToolNeedDecision, ToolStep } from "./types"

/**
 * Explicit, dependency-ordered tool execution plan.
 *
 * Rules (enforced by validateToolPlan, not by convention):
 *  - steps are listed in execution order and each tool appears at most once (no duplicate calls);
 *  - a step may consume only EXTERNAL refs or the declared outputs of steps it depends on;
 *  - a dependent step whose dependency produced no output does not run (see tools.ts);
 *  - no mutation/action tool exists here: actions stay behind the existing confirmation path.
 */

export const EXTERNAL_REFS = ["CURRENT_USER_TURN", "CURRENT_FOOD_REFERENCE", "SESSION_USER"] as const

export const REFS = { nutritionState: "NUTRITION_STATE", foodResolution: "FOOD_RESOLUTION", macroResult: "MACRO_RESULT", knowledge: "RETRIEVED_KNOWLEDGE" } as const

type Need = Pick<ToolNeedDecision, "needNutritionState" | "needGoalContext" | "needFoodLookup" | "needMacroCalculation" | "needKnowledgeRetrieval">

export function buildToolPlan(need: Need): ToolExecutionPlan {
  const steps: ToolStep[] = []
  const add = (tool: ToolStep["tool"], inputRefs: string[], outputRef: string, dependsOn: ToolStep["tool"][] = []) => {
    const dependsOnStepIds = dependsOn.flatMap((dep) => steps.find((step) => step.tool === dep)?.stepId ?? [])
    steps.push({ stepId: `step${steps.length + 1}`, tool: tool, inputRefs, outputRef, dependsOnStepIds })
  }

  const needState = need.needNutritionState || need.needGoalContext
  if (needState) add("athlete_state_read", ["SESSION_USER"], REFS.nutritionState)
  if (need.needFoodLookup) add("food_lookup", ["CURRENT_FOOD_REFERENCE"], REFS.foodResolution)
  if (need.needMacroCalculation) {
    const inputs = [...(need.needFoodLookup ? [REFS.foodResolution] : []), ...(needState ? [REFS.nutritionState] : [])]
    add("macro_calculation", inputs, REFS.macroResult, [...(needState ? (["athlete_state_read"] as const) : []), ...(need.needFoodLookup ? (["food_lookup"] as const) : [])])
  }
  if (need.needKnowledgeRetrieval) add("knowledge_retrieval", ["CURRENT_USER_TURN"], REFS.knowledge)
  return { steps }
}

/** Returns a list of violations; empty means the plan is safe to execute. */
export function validateToolPlan(plan: ToolExecutionPlan): string[] {
  const errors: string[] = []
  const seenIds = new Set<string>()
  const seenTools = new Set<string>()
  const outputs = new Map<string, string>() // outputRef -> producing stepId
  for (const step of plan.steps) {
    if (seenIds.has(step.stepId)) errors.push(`duplicate step id ${step.stepId}`)
    if (seenTools.has(step.tool)) errors.push(`duplicate tool call ${step.tool}`)
    seenIds.add(step.stepId)
    seenTools.add(step.tool)
    for (const dep of step.dependsOnStepIds) if (!seenIds.has(dep) || dep === step.stepId) errors.push(`${step.stepId} depends on ${dep}, which does not run before it`)
    for (const ref of step.inputRefs) {
      if ((EXTERNAL_REFS as readonly string[]).includes(ref)) continue
      const producer = outputs.get(ref)
      if (!producer) errors.push(`${step.stepId} consumes ${ref}, which no earlier step outputs`)
      else if (!step.dependsOnStepIds.includes(producer)) errors.push(`${step.stepId} consumes ${ref} without declaring a dependency on ${producer}`)
    }
    if (outputs.has(step.outputRef)) errors.push(`output ${step.outputRef} is produced twice`)
    outputs.set(step.outputRef, step.stepId)
  }
  return errors
}
