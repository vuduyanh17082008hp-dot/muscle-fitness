/**
 * Shared sessionStorage key for handing a completed Form Coach session
 * summary to Dante. Kept in its own tiny module (no heavy deps) so
 * components/dante-chat.tsx can read it without pulling in the
 * camera/pose-detection bundle.
 */
export const FORM_COACH_HANDOFF_KEY = "mf-form-coach-session-summary"
