import { CASES as ALL } from './cases.mjs'
const filter = new RegExp(process.env.CODEX_CASE_FILTER ?? '.*')
export const CASES = ALL.filter((c) => filter.test([c.id, c.cat, ...(c.tags ?? [])].join(' ')))
if (!CASES.length) throw new Error('Independent evaluation batch selected no cases')
