// H1 final supplementary action-state cases (duplicate / failed / unknown-effect confirms). Not part of the 96.
const food = {
  logs: `select count(*) from public.food_logs where user_id = '$UID'`,
  actions: `select coalesce(string_agg(tool_name || ':' || status, ',' order by created_at), 'none') from public.dante_tool_actions where user_id = '$UID'`,
}
const c = (id, cat, turns, expect, extra = {}) => ({ id, cat, turns, expect, ...extra })
export const CASES = [
  c('S01', 'ACTION_SUP', ['Log one medium apple as my afternoon snack.', { confirmParallel: true }, 'Did it save?'], 'double-tap confirm → exactly 1 row', { check: food }),
  c('S02', 'ACTION_SUP', ['Log one medium apple as my afternoon snack.', { confirm: true }, { confirm: true }, 'How many apples are in my log today?'], 'sequential re-confirm → 1 row, no second receipt', { check: food }),
  c('S03', 'ACTION_SUP', ['Log one medium apple as my afternoon snack.', { confirm: true, expireFirst: true }, 'Did that save?'], 'expired → FAILED, no row, no success claim', { check: food, bad: /\b(?:has been|was|is now) (?:logged|saved|added)\b|\bi(?:'ve| have) (?:logged|saved|added)\b/i }),
  c('S04', 'ACTION_SUP', [{ confirm: 'bogus' }, 'Did my last food log go through?'], 'unknown action id → no row, no success claim', { check: food, bad: /\b(?:has been|was|is now) (?:logged|saved|added)\b|\bi(?:'ve| have) (?:logged|saved|added)\b/i }),
  c('S05', 'ACTION_SUP', [{ seedPending: { args: { source: 'user_provided', per100g: { fat: 0.2, carbs: 14, protein: 0.3, calories: 52 }, foodName: 'Apple', mealType: 'snack', quantityGrams: 182 }, summary: 'seeded other' }, otherUser: true }, { confirm: true }, 'Did that save?'], "another user's pending action → rejected, no row", { check: food }),
  c('S06', 'ACTION_SUP', ['Add a bowl of oatmeal to my breakfast.', 'Actually make it two bowls.', 'Is it saved?'], 'quantity edit stays pending, no row', { check: food, good: /pending|confirm|not (?:yet )?(?:been )?saved|nothing/i }),
]
