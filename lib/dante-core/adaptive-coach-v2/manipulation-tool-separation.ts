/**
 * Keep SYSTEM_OVERRIDE / anti-manipulation separate from write confirmation
 * unless an actual write/action intent is present.
 */
export function evaluateManipulationAndToolIntent(message: string): {
  manipulation: boolean;
  writeIntent: boolean;
  requiresConfirmation: boolean;
} {
  const manipulation = /(?:ignore|override|bypass|disable).{0,40}(?:rules?|safety|instructions?)|act as (?:an )?evil coach|bo quy tac|bo safety/i.test(message);
  const writeIntent = /(?:save|luu|sua|doi|update|modify|persist|write).{0,40}(?:workout|program|plan|buoi|bai tap)|(?:workout|program).{0,40}(?:save|luu|without ask|khong hoi|dung confirm)/i.test(message);
  return {
    manipulation,
    writeIntent,
    requiresConfirmation: writeIntent,
  };
}
