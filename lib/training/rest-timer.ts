/**
 * Seconds left on a rest that ends at `endsAt` (epoch ms), read from the clock
 * rather than counted down, so a throttled or backgrounded tab never drifts.
 */
export function restRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
