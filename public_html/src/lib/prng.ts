/**
 * Deterministic PRNG (mulberry32) — small, fast, deterministic.
 *
 * Used by per-feature mock stores (in `project-features.ts`) so the same
 * projectId always yields the same fake data. The dashboard now reads
 * from real APIs and no longer uses this PRNG, but the feature pages
 * still do.
 *
 * This module is the single source of truth for the seed + PRNG so
 * `mock-project-data.ts` could be deleted without breaking consumers.
 */

/** Hash a projectId into a 32-bit unsigned integer seed. */
export function hashSeed(projectId: number | string): number {
  const s = String(projectId)
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

/** mulberry32 — returns a function that yields [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
