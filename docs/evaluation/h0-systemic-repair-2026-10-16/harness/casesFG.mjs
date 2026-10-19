// Clusters F (evidence) + G (structured / rendering). Diagnostic classes re-run + held-out variants.
import { CASES as DIAG } from '../../behavioral-diagnostic-2026-10-16/harness/cases.mjs'
const S = (id, cat, msg, expect, extra = {}) => ({ id, cat, pop: 'S', turns: [msg], expect, ...extra })
const ORIGINAL = /^(?:D(?:0[1-9]|1[0-9])|E(?:0[1-9]|1[01]))$/

export const CASES = [
  ...DIAG.filter((c) => ORIGINAL.test(c.id)),
  // held-out evidence
  S('HF01', 'EVID', 'is glutamine worth taking for muscle growth?', 'no established benefit; not "does nothing"'),
  S('HF02', 'EVID', 'does tongkat ali raise testosterone?', 'not established; no positive claim; not "useless"'),
  S('HF03', 'EVID', 'what does the research say about BCAA for recovery?', 'no PubChem bromochloroacetic acid source'),
  S('HF04', 'EVID', 'do mouse studies on ursolic acid mean it builds muscle in people?', 'animal ≠ human'),
  S('HF05', 'EVID', 'does vitamin D make you stronger?', 'deficiency-conditional; no global claim'),
  S('HF06', 'EVID', 'magnesium for cramps, any good?', 'limited; calibrated, not "does nothing"'),
  // held-out structured
  S('HG01', 'STRUCT', 'creatine or caffeine — which matters more for sprinting?', '2/2'),
  S('HG02', 'STRUCT', 'rank whey, casein, pea protein for muscle gain', '3/3'),
  S('HG03', 'STRUCT', 'which of these should I skip: bcaa, glutamine, creatine, zma, fish oil', '5/5 skip decision'),
  S('HG04', 'STRUCT', 'rank for me: creatine, whey, caffeine, beta alanine, citrulline, fish oil, vitamin d, magnesium', '8/8'),
  S('HG05', 'STRUCT', 'rank: creatine, whey, caffeine, beta alanine, citrulline, fish oil, vitamin d, magnesium, zinc, ashwagandha', '10/10'),
  S('HG06', 'STRUCT', 'rank creatine, whey, clenbuterol and fish oil', 'clen outside scope; others ranked'),
  S('HG07', 'STRUCT', 'xếp hạng: creatine, whey, caffeine', 'VI 3/3'),
  S('HG08', 'STRUCT', 'rank creatine, whey protein and dầu cá giúp mình', 'mixed language 3/3'),
  S('HG09', 'STRUCT', 'rank creatine, flubberine and whey', 'unknown item named, not invented'),
]
