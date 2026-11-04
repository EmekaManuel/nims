/** Seeded RNG (mulberry32) so a sim run is reproducible. */
export interface Rng {
  next(): number; // [0,1)
  int(lo: number, hi: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
  /** The generator's internal state, so a saved game can carry on exactly where it stopped. */
  state(): number;
}

/** `restore` resumes from a state() value saved earlier (the seed is then ignored). */
export function makeRng(seed: number, restore?: number): Rng {
  let a = (restore ?? seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    state: () => a,
  };
}
