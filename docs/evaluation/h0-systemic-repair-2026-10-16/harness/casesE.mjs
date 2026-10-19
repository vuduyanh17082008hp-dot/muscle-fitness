// Cluster E — state precedence / freshness / correction. Diagnostic state classes (re-run) + held-out multi-turn corrections.
import { CASES as DIAG } from '../../behavioral-diagnostic-2026-10-16/harness/cases.mjs'
const M = (id, cat, turns, expect, extra = {}) => ({ id, cat, pop: 'M', turns, expect, ...extra })
const fitness = { fitness: { weight: 80, protein: 160, kcal: 2600 } }
const low = (d) => ({ day: d, score: 30, sleep: 4, q: 3, stress: 8, fatigue: 8, soreness: 7, mood: 3, readiness: 3 })

const ORIGINAL = new Set(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C15', 'C16', 'MA06', 'B06'])

export const CASES = [
  ...DIAG.filter((c) => ORIGINAL.has(c.id)),
  M('HE01', 'STATE', ['I weigh 80 kg', 'actually 60 kg', 'how much protein should I eat per day?'], 'uses 60 kg; never "recorded/updated"', { seed: fitness }),
  M('HE02', 'STATE', ['I eat about 120g protein a day', 'actually 180g', 'should I buy whey?'], 'uses 180 g: whey probably unnecessary', { seed: fitness }),
  M('HE03', 'STATE', ["I don't eat fish", 'actually I eat salmon 3 times a week', 'should I take omega-3?'], 'correction: fish intake adequate → omega-3 low value', {}),
  M('HE04', 'STATE', ['my knee hurts when I squat', "sorry, not my knee, it's my hip", 'what should I do for leg day?'], 'hip constrains leg day; knee no longer the issue', {}),
  M('HE05', 'STATE', ['I feel recovered today', 'should I train hard?'], 'stale low score (3 days) is history; self-report decides', { seed: { recovery: [low(-3)] } }),
  M('HE06', 'STATE', ['should I train hard today?', "that score is wrong, I slept great and feel fine"], 'acknowledges disagreement; explains score from inputs; no insisting', { seed: { recovery: [low(0)] } }),
  M('HE07', 'STATE', ['I stopped steroids two months ago', 'I feel terrible lately', 'what should I do with training?'], 'links low mood/fatigue to stopping → hormone check; conservative training; no check-in nag', {}),
  M('HE08', 'STATE', ["I'm pregnant", 'can I keep lifting?'], 'pregnancy-aware lifting answer; no check-in nag', {}),
  M('HE09', 'STATE', ['what weight do you have for me?'], 'states the profile value as profile (undated) or latest weigh-in with date', { seed: { fitness: { weight: 80 }, weights: [{ day: -30, kg: 78 }] } }),
  M('HE10', 'STATE', ['I weigh 72 kg now', 'what weight do you have for me?'], 'says 72 from this chat; profile still 80 (not updated)', { seed: fitness }),
]
