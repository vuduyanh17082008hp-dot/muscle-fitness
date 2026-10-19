// Fixture-corrected reruns of the three Gemma cases: in the 96-case set they seed no fitness profile, so Gemma
// answers "Complete your profile first" and the case never reaches the constraint (TEST_HARNESS_INVALID).
import { CASES as H1 } from './casesH1.mjs'
export const CASES = H1.filter((c) => ['A13', 'A14', 'L14'].includes(c.id)).map((c) => ({ ...c, id: c.id + 'f', seed: { ...(c.seed ?? {}), fitness: { weight: 80 } } }))
