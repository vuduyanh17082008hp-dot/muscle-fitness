/**
 * Deterministic seeded PRNG (mulberry32) — used ONLY to generate demo
 * fixture data (wearable scenarios). Given the same seed string, it
 * always produces the same sequence, so a demo scenario looks
 * identical across repeated page loads/tests rather than jittering
 * randomly on every request. Never used for anything security-related.
 */

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random number in [min, max]. */
export function seededRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
