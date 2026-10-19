import { isWorkoutMutationRequest } from "@/lib/dante-core/tools/action-response-guard";

/**
 * Keep SYSTEM_OVERRIDE / anti-manipulation separate from write confirmation
 * unless an actual write/action intent is present.
 * Workout-edit intent has one authority: isWorkoutMutationRequest.
 */
export function evaluateManipulationAndToolIntent(message: string): {
  manipulation: boolean;
  writeIntent: boolean;
  requiresConfirmation: boolean;
} {
  const manipulation = /(?:ignore|override|bypass|disable).{0,40}(?:rules?|safety|instructions?)|act as (?:an )?evil coach|bo quy tac|bo safety/i.test(message);
  const writeIntent = isWorkoutMutationRequest(message);
  return {
    manipulation,
    writeIntent,
    requiresConfirmation: writeIntent,
  };
}
